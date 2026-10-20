// Only browser-facing files are copied; never publish the repository root.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const out = path.join(root, '.render-site');
const files = [
  'public-data.js', 'admin.html', 'bosses.html', 'chat.html', 'codex.html', 'download.html',
  'grimoires.html', 'guide.html', 'index.html', 'quests.html', 'starcatcher.html',
  'community.css', 'easter-egg.css', 'extras.css', 'guide.css', 'minepass-admin.css', 'pack-catalog.css',
  'acoin-admin.js', 'account.html', 'account.js', 'account.css', 'account-api.js', 'account-boot.js', 'cosmetics.html', 'cosmetics-gallery.js', 'cosmetics-shop.js', 'cosmetics-shop.css', 'cosmetics-admin.js', 'assets/cosmetics/art.js', 'assets/cosmetics/LICENSE.txt', 'admin-boot.js', 'chapters_data.js', 'community.js', 'easter-egg-admin.js',
  'easter-egg.js', 'firebase-config.js', 'frostextras.js', 'guides_book_data.js',
  'i18n.js', 'minepass-admin.js', 'minepass-schema.js', 'multiblocks_data.js',
  'multiblocks_textures.js', 'pack-catalog.js', 'recipes_data.js', 'sfx.js',
  'starcatcher_data.js', 'version.js', 'apple-touch-icon.png', 'astral-logo.png',
  'codex.png', 'favicon.ico', 'favicon.png', 'assets/three.min.js', 'assets/orbit_controls.js'
];
if (fs.existsSync(out)) throw Error('Output already exists; use a fresh build directory.');
fs.mkdirSync(out);
let count = 0;
function copy(relative) {
  const source = path.join(root, relative);
  if (!fs.lstatSync(source).isFile()) throw Error('Not a regular file: ' + relative);
  const destination = path.join(out, relative);
  fs.mkdirSync(path.dirname(destination), {recursive: true});
  if (relative.endsWith('.html')) {
    // Vercel Analytics has no endpoint on the independent Render mirror.
    const html = fs.readFileSync(source, 'utf8').replace(/<script\b[^>]*src=["']\/_vercel\/insights\/script\.js["'][^>]*>\s*<\/script>/g, '');
    fs.writeFileSync(destination, html);
  } else fs.copyFileSync(source, destination);
  count++;
}
for (const file of files) copy(file);
function assets(relative) {
  for (const entry of fs.readdirSync(path.join(root, relative), {withFileTypes: true})) {
    if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
    const child = relative + '/' + entry.name;
    if (entry.isDirectory()) assets(child);
    else if (/\.(png|jpe?g|webp|gif|svg|ico|avif|woff2?|ttf|ogg|mp3|wav|mp4|webm|json)$/i.test(entry.name)) copy(child);
  }
}
assets('assets');
console.log('Static mirror ready: ' + count + ' public files');
