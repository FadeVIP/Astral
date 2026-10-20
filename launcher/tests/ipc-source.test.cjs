'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { isTrustedSender } = require('../src/ipc-source.cjs');
const uiPath = path.resolve('launcher/ui/index.html');
function fixture(url = pathToFileURL(uiPath).href) {
  const main = { processId: 10, routingId: 1, parent: null, url };
  const contents = { mainFrame: main };
  return { event: { sender: contents, senderFrame: { ...main } }, window: { webContents: contents, isDestroyed: () => false } };
}
test('accepts the exact local main frame with equivalent URL encodings and fragment', () => {
  for (const url of [pathToFileURL(uiPath).href, pathToFileURL(uiPath).href.replace('index.html', '%69ndex.html'), pathToFileURL(uiPath).href + '#register']) {
    const { event, window } = fixture(url);
    assert.equal(isTrustedSender(event, window, uiPath), true);
  }
  if (process.platform === 'win32') {
    const { event, window } = fixture(pathToFileURL(uiPath).href.replace('C:', 'c:'));
    assert.equal(isTrustedSender(event, window, uiPath), true);
  }
});
test('rejects remote, inherited-origin, different-file and query URLs', () => {
  for (const url of ['https://astral-delta-gules.vercel.app/', 'about:blank', 'data:text/html,hi', 'file://other-host/share/index.html', pathToFileURL(uiPath + '.evil').href, pathToFileURL(uiPath).href + '?redirect=evil', 'invalid']) {
    const { event, window } = fixture(url);
    assert.equal(isTrustedSender(event, window, uiPath), false, url);
  }
});
test('rejects other windows, subframes and destroyed or stale senders', () => {
  for (const change of [f => f.event.sender = {}, f => f.event.senderFrame = null, f => f.event.senderFrame.parent = {}, f => f.event.senderFrame.routingId++, f => f.event.senderFrame.processId++, f => f.event.senderFrame.detached = true, f => f.window.isDestroyed = () => true]) {
    const f = fixture(); change(f);
    assert.equal(isTrustedSender(f.event, f.window, uiPath), false);
  }
  assert.equal(isTrustedSender({}, null, uiPath), false);
});
