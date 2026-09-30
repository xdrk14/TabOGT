// Builds the two TabOgt editions from the one codebase in the repository root.
//
//   node scripts/build.mjs            (or: npm run build)
//
//   firefox/                               the Firefox (Gecko) edition: same code, Firefox-only manifest.
//                                          Generated: edit the root files, then rebuild. Load it in Firefox via
//                                          about:debugging, or upload the zip below to addons.mozilla.org.
//   dist/TabOgt-chromium-v<version>.zip    for Brave / Chrome / Edge: unzip, then "Load unpacked" the TabOgt-chromium folder
//   dist/TabOgt-firefox-v<version>.zip     for addons.mozilla.org (manifest.json at the zip root, as AMO requires)
//   dist/RELEASE_NOTES.md                  used by the GitHub release workflow
//
// Options: --check-tag v1.2.3   fail unless the tag matches manifest.json's version (used by CI).
// No dependencies: the zip writer below uses Node's built-in zlib.
import fs from 'node:fs';
import path from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIREFOX_DIR = path.join(ROOT, 'firefox');
const DIST = path.join(ROOT, 'dist');
const GECKO_ID = 'tabogt@xdrk14';
const FIREFOX_MIN = '142.0';   // data_collection_permissions needs 140 (desktop) and 142 (Android); CSS zoom 126, content-visibility 125

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
const version = manifest.version;

const tagAt = process.argv.indexOf('--check-tag');
if (tagAt > -1) {
  const tag = String(process.argv[tagAt + 1] || '').replace(/^v/, '');
  if (tag !== version) { console.error(`Tag v${tag} does not match manifest.json version ${version}.`); process.exit(1); }
}

/* ---------- which files make up the extension ---------- */
// Top-level .html/.css/.js files, manifest.json, icons/*.png and the LICENSE. Everything else in the repo
// (tests, docs, scripts, firefox/, dist/, node_modules, markdown) is left out of both editions.
function extensionFiles() {
  const top = fs.readdirSync(ROOT, { withFileTypes: true })
    .filter(e => e.isFile() && (/\.(html|css|js)$/.test(e.name) || e.name === 'manifest.json' || e.name === 'LICENSE'))
    .map(e => e.name);
  const icons = fs.readdirSync(path.join(ROOT, 'icons')).filter(f => f.endsWith('.png')).map(f => `icons/${f}`);
  return [...top, ...icons].sort();
}

/* ---------- Firefox manifest ---------- */
function firefoxManifest(m) {
  const fx = structuredClone(m);
  fx.background = { scripts: [m.background.service_worker], type: 'module' };   // Firefox MV3 runs background scripts, not service workers
  delete fx.minimum_chrome_version;
  fx.permissions = fx.permissions.filter(p => p !== 'favicon');                   // Chromium-only (the _favicon icon source)
  fx.browser_specific_settings = {
    gecko: {
      id: GECKO_ID,
      strict_min_version: FIREFOX_MIN,
      // required by addons.mozilla.org for new extensions (Nov 2025): TabOgt collects and transmits nothing
      data_collection_permissions: { required: ['none'] }
    }
  };
  return fx;
}

/* ---------- tiny zip writer (deflate, UTF-8 names) ---------- */
const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = buf => { let c = 0xFFFFFFFF; for (const b of buf) c = CRC[(c ^ b) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
function zip(entries) {
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const parts = [], central = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const fname = Buffer.from(name, 'utf8');
    const packed = deflateRawSync(data, { level: 9 });
    const stored = packed.length >= data.length;
    const body = stored ? data : packed, method = stored ? 0 : 8, crc = crc32(data);
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(0x0800, 6); head.writeUInt16LE(method, 8);
    head.writeUInt16LE(dosTime, 10); head.writeUInt16LE(dosDate, 12); head.writeUInt32LE(crc, 14);
    head.writeUInt32LE(body.length, 18); head.writeUInt32LE(data.length, 22); head.writeUInt16LE(fname.length, 26);
    parts.push(head, fname, body);
    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0); dir.writeUInt16LE(20, 4); dir.writeUInt16LE(20, 6); dir.writeUInt16LE(0x0800, 8);
    dir.writeUInt16LE(method, 10); dir.writeUInt16LE(dosTime, 12); dir.writeUInt16LE(dosDate, 14); dir.writeUInt32LE(crc, 16);
    dir.writeUInt32LE(body.length, 20); dir.writeUInt32LE(data.length, 24); dir.writeUInt16LE(fname.length, 28);
    dir.writeUInt32LE(offset, 42);
    central.push(dir, fname);
    offset += 30 + fname.length + body.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cd, end]);
}

/* ---------- build ---------- */
const files = extensionFiles();
const read = f => fs.readFileSync(path.join(ROOT, f));

// firefox/: regenerated from scratch every time, so it can never drift from the root code
fs.rmSync(FIREFOX_DIR, { recursive: true, force: true });
for (const f of files) {
  const to = path.join(FIREFOX_DIR, f);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  if (f === 'manifest.json') fs.writeFileSync(to, JSON.stringify(firefoxManifest(manifest), null, 2) + '\n');
  else fs.copyFileSync(path.join(ROOT, f), to);
}
fs.writeFileSync(path.join(FIREFOX_DIR, 'README.md'),
`# TabOgt for Firefox

This folder is the **Firefox (Gecko) edition** of TabOgt, generated by \`npm run build\` from the files in the
repository root. Do not edit it by hand: change the root files and rebuild.

- Try it: Firefox > \`about:debugging\` > This Firefox > **Load Temporary Add-on** > pick \`manifest.json\` in this folder.
- Publish it: upload \`dist/TabOgt-firefox-v${version}.zip\` at https://addons.mozilla.org/developers/.

The code is identical to the Chromium edition; only \`manifest.json\` differs (background scripts instead of a
service worker, no \`favicon\` permission, a Gecko add-on ID, Firefox ${FIREFOX_MIN}+, and a "no data collected" declaration).
`);

// zips
fs.mkdirSync(DIST, { recursive: true });
for (const f of fs.readdirSync(DIST)) if (/^TabOgt-.*\.zip$/.test(f)) fs.rmSync(path.join(DIST, f));
const chromiumZip = `TabOgt-chromium-v${version}.zip`, firefoxZip = `TabOgt-firefox-v${version}.zip`;
// Chromium: everything inside a "TabOgt-chromium" folder, so unzipping gives one folder to pick in "Load unpacked"
fs.writeFileSync(path.join(DIST, chromiumZip), zip(files.map(f => ({ name: `TabOgt-chromium/${f}`, data: read(f) }))));
// Firefox: manifest.json at the root of the zip (required by addons.mozilla.org)
fs.writeFileSync(path.join(DIST, firefoxZip), zip(files.map(f => ({ name: f, data: fs.readFileSync(path.join(FIREFOX_DIR, f)) }))));

// release notes: this version's CHANGELOG section plus a short "which file?" guide
const log = fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8');
const section = (log.split(/^## /m).find(s => s.startsWith(version + ' ')) || '').replace(/^[^\n]*\n/, '').trim();
fs.writeFileSync(path.join(DIST, 'RELEASE_NOTES.md'),
`## Which file do I download?

| Browser | File | How to install |
|---|---|---|
| Brave, Chrome, Edge, Vivaldi, Opera | \`${chromiumZip}\` | Unzip it, open \`brave://extensions\` (or \`chrome://extensions\`), turn on **Developer mode**, click **Load unpacked** and pick the \`TabOgt-chromium\` folder. |
| Firefox | \`${firefoxZip}\` | Install TabOgt from addons.mozilla.org once it is listed. Until then: \`about:debugging\` > This Firefox > **Load Temporary Add-on** > pick this zip (removed on restart). To keep it installed, use Firefox Developer Edition, Nightly or ESR (see the README, "Permanent self-install"). |

See the README for full steps.

${section ? '## What changed\n\n' + section + '\n' : ''}`);

const size = f => (fs.statSync(path.join(DIST, f)).size / 1024).toFixed(0) + ' KB';
console.log(`TabOgt ${version}: ${files.length} files`);
console.log(`  firefox/                 (Firefox edition, regenerated)`);
console.log(`  dist/${chromiumZip}  ${size(chromiumZip)}`);
console.log(`  dist/${firefoxZip}   ${size(firefoxZip)}`);
