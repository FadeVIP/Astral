'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const ROOT = 'projects/astral-524a1/databases/(default)/documents/';
class DataError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
function documentPath(name) {
  if (typeof name !== 'string' || !name.startsWith(ROOT)) throw new DataError(400, 'Invalid document name');
  const value = name.slice(ROOT.length), parts = value.split('/');
  if (parts.length % 2 || parts.length > 20 || parts.some(p => !p || p === '.' || p === '..' || p.length > 1500 || /[\x00-\x1f]/.test(p))) throw new DataError(400, 'Invalid document path');
  return value;
}
function wire(row) { return row ? { name: ROOT + row.path, fields: row.fields, createTime: row.create_time, updateTime: row.update_time } : null; }
function validateFields(fields, depth = 0) {
  if (!fields || Array.isArray(fields) || typeof fields !== 'object' || depth > 20) throw new DataError(400, 'Invalid fields');
  for (const [key, v] of Object.entries(fields)) {
    if (!key || ['__proto__','prototype','constructor'].includes(key) || !v || typeof v !== 'object' || Object.keys(v).length !== 1) throw new DataError(400, 'Invalid field');
    if ('stringValue' in v && typeof v.stringValue === 'string') continue;
    if ('booleanValue' in v && typeof v.booleanValue === 'boolean') continue;
    if ('integerValue' in v && /^-?\d+$/.test(String(v.integerValue)) && Number.isSafeInteger(Number(v.integerValue))) continue;
    if ('doubleValue' in v && typeof v.doubleValue === 'number' && Number.isFinite(v.doubleValue)) continue;
    if ('nullValue' in v && v.nullValue === null) continue;
    if ('timestampValue' in v && typeof v.timestampValue === 'string' && Number.isFinite(Date.parse(v.timestampValue))) continue;
    if ('mapValue' in v) { validateFields(v.mapValue.fields || {}, depth + 1); continue; }
    if ('arrayValue' in v && Array.isArray(v.arrayValue.values || [])) { for (const x of v.arrayValue.values || []) validateFields({ item: x }, depth + 1); continue; }
    throw new DataError(400, 'Unsupported value');
  }
}
function precondition(old, condition) {
  if (!condition) return;
  if (Object.keys(condition).length !== 1) throw new DataError(400, 'Invalid precondition');
  if ('exists' in condition) { if (typeof condition.exists !== 'boolean') throw new DataError(400, 'Invalid precondition'); if (!!old !== condition.exists) throw new DataError(409, 'Document changed'); }
  else if ('updateTime' in condition) { if (!old || condition.updateTime !== old.updateTime) throw new DataError(409, 'Document changed'); }
  else throw new DataError(400, 'Invalid precondition');
}
function prepare(old, write, time) {
  if (Object.keys(write).some(k => !['update','delete','currentDocument','updateMask','updateTransforms'].includes(k)) || (!!write.update === !!write.delete)) throw new DataError(400, 'Unsupported write');
  precondition(old, write.currentDocument);
  if (write.delete) return null;
  validateFields(write.update.fields || {});
  let fields = structuredClone(write.update.fields || {});
  if (write.updateMask) {
    const mask = write.updateMask.fieldPaths;
    if (!Array.isArray(mask) || mask.some(k => !/^[A-Za-z][A-Za-z0-9_]*$/.test(k))) throw new DataError(400, 'Unsupported field mask');
    fields = structuredClone(old?.fields || {});
    for (const key of mask) { if (Object.hasOwn(write.update.fields || {},key)) fields[key] = write.update.fields[key]; else delete fields[key]; }
  }
  for (const transform of write.updateTransforms || []) {
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(transform.fieldPath) || transform.setToServerValue !== 'REQUEST_TIME' || Object.keys(transform).length !== 2) throw new DataError(400, 'Unsupported transform');
    fields[transform.fieldPath] = { timestampValue: time };
  }
  if (Buffer.byteLength(JSON.stringify(fields)) > 1048576) throw new DataError(413, 'Document too large');
  return { name: write.update.name, fields, createTime: old?.createTime || time, updateTime: time };
}
class DocumentStore {
  constructor(database) { this.db = database; }
  async initialize() { await this.db.exec(await fs.readFile(path.join(__dirname,'schema.sql'),'utf8')); }
  async get(relative, tx = this.db) { return wire((await tx.query('SELECT * FROM astral_documents WHERE path=$1',[documentPath(ROOT + relative)])).rows[0]); }
  async all(tx = this.db) { return (await tx.query('SELECT * FROM astral_documents ORDER BY path')).rows.map(wire); }
  async put(doc, tx) {
    const p = documentPath(doc.name);
    await tx.query('INSERT INTO astral_documents(path,collection_path,fields,create_time,update_time) VALUES($1,$2,$3,$4,$5) ON CONFLICT(path) DO UPDATE SET fields=EXCLUDED.fields,update_time=EXCLUDED.update_time', [p,p.slice(0,p.lastIndexOf('/')),JSON.stringify(doc.fields),doc.createTime,doc.updateTime]);
  }
  async importSnapshot(snapshot, sourceHash) {
    if (snapshot.project !== 'astral-524a1' || !Array.isArray(snapshot.documents) || !/^[a-f0-9]{64}$/.test(sourceHash)) throw new Error('Invalid snapshot');
    const seen = new Set();
    for (const d of snapshot.documents) { const p = documentPath(d.name); if (seen.has(p)) throw new Error('Duplicate document'); seen.add(p); validateFields(d.fields || {}); if (!d.createTime || !d.updateTime) throw new Error('Missing version'); }
    return this.db.transaction(async tx => {
      if ((await tx.query('SELECT 1 FROM astral_documents LIMIT 1')).rows.length) throw new Error('Import requires an empty database; refusing to overwrite live data');
      for (const d of snapshot.documents) await this.put({...d,fields:d.fields || {}},tx);
      await tx.query('INSERT INTO astral_migrations(id,document_count,source_sha256,source_consistent) VALUES($1,$2,$3,$4)', [crypto.randomUUID(),seen.size,sourceHash,snapshot.consistentPointInTime === true]);
      return seen.size;
    });
  }
  async commit(writes, authorize, { requireAuthority = true } = {}) {
    if (!Array.isArray(writes) || writes.length < 1 || writes.length > 100) throw new DataError(400, 'Invalid batch');
    return this.db.transaction(async tx => {
      // One writer at a time; authorization reads and writes share this transaction.
      await tx.query("SELECT pg_advisory_xact_lock(174233,1)");
      if (requireAuthority && (await tx.query("SELECT value FROM astral_control WHERE key='authority'")).rows[0]?.value !== 'sql') throw new DataError(503, 'SQL is not authoritative yet');
      const before = new Map((await this.all(tx)).map(d => [documentPath(d.name),d])), after = new Map(before), changes = [], visited = new Set();
      // Microsecond timestamp from PostgreSQL prevents same-millisecond lost updates.
      const time = (await tx.query("SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS value")).rows[0].value;
      for (const w of writes) {
        const p = documentPath(w.update?.name || w.delete);
        if (visited.has(p)) throw new DataError(400, 'Duplicate write'); visited.add(p);
        const next = prepare(before.get(p),w,time);
        if (next) after.set(p,next); else after.delete(p);
        changes.push({path:p,before:before.get(p) || null,after:next,write:w});
      }
      // No write is executed until every operation has passed policy validation.
      await authorize({before,after,changes,time});
      for (const c of changes) {
        if (c.after) await this.put(c.after,tx); else await tx.query('DELETE FROM astral_documents WHERE path=$1',[c.path]);
        await tx.query('INSERT INTO astral_outbox(document_path) VALUES($1)',[c.path]);
      }
      return {commitTime:time,writeResults:changes.map(c => ({updateTime:time,transformResults:(c.write.updateTransforms || []).map(() => ({timestampValue:time}))}))};
    });
  }
}
function postgres(url, options = {}) {
  const {Pool} = require('pg');
  const pool = new Pool({connectionString:url,max:3,connectionTimeoutMillis:5000,idleTimeoutMillis:30000,...options});
  return {
    query: (...args) => pool.query(...args), exec: sql => pool.query(sql), close: () => pool.end(),
    async transaction(fn) {
      const c = await pool.connect();
      try { await c.query('BEGIN'); await c.query("SET LOCAL statement_timeout = '15s'"); const value = await fn(c); await c.query('COMMIT'); return value; }
      catch (error) { await c.query('ROLLBACK'); throw error; }
      finally { c.release(); }
    }
  };
}
module.exports = {DocumentStore,postgres,ROOT,documentPath,validateFields,DataError,wire};
