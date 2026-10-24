'use strict';
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { Readable, Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');

const MAX_ARCHIVE = 12 * 1024 ** 3;
function allowedURL(input) {
  const url = new URL(input);
  const host = url.hostname;
  if (url.protocol !== 'https:' || url.username || url.password ||
      !(['cdn.modrinth.com', 'drive.google.com', 'drive.usercontent.google.com', 'github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com', 'maven.minecraftforge.net'].includes(host) || host.endsWith('.googleusercontent.com'))) {
    throw new Error('Недопустимый адрес загрузки.');
  }
  return url;
}
function decode(text) {
  return text.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}
function driveConfirmation(html, fileId) {
  const form = html.match(/<form\b[^>]*id=["']download-form["'][^>]*>[\s\S]*?<\/form>/i);
  if (!form) throw new Error('Google Drive не отдал архив. Проверьте доступ «Все, у кого есть ссылка» и лимит скачиваний.');
  const action = form[0].match(/\baction=["']([^"']+)["']/i);
  const url = allowedURL(decode(action?.[1] || ''));
  if (url.hostname !== 'drive.usercontent.google.com') throw new Error('Неизвестная страница подтверждения Google Drive.');
  for (const tag of form[0].matchAll(/<input\b[^>]*>/gi)) {
    const attrs = Object.fromEntries([...tag[0].matchAll(/([\w-]+)\s*=\s*["']([^"']*)["']/g)].map(m => [m[1], decode(m[2])]));
    if (['id', 'export', 'confirm', 'uuid'].includes(attrs.name)) url.searchParams.set(attrs.name, attrs.value);
  }
  if (url.searchParams.get('id') !== fileId) throw new Error('Google Drive вернул другой файл.');
  return url.toString();
}
async function request(url, signal, fetcher = fetch) {
  for (let redirects = 0; redirects < 8; redirects++) {
    allowedURL(url);
    const headerTimeout = new AbortController();
    const timer = setTimeout(() => headerTimeout.abort(new Error('Сервер слишком долго не отвечает. Повторите загрузку.')), 90000);
    let response;
    try {
      response = await fetcher(url, {
        signal: AbortSignal.any([signal, headerTimeout.signal]), redirect: 'manual',
        headers: { 'User-Agent': 'AstralLauncher/0.1.0', 'Accept-Encoding': 'identity' }
      });
    } finally { clearTimeout(timer); }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location) throw new Error('Сервер вернул пустое перенаправление.');
      url = new URL(location, url).toString();
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(response.status === 403 || response.status === 429
        ? 'Скачивание временно ограничено. Проверьте доступ к Google Drive или повторите позже.'
        : `Ошибка загрузки: HTTP ${response.status}.`);
    }
    return response;
  }
  throw new Error('Слишком много перенаправлений при загрузке.');
}
async function readLimited(body, limit) {
  const parts = []; let size = 0;
  for await (const chunk of Readable.fromWeb(body)) {
    size += chunk.length;
    if (size > limit) throw new Error('Неожиданный ответ сервера загрузки.');
    parts.push(chunk);
  }
  return Buffer.concat(parts).toString('utf8');
}
async function download({ url, driveFileId, destination, expectedBytes, sha256, format = 'zip', allowEmpty = false, signal = new AbortController().signal, onProgress = () => {}, fetcher }) {
  if (!['zip', 'exe', 'data'].includes(format)) throw new Error('Неизвестный формат загрузки.');
  if (driveFileId && !/^[\w-]{10,150}$/.test(driveFileId)) throw new Error('Некорректная ссылка Google Drive.');
  url = driveFileId ? `https://drive.google.com/uc?export=download&id=${driveFileId}` : url;
  await fsp.mkdir(path.dirname(destination), { recursive: true });
  const partial = destination + '.part';
  try {
    let response = await request(url, signal, fetcher);
    if (driveFileId && /text\/html/i.test(response.headers.get('content-type') || '')) {
      const html = await readLimited(response.body, 1024 * 1024);
      response = await request(driveConfirmation(html, driveFileId), signal, fetcher);
    }
    if ((format === 'data' ? /text\/html/i : /text\/html|application\/json/i).test(response.headers.get('content-type') || '')) {
      await response.body?.cancel();
      throw new Error('Вместо ZIP получена страница Google Drive. Проверьте доступ или повторите позже.');
    }
    const declared = Number(response.headers.get('content-length')) || 0;
    if (declared > MAX_ARCHIVE || (expectedBytes && declared && declared !== expectedBytes)) {
      await response.body?.cancel();
      throw new Error('Размер архива изменился. Нужна актуальная версия лаунчера.');
    }
    const hash = crypto.createHash('sha256');
    let idleTimer;
    const armIdleTimer = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => meter.destroy(new Error('Загрузка остановилась: сервер не передаёт данные. Повторите попытку.')), 120000);
    };
    let received = 0; const started = Date.now(); let lastReport = 0;
    const meter = new Transform({ transform(chunk, encoding, callback) {
      armIdleTimer();
      received += chunk.length;
      if (received > MAX_ARCHIVE || (expectedBytes && received > expectedBytes)) return callback(new Error('Превышен ожидаемый размер архива.'));
      hash.update(chunk);
      if (Date.now() - lastReport > 120) {
        lastReport = Date.now();
        onProgress({ received, total: declared || expectedBytes || 0, speed: received / Math.max(1, (Date.now() - started) / 1000) });
      }
      callback(null, chunk);
    }});
    armIdleTimer();
    try { await pipeline(Readable.fromWeb(response.body), meter, fs.createWriteStream(partial), { signal }); }
    finally { clearTimeout(idleTimer); }
    if ((!received && !(format === 'data' && allowEmpty)) || (declared && declared !== received) || (expectedBytes !== undefined && expectedBytes !== received)) throw new Error('Архив скачан не полностью. Повторите загрузку.');
    const digest = hash.digest('hex');
    if (sha256 && digest !== sha256.toLowerCase()) throw new Error('Контрольная сумма не совпала. Файл не будет установлен.');
    const handle = await fsp.open(partial, 'r');
    const signature = Buffer.alloc(4);
    try { await handle.read(signature, 0, 4, 0); } finally { await handle.close(); }
    if (format === 'zip' && !signature.equals(Buffer.from([80, 75, 3, 4]))) throw new Error('Скачанный файл не является ZIP-архивом.');
    if (format === 'exe' && signature.subarray(0, 2).toString() !== 'MZ') throw new Error('Скачанный файл не является приложением Windows.');
    await fsp.rename(partial, destination);
    onProgress({ received, total: received, speed: 0 });
    return { bytes: received, sha256: digest };
  } catch (error) {
    await fsp.rm(partial, { force: true }).catch(() => {});
    throw error;
  }
}
module.exports = { download, driveConfirmation, allowedURL };
