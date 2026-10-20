'use strict';
// Integration regression test: real isolated Electron renderer, no Firebase requests.
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "Astral регистрация ' "));
app.setPath('userData', path.join(fixture, 'profile'));
app.whenReady().then(async () => {
  const html = path.join(fixture, 'index.html').replace(/^[A-Z]:/, drive => drive.toLowerCase());
  fs.writeFileSync(html, '<!doctype html><title>IPC regression</title>');
  const win = new BrowserWindow({ show: false, webPreferences: {
    preload: path.resolve(__dirname, '../src/preload.cjs'), sandbox: true,
    contextIsolation: true, nodeIntegration: false
  } });
  ipcMain.handle('astral:register', event => {
    const oldAccepts = event.sender === win.webContents && event.senderFrame === win.webContents.mainFrame && event.senderFrame.url === pathToFileURL(html).href;
    console.log(JSON.stringify({ oldAccepts, sameFrame: event.senderFrame === win.webContents.mainFrame, actual: event.senderFrame.url, expected: pathToFileURL(html).href }));
    const guard = require('../src/ipc-source.cjs').isTrustedSender;
    return { ok: guard(event, win, html) };
  });
  await win.loadFile(html);
  const reply = await win.webContents.executeJavaScript('window.astral.register({})');
  assert.equal(reply.ok, true);
  await win.webContents.executeJavaScript("location.hash = 'register'");
  assert.equal((await win.webContents.executeJavaScript('window.astral.register({})')).ok, true);
  win.destroy();
  console.log('PASS: registration IPC from a path containing Cyrillic, spaces and apostrophes');
  app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
