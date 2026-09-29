// Firefox smoke test for the Firefox edition (firefox/). Run `npm run build` first, then: npm run test:firefox
//
// Playwright cannot install Firefox add-ons, so this drives Firefox directly over WebDriver BiDi (built into
// Firefox 136+): it starts Firefox headless with a throwaway profile, installs firefox/ as a temporary add-on,
// opens the new tab, popup and panels, and checks that everything works with no console errors.
// Screenshots go to tests/screenshots/firefox-*.png. Set FIREFOX=<path to firefox> if it is not in the default place.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXT = path.resolve(HERE, '../firefox');
const SHOTS = path.join(HERE, 'screenshots');
const FIREFOX = process.env.FIREFOX || [
  'C:/Program Files/Mozilla Firefox/firefox.exe', 'C:/Program Files (x86)/Mozilla Firefox/firefox.exe',
  '/Applications/Firefox.app/Contents/MacOS/firefox', '/usr/bin/firefox'
].find(p => fs.existsSync(p));
const ADDON_ID = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8')).browser_specific_settings.gecko.id;
const UUID = '5ab0c1d2-7e3f-4a6b-9c8d-0e1f2a3b4c5d';   // fixed moz-extension:// host for this test profile
const BASE = `moz-extension://${UUID}`;
const PORT = 9322;

if (!FIREFOX) { console.error('Firefox not found. Set FIREFOX=<path>.'); process.exit(1); }
if (!fs.existsSync(EXT)) { console.error('firefox/ is missing. Run: npm run build'); process.exit(1); }
fs.mkdirSync(SHOTS, { recursive: true });

// throwaway profile: fixed extension UUID, no first-run pages
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'tabogt-ff-'));
fs.writeFileSync(path.join(profile, 'user.js'), [
  `user_pref("extensions.webextensions.uuids", ${JSON.stringify(JSON.stringify({ [ADDON_ID]: UUID }))});`,
  'user_pref("browser.shell.checkDefaultBrowser", false);',
  'user_pref("browser.aboutwelcome.enabled", false);',
  'user_pref("datareporting.policy.dataSubmissionEnabled", false);',
  'user_pref("toolkit.telemetry.reportingpolicy.firstRun", false);',
  'user_pref("browser.startup.homepage_override.mstone", "ignore");'
].join('\n'));

// -remote-allow-system-access: lets the remote protocol open privileged pages (moz-extension://, about:newtab)
const ff = spawn(FIREFOX, ['--headless', '--remote-debugging-port', String(PORT), '-remote-allow-system-access', '--profile', profile, '--no-remote', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));

let ws, nextId = 0;
const pending = new Map(), errors = [];
async function connect() {
  for (let i = 0; i < 60; i++) {
    try {
      ws = await new Promise((res, rej) => { const s = new WebSocket(`ws://127.0.0.1:${PORT}/session`); s.onopen = () => res(s); s.onerror = rej; });
      break;
    } catch { await sleep(500); }
  }
  if (!ws) throw new Error('Could not connect to Firefox remote protocol');
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id != null && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.type === 'error' ? rej(new Error(`${m.error}: ${m.message}`)) : res(m.result); }
    else if (m.method === 'log.entryAdded' && m.params.level === 'error') errors.push(`${m.params.text}${m.params.stackTrace?.callFrames?.[0] ? ' @ ' + m.params.stackTrace.callFrames[0].url : ''}`);
  };
}
const send = (method, params = {}) => new Promise((res, rej) => { const id = ++nextId; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });

let ctx;
// Runs an expression in the page; the expression's value is JSON-serialised in the page and parsed here.
async function evaluate(expr) {
  const r = await send('script.evaluate', { expression: `(async () => JSON.stringify(await (${expr})))()`, target: { context: ctx }, awaitPromise: true });
  if (r.type === 'exception') throw new Error('Page error: ' + (r.exceptionDetails?.text || 'exception'));
  return r.result.value === undefined ? undefined : JSON.parse(r.result.value);
}
async function waitFor(expr, what, timeout = 10000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { try { if (await evaluate(expr)) return; } catch { /* page still loading */ } await sleep(200); }
  throw new Error('Timed out waiting for ' + what);
}
const open = url => send('browsingContext.navigate', { context: ctx, url, wait: 'complete' });
// Firefox refuses screenshots of privileged (moz-extension) pages over the remote protocol; that is not a failure.
let shotsSkipped = false;
async function shot(name) {
  try {
    const { data } = await send('browsingContext.captureScreenshot', { context: ctx });
    fs.writeFileSync(path.join(SHOTS, name), Buffer.from(data, 'base64'));
  } catch { shotsSkipped = true; }
}

const results = [];
async function check(name, fn) {
  try { await fn(); results.push(['ok', name]); }
  catch (e) { results.push(['FAIL', name + ' - ' + e.message]); }
}

try {
  await connect();
  await send('session.new', { capabilities: {} });
  await send('session.subscribe', { events: ['log.entryAdded'] });
  const inst = await send('webExtension.install', { extensionData: { type: 'path', path: EXT } });
  ctx = (await send('browsingContext.getTree', {})).contexts[0].context;
  await send('browsingContext.setViewport', { context: ctx, viewport: { width: 1440, height: 900 } });

  await check(`installs as a temporary add-on (${inst.extension})`, async () => { if (inst.extension !== ADDON_ID) throw new Error('unexpected id ' + inst.extension); });

  await open(`${BASE}/newtab.html`);
  await check('new tab renders sections and tiles', () => waitFor(`document.querySelectorAll('.sec').length > 0 && document.querySelectorAll('.tile').length > 0`, 'the board'));
  await check('centered layout, clock and greeting', async () => {
    const v = await evaluate(`({ centered: document.documentElement.classList.contains('layout-centered'), time: document.getElementById('time').textContent, greet: document.getElementById('greet').textContent })`);
    if (!v.centered || !v.time || !/^Good /.test(v.greet)) throw new Error(JSON.stringify(v));
  });
  await check('site icons use letters (no Chromium _favicon requests)', async () => {
    const v = await evaluate(`({ letters: document.querySelectorAll('.tile .letter').length, favicon: [...document.querySelectorAll('img')].filter(i => i.src.includes('_favicon')).length })`);
    if (!v.letters || v.favicon) throw new Error(JSON.stringify(v));
  });
  await shot('firefox-newtab.png');

  await check('background script runs (answers messages)', async () => {
    const r = await evaluate(`browser.runtime.sendMessage({ type: 'sync-now' })`);
    if (r?.status !== 'off') throw new Error(JSON.stringify(r));
  });
  await check('adding a link (+ Add link) saves to storage', async () => {
    await evaluate(`(() => { document.querySelector('.sec .add-link').click(); return true; })()`);
    await waitFor(`!!document.querySelector('.add-row input')`, 'the add-link box');
    await evaluate(`(() => { const i = document.querySelector('.add-row input'); i.value = 'https://developer.mozilla.org/'; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return true; })()`);
    await waitFor(`browser.storage.local.get('data').then(r => JSON.stringify(r.data).includes('developer.mozilla.org'))`, 'the saved link');
  });
  await check('search finds bookmarks', async () => {
    await evaluate(`(() => { const q = document.getElementById('q'); q.focus(); q.value = 'mozilla'; q.dispatchEvent(new Event('input')); return true; })()`);
    await waitFor(`[...document.querySelectorAll('.res:not(:last-child) b')].some(b => /mozilla/i.test(b.textContent))`, 'a bookmark in the results');
    await evaluate(`(() => { document.getElementById('q').blur(); return true; })()`);
  });
  await check('Library panel opens (Import from Firefox)', async () => {
    await evaluate(`(() => { document.querySelector('.tool[data-panel="library"]').click(); return true; })()`);
    try { await waitFor(`[...document.querySelectorAll('.drawer .btn')].some(b => b.textContent.includes('Import from Firefox'))`, 'the Library panel', 5000); }
    catch (e) { throw new Error(e.message + ' | buttons: ' + await evaluate(`[...document.querySelectorAll('.drawer button')].map(b => b.className + ':' + b.textContent.trim()).join(' / ')`)); }
  });
  await check('Customise: theme and wallpaper apply', async () => {
    await evaluate(`(() => { document.querySelector('.tool[data-panel="settings"]').click(); return true; })()`);
    await waitFor(`!!document.querySelector('.wall-opt')`, 'the Customise panel');
    await evaluate(`(() => { [...document.querySelectorAll('.wall-opt')].find(b => b.textContent === 'Nebula').click(); return true; })()`);
    await waitFor(`document.documentElement.classList.contains('has-wall') && document.documentElement.classList.contains('mat-frosted')`, 'wallpaper + frost');
    await sleep(500);
    await shot('firefox-customise.png');
    await evaluate(`(() => { document.getElementById('drawerClose').click(); return true; })()`);
    await sleep(400);
    await shot('firefox-nebula.png');
  });

  await open(`${BASE}/popup.html`);
  await check('popup lists sections', () => waitFor(`document.getElementById('section').options.length > 1`, 'the popup'));

  await check('no console errors', async () => { if (errors.length) throw new Error('\n    ' + errors.join('\n    ')); });
} catch (e) {
  results.push(['FAIL', 'setup - ' + e.message]);
} finally {
  try { await send('session.end'); } catch { /* already gone */ }
  ff.kill();
}

if (shotsSkipped) console.log('  (screenshots skipped: this Firefox does not allow them on extension pages)');
for (const [s, n] of results) console.log(`${s === 'ok' ? '  ok ' : '  ✗  '} ${n}`);
const failed = results.filter(r => r[0] !== 'ok').length;
console.log(failed ? `\n${failed} failed` : `\nall ${results.length} passed`);
process.exit(failed ? 1 : 0);
