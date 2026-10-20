'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const keyFile = path.join(root, '../server/minepass/dist/launcher-update-private.pem');
if (!fs.existsSync(keyFile)) {
  fs.mkdirSync(path.dirname(keyFile), { recursive: true });
  const { privateKey } = crypto.generateKeyPairSync('ed25519');
  fs.writeFileSync(keyFile, privateKey.export({ type: 'pkcs8', format: 'pem' }), { flag: 'wx' });
}
const key = fs.readFileSync(keyFile);
const publicKey = crypto.createPublicKey(key).export({ type: 'spki', format: 'pem' });
const publicFile = path.join(root, 'assets/launcher-update-public.pem');
if (fs.existsSync(publicFile) && fs.readFileSync(publicFile, 'utf8') !== publicKey) throw Error('Launcher signing key changed: existing launchers would reject updates');
fs.writeFileSync(publicFile, publicKey);
if (!process.argv.includes('--public-only')) {
  const version = require('../package.json').version;
  const name = `Astral-Launcher-${version}-x64-signed.exe`;
  const data = fs.readFileSync(path.join(root, 'dist', name));
  const payload = Buffer.from(JSON.stringify({ schema: 1, type: 'astral-launcher-update', version, platform: 'win32', arch: 'x64',
    bytes: data.length, sha256: crypto.createHash('sha256').update(data).digest('hex'),
    url: `https://github.com/FadeVIP/astral-launcher-downloads/releases/download/v${version}/${name}` }));
  const envelope = { payload: payload.toString('base64'), signature: crypto.sign(null, payload, key).toString('base64') };
  require('../src/launcher-update.cjs').verifyRelease(envelope, publicKey);
  fs.writeFileSync(path.join(root, 'dist/astral-launcher-update.json'), JSON.stringify(envelope, null, 2));
  console.log('SIGNED_LAUNCHER_MANIFEST ' + version);
} else console.log('LAUNCHER_PUBLIC_KEY_READY');
