'use strict';
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const yauzl = require('yauzl');
const { pipeline } = require('node:stream/promises');

function safeDestination(root, name) {
  if (!name || /[\\:\x00-\x1f]/.test(name) || name.startsWith('/') || name.split('/').some(p => p === '..' || p === '.' || /[. ]$/.test(p) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p))) throw new Error('Небезопасный путь внутри ZIP: ' + name);
  const result = path.resolve(root, name);
  if (!result.startsWith(path.resolve(root) + path.sep)) throw new Error('ZIP выходит за пределы папки установки.');
  return result;
}
function openZip(file) {
  return new Promise((resolve, reject) => yauzl.open(file, { lazyEntries: true, strictFileNames: true, autoClose: true }, (error, zip) => error ? reject(error) : resolve(zip)));
}
async function extractZip(file, destination, { signal = new AbortController().signal, onProgress = () => {}, only, prefix = '' } = {}) {
  if (prefix) safeDestination(destination, prefix);
  await fsp.mkdir(destination, { recursive: true });
  const zip = await openZip(file);
  if (zip.entryCount > 60000) { zip.close(); throw new Error('В архиве слишком много файлов.'); }
  let expanded = 0; let count = 0; const seen = new Set();
  await new Promise((resolve, reject) => {
    let settled = false;
    let processing = false;
    const finish = error => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', abort);
      if (error) { zip.close(); reject(error); } else resolve();
    };
    const abort = () => {
      // Let the active pipeline close its file handle before the caller removes staging.
      if (processing) zip.close();
      else finish(new DOMException('Установка отменена', 'AbortError'));
    };
    signal.addEventListener('abort', abort, { once: true });
    zip.on('error', finish);
    zip.on('end', () => finish());
    zip.on('entry', async entry => {
      processing = true;
      try {
        signal.throwIfAborted();
        const original = safeDestination(destination, entry.fileName);
        const key = original.toLowerCase();
        if (seen.has(key)) throw new Error('Дублирующийся путь внутри ZIP.');
        seen.add(key);
        const mode = (entry.externalFileAttributes >>> 16) & 0xf000;
        if (mode === 0xa000 || (mode && mode !== 0x8000 && mode !== 0x4000)) throw new Error('Ссылки и специальные файлы в ZIP запрещены.');
        if (entry.generalPurposeBitFlag & 1) throw new Error('Архив защищён паролем.');
        expanded += entry.uncompressedSize;
        if (expanded > 24 * 1024 ** 3 || entry.uncompressedSize > 8 * 1024 ** 3) throw new Error('Превышен лимит распаковки.');
        const relative = prefix ? entry.fileName.startsWith(prefix) ? entry.fileName.slice(prefix.length) : '' : entry.fileName;
        if (!relative || (only && !only.has(relative))) { count++; processing = false; zip.readEntry(); return; }
        const target = safeDestination(destination, relative);
        if (entry.fileName.endsWith('/')) await fsp.mkdir(target, { recursive: true });
        else {
          await fsp.mkdir(path.dirname(target), { recursive: true });
          const input = await new Promise((resolveStream, rejectStream) => zip.openReadStream(entry, (error, stream) => error ? rejectStream(error) : resolveStream(stream)));
          await pipeline(input, fs.createWriteStream(target, { flags: 'wx' }), { signal });
        }
        count++;
        onProgress({ count, total: zip.entryCount });
        signal.throwIfAborted();
        processing = false;
        if (!settled) zip.readEntry();
      } catch (error) { finish(error); }
    });
    if (signal.aborted) abort(); else zip.readEntry();
  });
}
module.exports = { safeDestination, extractZip };
