'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { download, allowedURL } = require('./download.cjs');
const { hashFile } = require('./install.cjs');
const FEED = 'https://github.com/FadeVIP/astral-launcher-downloads/releases/latest/download/astral-launcher-update.json';
const PREVIEW_FEED = 'https://github.com/FadeVIP/astral-launcher-downloads/releases/download/preview/astral-launcher-update.json';
const RELEASES = 'https://github.com/FadeVIP/astral-launcher-downloads/releases/download/';
function versionParts(value) {
  if (typeof value !== 'string' || !/^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/.test(value)) throw Error('Некорректная версия лаунчера.');
  return value.split('.').map(Number);
}
function newer(a, b) {
  const left = versionParts(a), right = versionParts(b);
  for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return left[i] > right[i];
  return false;
}
function verifyRelease(envelope, publicKey) {
  if (!envelope || typeof envelope.payload !== 'string' || envelope.payload.length > 16384 || typeof envelope.signature !== 'string') throw Error('Повреждены сведения об обновлении.');
  const bytes = Buffer.from(envelope.payload, 'base64');
  if (!crypto.verify(null, bytes, publicKey, Buffer.from(envelope.signature, 'base64'))) throw Error('Подлинность обновления не подтверждена.');
  const release = JSON.parse(bytes.toString('utf8'));
  versionParts(release.version);
  if (release.schema !== 1 || release.type !== 'astral-launcher-update' || release.platform !== 'win32' || release.arch !== 'x64' || !Number.isSafeInteger(release.bytes) || release.bytes < 2 || release.bytes > 512 * 1024 ** 2 || !/^[a-f0-9]{64}$/.test(release.sha256) || release.url !== `${RELEASES}v${release.version}/Astral-Launcher-${release.version}-x64-signed.exe`) throw Error('Неподходящее обновление лаунчера.');
  return release;
}
async function fetchRelease(fetcher = fetch, channel='stable') {
  let url = channel==='preview'?PREVIEW_FEED:FEED;
  const signal = AbortSignal.timeout(30000);
  for (let i = 0; i < 8; i++) {
    allowedURL(url);
    const response = await fetcher(url, { redirect: 'manual', signal });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const next = response.headers.get('location'); await response.body?.cancel();
      if (!next) throw Error('Пустой адрес обновления.');
      url = new URL(next, url).href; continue;
    }
    if(channel==='preview'&&response.status===404){await response.body?.cancel();return null;}
    if (!response.ok) { await response.body?.cancel(); throw Error('Сервер обновлений временно недоступен.'); }
    const chunks = []; let length = 0;
    for await (const chunk of response.body) { length += chunk.length; if (length > 24576) throw Error('Слишком большой ответ обновления.'); chunks.push(chunk); }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }
  throw Error('Слишком много перенаправлений.');
}
class LauncherUpdater {
  constructor({ currentVersion, directory, publicKey, target, supported, emit = () => {}, fetcher = fetch, channel='stable' }) {
    Object.assign(this, { currentVersion, directory, publicKey, target, supported, emit, fetcher });
    this.channel=channel==='preview'?'preview':'stable';
    this.state = { status: supported ? 'idle' : 'unsupported', message: supported ? 'Проверка при запуске' : 'Автообновление доступно в EXE для Windows.' };
    this.pending = null; this.job = null;
  }
  set(state) { this.state = state; this.emit(state); return state; }
  check() {
    if (!this.supported || this.state.status === 'installing') return Promise.resolve(this.state);
    if (this.job) return this.job;
    this.job = this.checkAndDownload().finally(() => { this.job = null; });
    return this.job;
  }
  async checkAndDownload() {
    const previous = this.pending;
    this.set({ status: 'checking', message: 'Проверяем обновления лаунчера…' });
    try {
      let release = verifyRelease(await fetchRelease(this.fetcher), this.publicKey);
      if(this.channel==='preview'){const envelope=await fetchRelease(this.fetcher,'preview');if(envelope){const candidate=verifyRelease(envelope,this.publicKey);if(newer(candidate.version,release.version))release=candidate;}}
      if (!newer(release.version, this.currentVersion)) {
        this.pending = null;
        return this.set({ status: 'current', message: 'Установлена актуальная версия ' + this.currentVersion });
      }
      const destination = path.join(this.directory, `launcher-${release.version}-${release.sha256}.exe`);
      if (!await this.validFile(destination, release)) {
        this.set({ status: 'downloading', version: release.version, percent: 0, message: 'Скачиваем лаунчер ' + release.version });
        await download({ url: release.url, destination, expectedBytes: release.bytes, sha256: release.sha256, format: 'exe', fetcher: this.fetcher,
          onProgress: p => this.set({ status: 'downloading', version: release.version, percent: Math.floor(p.received / release.bytes * 100), message: 'Скачиваем лаунчер ' + release.version }) });
      }
      this.pending = { release, destination };
      return this.set({ status: 'ready', version: release.version, message: `Версия ${release.version} готова. Обновить после выхода из игры.` });
    } catch (error) {
      // A temporary network failure must not discard a previously verified update.
      if (previous && await this.validFile(previous.destination, previous.release)) {
        this.pending = previous;
        return this.set({ status: 'ready', version: previous.release.version, message: 'Ранее скачанное обновление готово к установке.' });
      }
      this.pending = null;
      return this.set({ status: 'error', message: error.name === 'TimeoutError' ? 'Проверка обновлений заняла слишком много времени.' : error.message });
    }
  }
  async validFile(file, release) {
    try { return (await fs.stat(file)).size === release.bytes && await hashFile(file) === release.sha256; } catch { return false; }
  }
  async startup() {
    const state = await this.check();
    if (state.status !== 'ready') return false;
    await this.launchInstaller();
    return true;
  }
  async prepareInstall() {
    if (!this.supported || this.state.status !== 'ready' || !this.pending) throw Error('Обновление ещё не готово.');
    const pending = this.pending;
    this.set({ ...this.state, status: 'installing', message: 'Готовим перезапуск лаунчера…' });
    try {
      if (!await this.validFile(pending.destination, pending.release)) throw Error('Файл обновления изменился. Проверьте обновления ещё раз.');
      if (!path.isAbsolute(this.target) || path.extname(this.target).toLowerCase() !== '.exe') throw Error('Не удалось определить исходный EXE лаунчера.');
      const targetInfo = await fs.lstat(this.target);
      if (!targetInfo.isFile() || targetInfo.isSymbolicLink()) throw Error('Не удалось определить исходный EXE лаунчера.');
      const id = crypto.randomUUID();
      const stage = path.join(path.dirname(this.target), '.astral-update-' + id + '.exe');
      // Test actual directory write access before closing the running launcher.
      await fs.writeFile(stage, '', { flag: 'wx' }); await fs.unlink(stage);
      const jobDir = await fs.mkdtemp(path.join(this.directory, 'apply-'));
      const helper = path.join(jobDir, 'apply.exe'), jobFile = path.join(jobDir, 'job.json');
      await fs.copyFile(path.join(__dirname, '../assets/launcher-update-helper.exe'), helper);
      const job = { parentPid: process.pid, source: pending.destination, target: this.target, stage,
        backup: this.target + '.previous-' + id, sha256: pending.release.sha256, bytes: pending.release.bytes, restart: true };
      await fs.writeFile(jobFile, JSON.stringify(job), { flag: 'wx' });
      return { helper, jobFile };
    } catch (error) { this.set({ ...this.state, status: 'ready', message: error.message }); throw error; }
  }
  async launchInstaller() {
    const { helper, jobFile } = await this.prepareInstall();
    try {
      // A GUI executable needs no console and can remain detached while the
      // portable launcher exits. PowerShell can silently quit in this mode.
      const log = await fs.open(jobFile + '.log', 'a');
      let child, exited = false;
      try {
        child = spawn(helper, [jobFile], { detached: true, windowsHide: true, stdio: ['ignore', log.fd, log.fd] });
        child.once('exit', () => { exited = true; });
        await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
      } finally { await log.close(); }
      // Keep the old launcher open until the helper has verified its job and is
      // waiting for us. A blocked PowerShell must not close a working launcher.
      const deadline = Date.now() + 20000;
      while (!await fs.access(jobFile + '.ready').then(() => true, () => false)) {
        if (exited || Date.now() >= deadline) {
          child.kill();
          const result = await fs.readFile(jobFile + '.result', 'utf8').catch(() => '');
          throw Error(result.startsWith('FAILED: ') ? 'Ошибка установки: ' + result.slice(8, 408) : 'Не удалось подготовить замену лаунчера. Диагностика сохранена в папке launcher-updates.');
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      child.unref();
    } catch (error) { this.set({ ...this.state, status: 'ready', message: 'Не удалось запустить обновление. Попробуйте ещё раз.' }); throw error; }
  }
}
module.exports = { LauncherUpdater, verifyRelease, newer, fetchRelease };
