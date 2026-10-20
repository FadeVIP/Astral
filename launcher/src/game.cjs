'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('minecraft-launcher-core');
function offlineProfile(nickname) {
  if (!/^[A-Za-z0-9_]{3,16}$/.test(nickname)) throw new Error('Ник Minecraft: от 3 до 16 латинских букв, цифр или знаков _.');
  const bytes = crypto.createHash('md5').update('OfflinePlayer:' + nickname, 'utf8').digest();
  bytes[6] = (bytes[6] & 0x0f) | 0x30;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return { name: nickname, uuid: bytes.toString('hex'), access_token: '0', client_token: '0', user_properties: '{}', meta: { type: 'mojang' } };
}
function launchOptions(installer, nickname, ramMB) {
  const atmosphere=path.join(installer.gameDirectory,'mods','astral-atmosphere-0.1.0.jar');
  const earlyTheme=(!installer.pack.id||installer.pack.id==='astral')&&installer.pack.minecraft==='1.20.1'&&installer.pack.forge==='47.4.20'&&fs.existsSync(atmosphere);
  const integration=require('./client-features.cjs').supported(installer.pack)&&!require('./client-features.cjs').themed(installer.pack)&&fs.existsSync(atmosphere);
  const customArgs=[...(earlyTheme?['-javaagent:'+atmosphere]:[]),...(integration?['-Dastral.integrationOnly=true']:[]),...require('./lan.cjs').args(installer)];
  return {
    ...(customArgs.length?{customArgs}:{}),
    authorization: offlineProfile(nickname),
    root: require('./pack-base.cjs').isOriginal(installer.pack) ? path.join(installer.root, 'minecraft-runtime') : path.join(installer.root, 'minecraft-runtimes', installer.pack.minecraft + '-' + installer.pack.forge),
    javaPath: installer.javaPath,
    forge: installer.forgePath,
    version: { number: installer.pack.minecraft, type: 'release' },
    memory: { min: '1G', max: `${ramMB}M` },
    window: { width: 1280, height: 720 },
    timeout: 60000,
    overrides: { gameDirectory: installer.gameDirectory, cwd: installer.gameDirectory, detached: false, maxSockets: 6, url: { mavenForge: 'https://maven.minecraftforge.net/' } }
  };
}
async function launchGame(installer, nickname, ramMB, onProgress = () => {}, onClose = () => {}, ClientType = Client) {
  if(require('./portable-pack.cjs').isPortable(installer.pack))return require('./portable-pack.cjs').launchPortable(installer,nickname,ramMB,onProgress,onClose);
  const options = launchOptions(installer, nickname, ramMB);
  // MCLC creates only the leaf directory; custom packs also need its parent.
  fs.mkdirSync(options.root, { recursive: true });
  const client = new ClientType();
  const logs = path.join(installer.root, 'logs');
  fs.mkdirSync(logs, { recursive: true });
  const log = fs.createWriteStream(path.join(logs, 'latest-launch.log'), { flags: 'w' });
  let lastUpdate = 0; let lastError = '';
  client.on('debug', line => {
    // Only offline launch data reaches this module; Firebase credentials never do.
    log.write(String(line) + '\n');
    if (/failed|couldn't|error/i.test(String(line))) lastError = String(line).slice(0, 250);
  });
  client.on('data', line => log.write(String(line)));
  client.on('progress', event => {
    if (Date.now() - lastUpdate > 200) {
      lastUpdate = Date.now();
      onProgress({ phase: 'prepare', message: 'Подготавливаем Minecraft и Forge…', count: event.task, totalFiles: event.total });
    }
  });
  const child = await client.launch(options);
  if (!child) { log.end(); throw new Error('Не удалось подготовить Minecraft. Подробности: logs/latest-launch.log.' + (lastError ? ' Проверьте интернет и наличие Java.' : '')); }
  child.once('error', error => { log.write(error.message); log.end(); onClose(1); });
  child.once('close', code => { log.end(); onClose(code); });
  onProgress({ phase: 'running', message: `Minecraft запущен с ником ${nickname}. Загрузка модов может занять несколько минут.` });
  return child;
}
module.exports = { offlineProfile, launchOptions, launchGame };
