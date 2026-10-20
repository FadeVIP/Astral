'use strict';
const path = require('node:path');
const { fileURLToPath } = require('node:url');

function isTrustedSender(event, window, uiPath) {
  try {
    if (!window || window.isDestroyed()) return false;
    const contents = window.webContents;
    const frame = event.senderFrame;
    const main = contents.mainFrame;
    if (event.sender !== contents || !frame || !main || frame.detached || frame.parent) return false;
    if (frame.processId !== main.processId || frame.routingId !== main.routingId) return false;
    const url = new URL(frame.url);
    if (url.protocol !== 'file:' || url.host || url.search) return false;
    // Chromium may normalize drive-letter case and percent-encoding. Compare the
    // decoded exact file path, while still rejecting other files and subframes.
    const actual = path.resolve(fileURLToPath(url));
    const expected = path.resolve(uiPath);
    return process.platform === 'win32'
      ? actual.toLowerCase() === expected.toLowerCase()
      : actual === expected;
  } catch { return false; }
}

module.exports = { isTrustedSender };
