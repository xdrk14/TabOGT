// TabOgt end-to-end smoke test.
// Loads the unpacked extension into a throwaway profile and drives the real new-tab page, popup and
// service worker. Screenshots go to tests/screenshots/. See playwright.config.js for how to run.
const { test, expect, chromium } = require('@playwright/test');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');

const EXT = path.resolve(__dirname, '..');
const SHOTS = path.join(__dirname, 'screenshots');
const BRAVE = path.join(process.env.LOCALAPPDATA || '', 'BraveSoftware/Brave-Browser/Application/brave.exe');
const BROWSER = process.env.TABOGT_BROWSER || (fs.existsSync(BRAVE) ? BRAVE : undefined);

test.describe.configure({ mode: 'serial' });

let ctx, sw, id, server, base, errors = [];
const NT = () => `chrome-extension://${id}/newtab.html`;

/* ---------- local web server: pages to save, drag from and click through to ---------- */
let favPng = null;
// A small stand-in for the GitHub REST API (repos + contents), enough to exercise TabOgt sync.
const gh = { files: new Map(), repos: { 'me/tabogt-data': true, 'me/open-repo': false }, puts: 0, token: 'good-token' };
function fakeGitHub(req, res, body) {
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type, accept, x-github-api-version', 'access-control-allow-methods': 'GET, PUT, OPTIONS' };
  const send = (code, obj, type = 'application/json') => { res.writeHead(code, { ...cors, 'content-type': type }); res.end(typeof obj === 'string' ? obj : JSON.stringify(obj)); };
  if (req.method === 'OPTIONS') return send(204, '');
  if (req.headers.authorization !== `Bearer ${gh.token}`) return send(401, { message: 'Bad credentials' });
  const m = req.url.split('?')[0].match(/^\/gh\/repos\/([^/]+\/[^/]+)(?:\/contents\/(.+))?$/);
  if (!m || !(m[1] in gh.repos)) return send(404, { message: 'Not Found' });
  if (!m[2]) return send(200, { full_name: m[1], private: gh.repos[m[1]] });
  const key = m[1] + '/' + decodeURIComponent(m[2]), f = gh.files.get(key);
  if (req.method === 'GET') {
    if (!f) return send(404, { message: 'Not Found' });
    if (/raw/.test(req.headers.accept || '')) return send(200, Buffer.from(f.content, 'base64').toString('utf8'), 'text/plain');
    return send(200, { sha: f.sha, encoding: 'base64', content: f.content });
  }
  if (req.method === 'PUT') {
    const b = JSON.parse(body);
    if (f ? b.sha !== f.sha : b.sha) return send(409, { message: 'sha does not match' });
    const sha = 'sha' + (++gh.puts);
    gh.files.set(key, { sha, content: b.content });
    return send(200, { content: { sha } });
  }
  send(405, {});
}
const ghDoc = () => { const f = gh.files.get('me/tabogt-data/tabogt-data.json'); return f && JSON.parse(Buffer.from(f.content, 'base64').toString('utf8')); };

function startServer() {
  server = http.createServer((req, res) => {
    if (req.url.startsWith('/gh/')) { let body = ''; req.on('data', c => { body += c; }); req.on('end', () => fakeGitHub(req, res, body)); return; }
    if (req.url.startsWith('/fav.png')) { res.writeHead(200, { 'content-type': 'image/png' }); return res.end(favPng); }
    const n = decodeURIComponent(req.url.split('/').pop() || 'home');
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(`<!doctype html><title>Page ${n}</title><link rel="icon" href="/fav.png"><h1>Page ${n}</h1><a id="l" href="/p/linked">Linked page</a>`);
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => { base = `http://127.0.0.1:${server.address().port}`; r(); }));
}

/* ---------- data helpers ---------- */
let n = 0;
const uid = () => 'id' + (++n).toString(36) + Math.random().toString(36).slice(2, 6);
const item = (url, title, tags = [], extra = {}) => ({ id: uid(), url, title, tags, note: '', added: Date.now() - (n * 1000), ...extra });
function mkData(spec, settings = {}) {
  const workspaces = spec.map(([name, sections]) => ({
    id: uid(), name, notes: '',
    sections: sections.map(([sname, items, color = '#8ab4ff']) => ({ id: uid(), name: sname, color, collapsed: false, items }))
  }));
  return { v: 3, rev: 0, activeWs: workspaces[0].id, last: null, sessions: [], library: [], settings, workspaces };
}
const baseData = (settings) => mkData([
  ['Personal', [
    ['Daily', [item(`${base}/p/mail`, 'Mail', ['work']), item(`${base}/p/news`, 'News', ['news', 'daily']), item(`${base}/p/video`, 'Video')]],
    ['Reading', [item(`${base}/p/zeta`, 'Zeta article'), item(`${base}/p/alpha`, 'Alpha article', ['news']), item('https://unknown-site-tabogt.invalid/', 'Mystery')]],
    ['Empty', []]
  ]],
  ['Work', [['Inbox', []], ['Tools', [item(`${base}/p/tool`, 'Tool')]]]]
], { layout: 'board', view: 'grid', ...settings });

const getData = () => sw.evaluate(() => chrome.storage.local.get('data').then(r => r.data));
async function setData(d, page) {
  await sw.evaluate(d => chrome.storage.local.set({ data: d }), d);
  if (page) { await page.reload(); await page.waitForSelector('.sec'); }
}
const secByName = (d, name) => d.workspaces.flatMap(w => w.sections).find(s => s.name === name);
const wsByName = (d, name) => d.workspaces.find(w => w.name === name);

async function open(url, viewport = { width: 1440, height: 900 }) {
  const p = await ctx.newPage();
  await p.setViewportSize(viewport);
  p.on('console', m => { if (m.type() === 'error' || /Content Security Policy/i.test(m.text())) errors.push(`${url.split('/').pop()}: ${m.text()} ${m.location()?.url || ''}`); });
  p.on('pageerror', e => errors.push(`${url.split('/').pop()}: ${e.message}`));
  await p.goto(url);
  return p;
}
async function dashboard(d, viewport) {
  if (d) await setData(d);
  const p = await open(NT(), viewport);
  await p.waitForSelector('.sec');
  return p;
}
const sec = (p, name) => p.locator('.sec', { has: p.locator('.sec-name', { hasText: new RegExp(`^${name}$`) }) });
const tile = (p, title) => p.locator('.tile', { has: p.locator('.t', { hasText: new RegExp(`^${title}$`) }) });
async function menuClick(p, label) { await p.locator('#menu .mi', { hasText: label }).first().click(); }

// Fires a real DragEvent sequence carrying the given data, as Brave does for links dragged in from another
// page or the address-bar icon (Playwright cannot start an OS-level drag from outside the page).
async function externalDrop(p, selector, data, where = 'top') {
  await p.evaluate(({ selector, data, where }) => {
    const el = document.querySelector(selector);
    const r = el.getBoundingClientRect();
    const dt = new DataTransfer();
    for (const [k, v] of Object.entries(data)) dt.setData(k, v);
    const o = { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.left + 12, clientY: where === 'top' ? r.top + 12 : r.bottom - 8 };
    for (const t of ['dragenter', 'dragover', 'drop']) el.dispatchEvent(new DragEvent(t, o));
  }, { selector, data, where });
}

test.beforeAll(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  await startServer();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tabogt-test-'));
  ctx = await chromium.launchPersistentContext(dir, {
    executablePath: BROWSER, channel: BROWSER ? undefined : 'chromium',
    headless: !process.env.HEADED, acceptDownloads: true,
    // GPU=1 uses the real graphics card in headless mode (default is software rendering, far slower for blur)
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, ...(process.env.GPU ? ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist'] : [])]
  });
  [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker');
  id = sw.url().split('/')[2];
  // a real PNG favicon for the local pages
  const p = await ctx.newPage();
  const b64 = await p.evaluate(() => { const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d'); g.fillStyle = '#e0457b'; g.fillRect(0, 0, 32, 32); return c.toDataURL('image/png').split(',')[1]; });
  favPng = Buffer.from(b64, 'base64');
  await p.close();
});

test.afterAll(async () => { await ctx?.close(); server?.close(); });

/* ================================================================== */

test('loads cleanly: overlay, drawer and menu stay hidden', async () => {
  const p = await dashboard(baseData());
  for (const sel of ['#modal', '#drawer', '#menu', '#results']) await expect(p.locator(sel)).toBeHidden();
  await expect(p.locator('.tile')).toHaveCount(6);
  await expect(p.locator('.ws.on')).toHaveAttribute('aria-selected', 'true');
  await p.close();
});

test('screenshots: 1440 and 800 wide, black, dark and light, plus popup', async () => {
  const target = await open(`${base}/p/screenshot-target`);
  for (const theme of ['black', 'dark', 'light']) {
    await setData(baseData({ theme }));
    for (const width of [1440, 800]) {
      const p = await dashboard(null, { width, height: 900 });
      await p.waitForTimeout(400);
      await p.screenshot({ path: path.join(SHOTS, `newtab-${theme}-${width}.png`) });
      if (width === 1440) {
        await p.click('.tool[data-panel="settings"]');
        await p.waitForTimeout(300);
        await p.screenshot({ path: path.join(SHOTS, `customise-${theme}.png`) });
        await p.keyboard.press('Escape');
        await tile(p, 'Mail').click({ button: 'right' });
        await p.screenshot({ path: path.join(SHOTS, `menu-${theme}.png`) });
        await p.keyboard.press('Escape');
        await p.keyboard.press('Control+k');
        await p.keyboard.type('a');
        await p.screenshot({ path: path.join(SHOTS, `search-${theme}.png`) });
      }
      await p.close();
    }
    const pop = await openPopup(target, { width: 360, height: 480 });
    await pop.screenshot({ path: path.join(SHOTS, `popup-${theme}.png`) });
    await pop.close();
  }
  await target.close();
});

/* ---------- workspaces ---------- */
test('workspaces: add, rename, reorder, delete + undo, Alt+digits', async () => {
  const p = await dashboard(baseData());
  await p.click('.ws.add');
  await p.locator('.ws-edit').fill('Research');
  await p.keyboard.press('Enter');
  await expect.poll(async () => (await getData()).workspaces.map(w => w.name)).toEqual(['Personal', 'Work', 'Research']);
  expect((await getData()).activeWs).toBe(wsByName(await getData(), 'Research').id);

  await p.locator('.ws', { hasText: 'Research' }).dblclick();
  await p.locator('.ws-edit').fill('Lab');
  await p.keyboard.press('Enter');
  await expect.poll(async () => (await getData()).workspaces.map(w => w.name)).toEqual(['Personal', 'Work', 'Lab']);

  await p.locator('.ws', { hasText: 'Lab' }).click({ button: 'right' });
  await menuClick(p, 'Move left');
  await expect.poll(async () => (await getData()).workspaces.map(w => w.name)).toEqual(['Personal', 'Lab', 'Work']);

  await p.locator('.ws', { hasText: 'Lab' }).click({ button: 'right' });
  await menuClick(p, 'Delete workspace');
  await expect.poll(async () => (await getData()).workspaces.length).toBe(2);
  await p.locator('.toast button', { hasText: 'Undo' }).click();
  await expect.poll(async () => (await getData()).workspaces.map(w => w.name)).toEqual(['Personal', 'Lab', 'Work']);

  await p.locator('body').click({ position: { x: 5, y: 890 } });
  await p.keyboard.press('Alt+3');
  await expect(p.locator('.ws.on')).toContainText('Work');
  await p.keyboard.press('Alt+1');
  await expect(p.locator('.ws.on')).toContainText('Personal');
  await p.close();
});

/* ---------- sections ---------- */
test('sections: add, rename, colour, collapse, sort, move, delete + undo, drag to last place', async () => {
  const p = await dashboard(baseData());
  await p.click('.new-sec');
  await p.keyboard.type('Alpha');
  await p.keyboard.press('Enter');
  await expect.poll(async () => !!secByName(await getData(), 'Alpha')).toBe(true);

  await sec(p, 'Alpha').locator('.sec-name').dblclick();
  await p.keyboard.press('Control+a');
  await p.keyboard.type('Beta');
  await p.keyboard.press('Enter');
  await expect.poll(async () => !!secByName(await getData(), 'Beta')).toBe(true);

  await sec(p, 'Beta').locator('.sec-h').click({ button: 'right' });
  await p.locator('#menu .sw').nth(3).click();
  await expect.poll(async () => secByName(await getData(), 'Beta').color).toBe('#FF375F');

  await sec(p, 'Daily').locator('.sec-h .icon-btn').first().click();
  await expect.poll(async () => secByName(await getData(), 'Daily').collapsed).toBe(true);
  await expect(sec(p, 'Daily')).toHaveClass(/collapsed/);
  await sec(p, 'Daily').locator('.sec-h .icon-btn').first().click();

  await sec(p, 'Reading').locator('.sec-h').click({ button: 'right' });
  await menuClick(p, 'Sort');
  await menuClick(p, 'By name');
  await expect.poll(async () => secByName(await getData(), 'Reading').items.map(i => i.title)).toEqual(['Alpha article', 'Mystery', 'Zeta article']);

  await sec(p, 'Beta').locator('.sec-h').click({ button: 'right' });
  await menuClick(p, 'Move to workspace');
  await menuClick(p, 'Work');
  await expect.poll(async () => wsByName(await getData(), 'Work').sections.map(s => s.name)).toContain('Beta');

  await sec(p, 'Empty').locator('.sec-h').click({ button: 'right' });
  await menuClick(p, 'Delete section');
  await expect.poll(async () => !!secByName(await getData(), 'Empty')).toBe(false);
  await p.keyboard.press('Control+z');
  await expect.poll(async () => !!secByName(await getData(), 'Empty')).toBe(true);

  // drag the first section onto the right half of the last one: it must land last
  const last = sec(p, 'Empty');
  const box = await last.boundingBox();
  await sec(p, 'Daily').locator('.sec-h').dragTo(last, { targetPosition: { x: box.width - 20, y: 30 } });
  await expect.poll(async () => wsByName(await getData(), 'Personal').sections.map(s => s.name)).toEqual(['Reading', 'Empty', 'Daily']);
  // and onto the left half of the first: lands first
  await sec(p, 'Daily').locator('.sec-h').dragTo(sec(p, 'Reading'), { targetPosition: { x: 20, y: 30 } });
  await expect.poll(async () => wsByName(await getData(), 'Personal').sections.map(s => s.name)).toEqual(['Daily', 'Reading', 'Empty']);
  await p.close();
});

/* ---------- tiles ---------- */
test('tiles: open, drag within/between sections and onto a workspace, menu, edit, keys', async () => {
  const p = await dashboard(baseData());
  // reorder within a section: Video before Mail
  await tile(p, 'Video').dragTo(tile(p, 'Mail'), { targetPosition: { x: 5, y: 20 } });
  await expect.poll(async () => secByName(await getData(), 'Daily').items.map(i => i.title)).toEqual(['Video', 'Mail', 'News']);
  // between sections
  await tile(p, 'News').dragTo(sec(p, 'Empty'));
  await expect.poll(async () => secByName(await getData(), 'Empty').items.map(i => i.title)).toEqual(['News']);
  // onto a workspace tab
  await tile(p, 'News').dragTo(p.locator('.ws', { hasText: 'Work' }));
  await expect.poll(async () => secByName(await getData(), 'Inbox').items.map(i => i.title)).toEqual(['News']);

  // right-click menu + keyboard navigation + focus return
  await tile(p, 'Mail').focus();
  await p.locator('.tile', { hasText: 'Mail' }).click({ button: 'right' });
  await expect(p.locator('#menu')).toBeVisible();
  await expect(p.locator('#menu .mi').first()).toBeFocused();
  await p.keyboard.press('ArrowDown');
  await expect(p.locator('#menu .mi').nth(1)).toBeFocused();
  await p.keyboard.press('End');
  await expect(p.locator('#menu .mi').last()).toBeFocused();
  await p.keyboard.press('Escape');
  await expect(p.locator('#menu')).toBeHidden();

  // E opens the edit dialog, Enter saves
  await tile(p, 'Mail').focus();
  await p.keyboard.press('e');
  await expect(p.locator('#modal')).toBeVisible();
  await p.locator('#dialog input').first().fill('Mailbox');
  await p.locator('#dialog input').nth(2).fill('work, inbox');
  await p.keyboard.press('Enter');
  await expect.poll(async () => secByName(await getData(), 'Daily').items.find(i => i.title === 'Mailbox')?.tags).toEqual(['work', 'inbox']);
  // F2 opens it too; Escape closes it and returns focus to the tile
  await tile(p, 'Mailbox').focus();
  await p.keyboard.press('F2');
  await expect(p.locator('#modal')).toBeVisible();
  await p.keyboard.press('Escape');
  await expect(p.locator('#modal')).toBeHidden();
  // Delete removes it and focus moves to the neighbour instead of <body>
  await tile(p, 'Mailbox').focus();
  await p.keyboard.press('Delete');
  await expect.poll(async () => secByName(await getData(), 'Daily').items.map(i => i.title)).toEqual(['Video']);
  expect(await p.evaluate(() => document.activeElement.className)).toContain('tile');

  // click opens the bookmark in this tab
  await tile(p, 'Video').click();
  await p.waitForURL(`${base}/p/video`);
  expect(await p.title()).toBe('Page video');
  await p.close();
});

/* ---------- drops from outside, open-tabs panel, paste ---------- */
test('drops: links from pages, address-bar icon, multi-URL, open tabs panel, paste', async () => {
  const p = await dashboard(baseData());
  // a link dragged from another page: uri-list + html with the link text
  await externalDrop(p, '.sec:nth-child(3)', { 'text/uri-list': `${base}/p/dragged`, 'text/html': `<a href="${base}/p/dragged">Dragged link</a>`, 'text/plain': `${base}/p/dragged` });
  await expect.poll(async () => secByName(await getData(), 'Empty').items.map(i => i.title)).toEqual(['Dragged link']);
  // address-bar icon: uri-list + plain text, title looked up from open tabs
  const other = await open(`${base}/p/addressbar`);
  await p.bringToFront();
  await p.waitForTimeout(400);
  await externalDrop(p, '.sec:nth-child(3)', { 'text/uri-list': `${base}/p/addressbar`, 'text/plain': `${base}/p/addressbar` }, 'bottom');
  await expect.poll(async () => secByName(await getData(), 'Empty').items.map(i => i.title)).toEqual(['Dragged link', 'Page addressbar']);
  // several URLs at once (with a uri-list comment line)
  await externalDrop(p, '.sec:nth-child(3)', { 'text/uri-list': `# comment\r\n${base}/p/m1\r\n${base}/p/m2\r\n${base}/p/m3` }, 'bottom');
  await expect.poll(async () => secByName(await getData(), 'Empty').items.length).toBe(5);
  // plain text containing URLs
  await externalDrop(p, '.sec:nth-child(2)', { 'text/plain': `see ${base}/p/t1 and www.example.org/x.` }, 'bottom');
  await expect.poll(async () => secByName(await getData(), 'Reading').items.map(i => i.url).slice(-2)).toEqual([`${base}/p/t1`, 'https://www.example.org/x']);
  // onto the "New section" button: creates a section
  await externalDrop(p, '.new-sec', { 'text/uri-list': `${base}/p/newsec` });
  await p.keyboard.press('Enter');
  await expect.poll(async () => wsByName(await getData(), 'Personal').sections.length).toBe(4);

  // a tab from the Open tabs panel (real HTML5 drag inside the page)
  await p.click('.tool[data-panel="tabs"]');
  const row = p.locator('.tab-row', { hasText: 'Page addressbar' });
  await expect(row).toHaveClass(/saved/);
  await row.dragTo(sec(p, 'Daily'));
  await expect.poll(async () => secByName(await getData(), 'Daily').items.map(i => i.title)).toContain('Page addressbar');
  // save-button on a row
  await p.locator('.tab-row', { hasText: 'Page addressbar' }).hover();
  await p.keyboard.press('Escape');

  // paste goes to the section under the pointer
  await sec(p, 'Reading').hover();
  await p.evaluate(url => {
    const dt = new DataTransfer(); dt.setData('text/plain', url);
    document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, `${base}/p/pasted`);
  await expect.poll(async () => secByName(await getData(), 'Reading').items.map(i => i.url)).toContain(`${base}/p/pasted`);
  await other.close();
  await p.close();
});

/* ---------- search ---------- */
test('search: Ctrl+K, /, type-to-search, #tags, > commands, arrows, Enter, Ctrl+Enter, web fallback', async () => {
  const p = await dashboard(baseData());
  const q = p.locator('#q');
  await p.keyboard.press('Control+k');
  await expect(q).toBeFocused();
  await p.keyboard.press('Escape'); await p.keyboard.press('Escape');
  await p.locator('body').click({ position: { x: 5, y: 890 } });
  await p.keyboard.press('/');
  await expect(q).toBeFocused();
  await p.keyboard.press('Escape');
  await p.locator('body').click({ position: { x: 5, y: 890 } });
  await p.keyboard.type('zeta');
  await expect(q).toHaveValue('zeta');
  await expect(p.locator('.res').first()).toContainText('Zeta article');

  await q.fill('#news');
  await expect(p.locator('.res b')).toHaveText(['News', 'Alpha article', /Search the web/]);
  await q.fill('#news alpha');
  await expect(p.locator('.res b').first()).toHaveText('Alpha article');

  await q.fill('art');
  await p.keyboard.press('ArrowDown');
  await expect(p.locator('.res').nth(1)).toHaveAttribute('aria-selected', 'true');
  expect(await q.getAttribute('aria-activedescendant')).toBe('res-1');

  // Ctrl+Enter opens in a background tab
  const [bg] = await Promise.all([ctx.waitForEvent('page'), p.keyboard.press('Control+Enter')]);
  await bg.waitForLoadState();
  expect(bg.url()).toMatch(/\/p\/(zeta|alpha)$/);
  await bg.close();

  // > commands
  await q.focus();
  await q.fill('>collapse all');
  await p.keyboard.press('Enter');
  await expect.poll(async () => wsByName(await getData(), 'Personal').sections.every(s => s.collapsed)).toBe(true);
  await q.focus();
  await q.fill('>expand all');
  await p.keyboard.press('Enter');

  // web search fallback (background tab so the dashboard stays)
  await q.focus();
  await q.fill('zzqx qqq nothing');
  await expect(p.locator('.res-head')).toHaveText('No saved bookmarks match.');
  await expect(p.locator('.res').last()).toContainText('Search the web');
  const [web] = await Promise.all([ctx.waitForEvent('page'), p.keyboard.press('Control+Enter')]);
  expect(web).toBeTruthy();
  await web.close();

  // Enter on a bookmark navigates this tab
  await q.focus();
  await q.fill('video');
  await p.keyboard.press('Enter');
  await p.waitForURL(`${base}/p/video`);
  await p.close();
});

/* ---------- popup ---------- */
async function openPopup(target, viewport = { width: 360, height: 560 }) {
  const pop = await ctx.newPage();
  await pop.setViewportSize(viewport);
  pop.on('pageerror', e => errors.push('popup: ' + e.message));
  await target.bringToFront();              // the popup saves the active tab, so keep the page in front
  await pop.goto(`chrome-extension://${id}/popup.html`);
  await pop.waitForFunction(() => document.getElementById('section').options.length > 0);
  return pop;
}

test('popup: save with tags/note, duplicate warning, new section, save all, session, no stale overwrite', async () => {
  const d = baseData();
  await setData(d);
  const target = await open(`${base}/p/news`);   // already saved in Daily
  let pop = await openPopup(target);
  await expect(pop.locator('#newSecRow')).toBeHidden();
  await expect(pop.locator('#exists')).toContainText('Personal › Daily');
  await expect(pop.locator('#url')).toHaveText(`${base}/p/news`);
  await pop.selectOption('#section', { label: 'Reading' });
  await pop.fill('#tags', 'one, #two');
  await pop.fill('#note', 'a note');

  // race: the dashboard adds a link while the popup is open; the popup save must not wipe it
  const dash = await dashboard();
  await sec(dash, 'Empty').hover();
  await dash.evaluate(url => { const dt = new DataTransfer(); dt.setData('text/plain', url); document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); }, `${base}/p/while-popup-open`);
  await expect.poll(async () => secByName(await getData(), 'Empty').items.length).toBe(1);

  await pop.evaluate(() => { const b = document.getElementById('saveBtn'); b.click(); b.click(); });   // a double click must save once
  await expect.poll(async () => secByName(await getData(), 'Reading').items.filter(i => i.url === `${base}/p/news`).length).toBe(1);
  const saved = secByName(await getData(), 'Reading').items.find(i => i.url === `${base}/p/news`);
  expect(saved.tags).toEqual(['one', 'two']);
  expect(saved.note).toBe('a note');
  expect(secByName(await getData(), 'Empty').items.map(i => i.url)).toEqual([`${base}/p/while-popup-open`]);
  await expect(sec(dash, 'Reading').locator('.tile')).toHaveCount(4);   // dashboard picked up the popup write
  if (!pop.isClosed()) await pop.close();

  // new section
  pop = await openPopup(target);
  const newOpt = await pop.locator('#section option[value^="new:"]').first().getAttribute('value');
  await pop.selectOption('#section', newOpt);
  await expect(pop.locator('#newSecRow')).toBeVisible();
  await pop.fill('#newSec', 'From popup');
  await pop.keyboard.press('Enter');
  await expect.poll(async () => secByName(await getData(), 'From popup')?.items.length).toBe(1);
  if (!pop.isClosed()) await pop.close();

  // Enter on a focused button triggers that button, not "Save page"
  const t2 = await open(`${base}/p/second`);
  pop = await openPopup(t2);
  const before = (await getData()).sessions.length;
  await pop.focus('#saveSession');
  await pop.keyboard.press('Enter');
  await expect.poll(async () => (await getData()).sessions.length).toBe(before + 1);
  expect((await getData()).sessions[0].tabs.map(t => t.url)).toEqual(expect.arrayContaining([`${base}/p/news`, `${base}/p/second`]));
  expect(secByName(await getData(), 'Daily').items.filter(i => i.url.endsWith('/p/second')).length).toBe(0);
  if (!pop.isClosed()) await pop.close();

  // save all tabs
  pop = await openPopup(t2);
  await pop.selectOption('#section', { label: 'Tools' });
  await pop.click('#saveAll');
  await expect.poll(async () => secByName(await getData(), 'Tools').items.map(i => i.url)).toEqual(expect.arrayContaining([`${base}/p/news`, `${base}/p/second`]));
  if (!pop.isClosed()) await pop.close();

  // an unsavable page (the extension page itself) disables saving
  pop = await openPopup(dash);
  await expect(pop.locator('#saveBtn')).toBeDisabled();
  await pop.close();
  await Promise.all([target.close(), t2.close(), dash.close()]);
});

/* ---------- background: context menus and quick-save ---------- */
test('background: menus rebuild on section changes; menu clicks and quick-save write safely', async () => {
  const d = baseData();
  await setData(d);
  const menuExists = mid => sw.evaluate(async mid => { await tabogtTest.menusReady(); try { await chrome.contextMenus.update(mid, {}); return true; } catch { return false; } }, mid);
  await sw.evaluate(() => tabogtTest.rebuildMenus());
  const daily = secByName(d, 'Daily');
  expect(await menuExists(`page|${daily.id}`)).toBe(true);
  expect(await menuExists(`link|${daily.id}`)).toBe(true);

  const p = await dashboard();
  await p.click('.new-sec');
  await p.keyboard.type('Menu test');
  await p.keyboard.press('Enter');
  await expect.poll(async () => !!secByName(await getData(), 'Menu test')).toBe(true);
  const ms = secByName(await getData(), 'Menu test');
  await expect.poll(() => menuExists(`page|${ms.id}`), { timeout: 5000 }).toBe(true);

  // the Library entry exists and saves to the Library
  expect(await menuExists('link|library')).toBe(true);
  await sw.evaluate(base => tabogtTest.onMenuClick({ menuItemId: 'link|library', linkUrl: `${base}/p/to-library`, selectionText: 'For later' }), base);
  await expect.poll(async () => (await getData()).library.map(i => i.title)).toContain('For later');

  // five simultaneous "Save link" clicks must all land (they used to overwrite each other)
  await sw.evaluate(({ sid, base }) => Promise.all([1, 2, 3, 4, 5].map(k => tabogtTest.onMenuClick({ menuItemId: `link|${sid}`, linkUrl: `${base}/p/ctx${k}`, selectionText: k === 1 ? 'Selected text' : '' }))), { sid: ms.id, base });
  await expect.poll(async () => secByName(await getData(), 'Menu test').items.length).toBe(5);
  expect(secByName(await getData(), 'Menu test').items.map(i => i.title)).toContain('Selected text');
  await expect(sec(p, 'Menu test').locator('.tile')).toHaveCount(5);

  // "Save page" uses the tab's URL and title
  const pg = await open(`${base}/p/ctxpage`);
  await sw.evaluate(async ({ sid, url }) => { const t = (await chrome.tabs.query({})).find(x => x.url === url); return tabogtTest.onMenuClick({ menuItemId: `page|${sid}` }, t); }, { sid: ms.id, url: `${base}/p/ctxpage` });
  await expect.poll(async () => secByName(await getData(), 'Menu test').items.map(i => i.title)).toContain('Page ctxpage');

  // quick-save goes to the last used section
  await pg.bringToFront();
  await sw.evaluate(() => tabogtTest.onCommand('quick-save'));
  await expect.poll(async () => secByName(await getData(), 'Menu test').items.filter(i => i.title === 'Page ctxpage').length).toBe(2);
  await pg.close();
  await p.close();
});

/* ---------- panels ---------- */
test('panels: sessions, notes autosave + flush on close, customise controls, wallpaper', async () => {
  const d = baseData();
  d.sessions = [{ id: 's1', name: 'Morning', created: Date.now(), tabs: [{ url: `${base}/p/s1`, title: 'S1' }, { url: `${base}/p/s2`, title: 'S2' }] }];
  let p = await dashboard(d);

  // sessions
  await p.click('.tool[data-panel="sessions"]');
  await expect(p.locator('.sess')).toHaveCount(1);
  await p.locator('.sess button', { hasText: 'To section' }).click();
  await expect.poll(async () => secByName(await getData(), 'Morning')?.items.length).toBe(2);
  await p.locator('.sess .icon-btn[title="Rename"]').click();
  await p.locator('#dialog input').fill('Evening');
  await p.keyboard.press('Enter');
  await expect.poll(async () => (await getData()).sessions[0].name).toBe('Evening');
  await p.locator('.sess .icon-btn[title="Delete"]').click();
  await expect.poll(async () => (await getData()).sessions.length).toBe(0);
  await p.locator('.toast button', { hasText: 'Undo' }).last().click();
  await expect.poll(async () => (await getData()).sessions.length).toBe(1);
  // prompt closed with Esc must settle (nothing saved, UI usable)
  await p.locator('.sess .icon-btn[title="Rename"]').click();
  await p.keyboard.press('Escape');
  await expect(p.locator('#modal')).toBeHidden();

  // notes autosave (the open drawer covers the toolbar, so close it first)
  await p.keyboard.press('Escape');
  await p.click('.tool[data-panel="notes"]');
  await p.locator('.notes-area').fill('first note');
  await expect.poll(async () => wsByName(await getData(), 'Personal').notes).toBe('first note');
  // typed then closed inside the debounce window: still saved
  await p.locator('.notes-area').fill('typed right before closing');
  await p.close({ runBeforeUnload: true });
  await expect.poll(async () => wsByName(await getData(), 'Personal').notes).toBe('typed right before closing');

  // customise: every control
  p = await dashboard();
  await p.click('.tool[data-panel="settings"]');
  const seg = (label, opt) => p.locator('.ctl', { hasText: new RegExp(`^${label}`) }).locator('.seg button', { hasText: opt }).click();
  const range = (label, v) => p.locator('.ctl', { hasText: new RegExp(`^${label}`) }).locator('input[type=range]').evaluate((r, v) => { r.value = v; r.dispatchEvent(new Event('input', { bubbles: true })); }, v);
  const sw_ = (label) => p.locator('label.ctl', { hasText: new RegExp(`^${label}`) }).locator('input.switch').click();
  const css = v => p.evaluate(v => document.documentElement.style.getPropertyValue(v), v);
  const cls = c => p.evaluate(c => document.documentElement.classList.contains(c), c);

  await seg('Theme', 'Light'); expect(await cls('light')).toBe(true);
  await seg('Theme', 'Auto'); await seg('Theme', 'Dark'); expect(await cls('light')).toBe(false);
  await p.locator('.ctl', { hasText: 'Accent' }).locator('.sw').nth(2).click();
  expect(await css('--accent')).toBe('#BF5AF2');
  await p.locator('.ctl', { hasText: 'Accent' }).locator('input[type=color]').evaluate(i => { i.value = '#123456'; i.dispatchEvent(new Event('input')); i.dispatchEvent(new Event('change')); });
  expect(await css('--accent')).toBe('#123456');
  for (const [f, c] of [['Rounded', 'font-rounded'], ['Serif', 'font-serif'], ['Mono', 'font-mono']]) { await seg('Font', f); expect(await cls(c)).toBe(true); }
  await seg('Font', 'System');
  await seg('Surfaces', 'Frosted'); expect(await cls('mat-frosted')).toBe(true);
  await range('Card opacity', 0.2); expect(await css('--card-opacity')).toBe('0.2');
  await range('Blur intensity', 10); expect(await css('--blur')).toBe('10px');
  await range('Card radius', 8); expect(await css('--radius')).toBe('8px');
  await range('Wallpaper dim', 0.5); expect(await css('--wall-dim')).toBe('0.5');
  await range('Wallpaper blur', 6); expect(await css('--wall-blur')).toBe('6px');
  await range('Icon size', 50); expect(await css('--tile')).toBe('50px');
  await range('Section width', 360); expect(await css('--section-w')).toBe('360px');
  await range('Grid spacing', 20); expect(await css('--gap')).toBe('20px');
  await seg('View', 'List'); await expect(p.locator('.items.list').first()).toBeVisible();
  await seg('View', 'Icons');
  await sw_('Show titles'); expect(await cls('no-titles')).toBe(true);
  await sw_('Show counts'); expect(await cls('no-counts')).toBe(true);
  await sw_('Clock'); expect(await cls('no-clock')).toBe(true);
  await sw_('Clock');
  await sw_('24-hour time');
  await expect(p.locator('#time')).not.toContainText(/AM|PM/i);
  await p.locator('.ctl', { hasText: 'Greeting' }).locator('input').fill('Hello there');
  await expect(p.locator('#date')).toContainText('Hello there.');
  await seg('Open links', 'New tab');
  await expect(p.locator('.tile').first()).toHaveAttribute('target', '_blank');
  await seg('Site icons', 'Sharper');
  expect(await p.locator('.tile img').first().getAttribute('src')).toContain('google.com/s2/favicons');
  await seg('Site icons', 'Private');
  await p.locator('.wall-opt', { hasText: 'Ocean' }).click();
  await p.locator('.wall-opt', { hasText: 'Solid' }).click();
  await p.locator('label.btn', { hasText: 'Solid colour' }).locator('input').evaluate(i => { i.value = '#224466'; i.dispatchEvent(new Event('input')); });
  expect(await p.evaluate(() => getComputedStyle(document.getElementById('wall')).backgroundColor)).toBe('rgb(34, 68, 102)');
  await expect.poll(async () => (await getData()).settings).toMatchObject({ theme: 'dark', accent: '#123456', cardOpacity: 0.2, clock24: true, greeting: 'Hello there', openIn: 'new', wallpaper: 'solid', wallColor: '#224466', showTitles: false });

  // wallpaper upload + remove
  const png = await p.evaluate(() => { const c = document.createElement('canvas'); c.width = 64; c.height = 40; const g = c.getContext('2d'); g.fillStyle = '#3b7'; g.fillRect(0, 0, 64, 40); return c.toDataURL('image/png').split(',')[1]; });
  const [chooser] = await Promise.all([p.waitForEvent('filechooser'), p.locator('.btn', { hasText: 'Upload image' }).click()]);
  await chooser.setFiles({ name: 'wall.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await expect.poll(() => sw.evaluate(() => chrome.storage.local.get('wallpaper').then(r => !!r.wallpaper?.data))).toBe(true);
  expect(await p.evaluate(() => document.getElementById('wall').style.background)).toContain('data:image/jpeg');
  // an undecodable file shows a message instead of failing silently
  const [ch2] = await Promise.all([p.waitForEvent('filechooser'), p.locator('.btn', { hasText: 'Upload image' }).click()]);
  await ch2.setFiles({ name: 'bad.png', mimeType: 'image/png', buffer: Buffer.from('not an image') });
  await expect(p.locator('.toast').last()).toContainText('not supported');
  await p.locator('.btn', { hasText: 'Remove image' }).click();
  await expect.poll(() => sw.evaluate(() => chrome.storage.local.get('wallpaper').then(r => r.wallpaper ?? null))).toBe(null);
  await expect.poll(async () => (await getData()).settings.wallpaper).toBe('none');

  // erase all (confirm) + undo
  await p.locator('.btn', { hasText: 'Erase all' }).click();
  await p.locator('#dialog .btn.primary').click();
  await expect.poll(async () => (await getData()).workspaces.map(w => w.name)).toEqual(['Personal', 'Work']);
  await p.locator('.toast button', { hasText: 'Undo' }).click();
  await expect.poll(async () => !!secByName(await getData(), 'Reading')).toBe(true);
  await p.close();
});

/* ---------- import / Library / organize / export ---------- */
test('import: everything goes to the Library as one list; CSV variants; organize into a workspace; export; restore', async () => {
  const p = await dashboard(baseData());
  const file = (name, text) => p.setInputFiles('#fileIn', { name, mimeType: 'text/plain', buffer: Buffer.from(text) });
  const lib = async () => (await getData()).library;
  const wsCount = async () => (await getData()).workspaces.length;

  // Brave: the optional-permission prompt cannot be clicked by automation, so stub the API with a real-shaped tree
  await p.evaluate(() => {
    chrome.permissions.request = async () => true;
    const tree = [{ id: '0', title: '', children: [
      { id: '1', title: 'Bookmarks bar', children: [{ id: '3', title: 'Brave Search', url: 'https://search.brave.com/', dateAdded: 1700000000000 },
        { id: '4', title: 'Dev', children: [{ id: '5', title: 'MDN', url: 'https://developer.mozilla.org/' }, { id: '6', title: 'bm', url: 'javascript:alert(1)' }] }] },
      { id: '2', title: 'Other bookmarks', children: [{ id: '7', title: 'Wiki', url: 'https://wikipedia.org/' }] }] }];
    Object.defineProperty(chrome, 'bookmarks', { configurable: true, value: { getTree: async () => tree } });
  });
  await p.click('.tool[data-panel="library"]');
  await expect(p.locator('.lib-hero b')).toHaveText('0');
  await p.locator('.btn', { hasText: 'Import from Brave' }).click();
  await expect.poll(async () => (await lib()).map(i => [i.title, i.folder])).toEqual([['Brave Search', 'Bookmarks bar'], ['MDN', 'Bookmarks bar / Dev'], ['Wiki', 'Other bookmarks']]);
  expect(await wsCount()).toBe(2);                                  // nothing added to the board
  await expect(p.locator('.tile')).toHaveCount(6);
  await expect(p.locator('.toast button.act', { hasText: 'Organize' })).toBeVisible();
  await expect(p.locator('.lib-hero b')).toHaveText('3');

  // importing the same thing again skips duplicates
  await p.locator('.btn', { hasText: 'Import from Brave' }).click();
  await expect(p.locator('.toast').last()).toContainText('already in your Library');
  expect((await lib()).length).toBe(3);

  // Raindrop HTML (Netscape format with nested folders, tags and notes)
  await file('Raindrop.io export.html', `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8"><TITLE>Raindrop.io Bookmarks</TITLE><H1>Raindrop.io Bookmarks</H1>
<DL><p>
<DT><H3 ADD_DATE="1700000000">Design</H3>
<DL><p>
<DT><A HREF="https://dribbble.com/" ADD_DATE="1700000000" TAGS="inspo,ui">Dribbble</A>
<DD>Shots
<DT><H3>Fonts</H3>
<DL><p><DT><A HREF="https://fonts.google.com/">Google Fonts</A></DL><p>
</DL><p>
</DL><p>`);
  await expect.poll(async () => (await lib()).length).toBe(5);
  expect((await lib()).find(i => i.title === 'Dribbble')).toMatchObject({ tags: ['inspo', 'ui'], note: 'Shots', folder: 'Design' });

  // Raindrop CSV, including a short row that used to abort the whole import
  await file('raindrop.csv', 'id,title,note,excerpt,url,folder,tags,created\n1,"Hacker News","","",https://news.ycombinator.com/,Tech,"news, tech",2024-01-02T10:00:00Z\n2,Short row,,,https://short.example/,Tech\n3,No folder,,exc,https://nofolder.example/,,,\n');
  await expect.poll(async () => (await lib()).length).toBe(8);
  expect((await lib()).find(i => i.title === 'Hacker News')).toMatchObject({ tags: ['news', 'tech'], folder: 'Tech' });

  // any spreadsheet-style CSV: other column names, semicolons, quoted commas, a bare domain
  await file('my links.csv', 'Name;Link;Category;Description\n"Figma, the tool";https://www.figma.com/;Design tools;UI\nSpotify;open.spotify.com;Music;\n');
  await expect.poll(async () => (await lib()).length).toBe(10);
  expect((await lib()).find(i => i.url === 'https://open.spotify.com/')).toMatchObject({ title: 'Spotify', folder: 'Music' });
  expect((await lib()).find(i => i.title === 'Figma, the tool').folder).toBe('Design tools');
  // a CSV with no header row, and a Pocket-style export with unix timestamps
  await file('urls.csv', 'https://www.youtube.com/watch?v=1,Some video\nhttps://github.com/anthropics,GitHub org\n');
  await expect.poll(async () => (await lib()).length).toBe(12);
  expect((await lib()).find(i => i.url === 'https://github.com/anthropics').title).toBe('GitHub org');
  await file('pocket.csv', 'title,url,time_added,tags,status\nArs,https://arstechnica.com/,1700000000,tech|news,unread\n');
  await expect.poll(async () => (await lib()).find(i => i.title === 'Ars')?.added).toBe(1700000000000);
  // plain text list of links
  await file('links.txt', 'https://www.coursera.org/\nhttps://www.amazon.com/dp/1\n');
  await expect.poll(async () => (await lib()).length).toBe(15);
  expect(await wsCount()).toBe(2);

  // search finds Library items; + adds one to the board (section under the pointer)
  await sec(p, 'Empty').hover();
  await p.keyboard.press('Escape');
  await p.locator('#q').focus();
  await p.locator('#q').fill('dribbble');
  await expect(p.locator('.res.lib .loc')).toHaveText('Library › Design');
  await p.locator('.res.lib .res-add').click();
  await expect.poll(async () => secByName(await getData(), 'Empty').items.map(i => i.title)).toEqual(['Dribbble']);
  // once on the board it is listed once, from the board
  await p.locator('#q').fill('dribbble');
  await expect(p.locator('.res .loc')).toHaveText(['Personal › Empty']);
  await p.locator('#q').fill('ars');
  await p.keyboard.press('Alt+Enter');
  await expect.poll(async () => secByName(await getData(), 'Empty').items.length).toBe(2);
  await p.keyboard.press('Escape'); await p.keyboard.press('Escape');

  // organize: a new workspace grouped by topic; the Library itself is kept
  await p.click('.tool[data-panel="library"]');
  await p.locator('.btn', { hasText: 'Organize into a workspace' }).click();
  await expect.poll(wsCount).toBe(3);
  const org = (await getData()).workspaces.at(-1);
  expect(org.name).toBe('Organized');
  const where = t => org.sections.find(s => s.items.some(i => i.title === t))?.name;
  expect(where('MDN')).toBe('Dev');
  expect(where('GitHub org')).toBe('Dev');
  expect(where('Dribbble')).toBe('Design');
  expect(where('Figma, the tool')).toBe('Design');
  expect(where('Some video')).toBe('Video');
  expect(where('Spotify')).toBe('Music');
  expect(where('Hacker News')).toBe('News');
  expect(where('Wiki')).toBe('Reference');
  expect(org.sections.find(s => s.items.some(i => i.url.includes('coursera')))?.name).toBe('Learning');
  expect(org.sections.find(s => s.items.some(i => i.url.includes('amazon')))?.name).toBe('Shopping');
  expect((await lib()).length).toBe(15);
  await expect(p.locator('.ws.on')).toContainText('Organized');
  await p.screenshot({ path: path.join(SHOTS, 'organized.png') });
  await p.click('.tool[data-panel="library"]');
  await p.waitForTimeout(300);
  await p.screenshot({ path: path.join(SHOTS, 'library-panel.png') });
  await p.keyboard.press('Escape');

  // export JSON + HTML include the Library
  await p.click('.tool[data-panel="settings"]');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.locator('.btn', { hasText: 'Back up (JSON)' }).click()]);
  const backup = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
  expect(backup.writer).toBeUndefined();
  expect(backup.library.length).toBe(15);
  const [dlh] = await Promise.all([p.waitForEvent('download'), p.locator('.btn', { hasText: 'Export HTML' }).click()]);
  const html = fs.readFileSync(await dlh.path(), 'utf8');
  expect(html).toContain('<DT><H3>Library</H3>');
  expect(html).toContain('<DT><A HREF="https://dribbble.com/"');
  expect(html).toContain('TAGS="inspo,ui"');

  // restore validates hostile data
  const small = mkData([['Restored', [['Only', [item('https://ok.example/', 'OK'), { id: 'x', url: 'javascript:alert(1)', title: 'bad' }, { id: 'y', title: 'no url' }]]]]]);
  small.settings = { accent: 'red;background:url(x)' };
  small.library = [{ url: 'data:text/html,x', title: 'bad' }, { url: 'https://fine.example/', title: 'Fine', tags: 'a, b' }];
  await file('backup.json', JSON.stringify(small));
  await p.locator('#dialog .btn.primary').click();
  await expect.poll(async () => (await getData()).workspaces.map(w => w.name)).toEqual(['Restored']);
  const r = await getData();
  expect(r.workspaces[0].sections[0].items.map(i => i.title)).toEqual(['OK']);
  expect(r.library.map(i => [i.title, i.tags])).toEqual([['Fine', ['a', 'b']]]);
  expect(r.settings.accent).toBe('#0A84FF');
  await p.locator('.toast button', { hasText: 'Undo' }).last().click();
  await expect.poll(wsCount).toBe(3);
  await file('tabogt-backup.json', JSON.stringify(backup));
  await p.locator('#dialog .btn.primary').click();
  await expect.poll(async () => (await getData()).workspaces.map(w => w.name)).toEqual(backup.workspaces.map(w => w.name));
  await p.close();
});

test('migration: a 1.0 setup moves to the black iOS look without losing choices', async () => {
  const old = baseData({ theme: 'dark', accent: '#8ab4ff', wallpaper: 'aurora', font: 'modern', radius: 18, tile: 60 });
  old.v = 1;
  delete old.settings.layout; delete old.settings.view;
  old.workspaces[0].sections[0].color = '#7ee0c3';
  const p = await dashboard(old);
  await expect.poll(async () => (await getData()).settings.theme).toBe('dark');   // not saved until something changes
  await p.keyboard.press('Alt+2');   // any change saves; the migrated setup is on the centered layout (workspace pill)
  await expect.poll(async () => (await getData()).v).toBe(3);
  const s = (await getData()).settings;
  expect(s).toMatchObject({ theme: 'black', accent: '#0A84FF', wallpaper: 'none', font: 'system', radius: 16, tile: 56, material: 'solid', layout: 'centered', view: 'list', sectionWidth: 270 });
  expect(secByName(await getData(), 'Daily').color).toBe('#30D158');
  expect(await p.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(0, 0, 0)');
  // a custom choice survives
  await setData(baseData({ theme: 'light', accent: '#ff00aa' }));
  const q = await dashboard();
  expect(await q.evaluate(() => document.documentElement.classList.contains('light'))).toBe(true);
  expect(await q.evaluate(() => document.documentElement.style.getPropertyValue('--accent'))).toBe('#ff00aa');
  await p.close(); await q.close();
});

/* ---------- two dashboards ---------- */
test('two new-tab pages stay in sync; undo is dropped when the other page writes', async () => {
  const a = await dashboard(baseData());
  const b = await dashboard();
  await a.bringToFront();
  await tile(a, 'Video').focus();
  await a.keyboard.press('Delete');
  await expect(tile(b, 'Video')).toHaveCount(0);
  await a.keyboard.press('Control+z');
  await expect(tile(b, 'Video')).toHaveCount(1);

  // A deletes, then B makes a change: A's undo must no longer be offered (it would revert B's change)
  await tile(a, 'Video').focus();
  await a.keyboard.press('Delete');
  await expect(a.locator('.toast button', { hasText: 'Undo' })).toHaveCount(1);
  await b.bringToFront();
  await sec(b, 'Empty').locator('.sec-h').click({ button: 'right' });
  await menuClick(b, 'Rename');
  await b.keyboard.press('Control+a');
  await b.keyboard.type('Renamed in B');
  await b.keyboard.press('Enter');
  await expect(sec(a, 'Renamed in B')).toHaveCount(1);
  await expect(a.locator('.toast button', { hasText: 'Undo' })).toHaveCount(0);
  await a.bringToFront();
  await a.keyboard.press('Control+z');
  await a.waitForTimeout(300);
  expect(!!secByName(await getData(), 'Renamed in B')).toBe(true);
  await a.close(); await b.close();
});

/* ---------- favicons ---------- */
test('favicons: _favicon icons are cached per site and paint from cache; unknown sites fall back to a letter', async () => {
  // visit a local page so the browser has its favicon in history
  const v = await open(`${base}/p/mail`);
  await v.waitForTimeout(1500);
  await v.close();
  let p = await dashboard(baseData());
  const mail = () => tile(p, 'Mail').locator('img');
  await expect(mail()).toHaveAttribute('src', new RegExp(`^(chrome-extension://${id}/_favicon/\?pageUrl=|data:image/png)`));
  await expect.poll(() => mail().evaluate(i => i.complete && i.naturalWidth)).toBeGreaterThan(0);
  await expect(tile(p, 'Mystery').locator('.letter')).toHaveText('U');
  await p.waitForTimeout(800);   // cache writes are batched
  await p.close();
  // next new tab: icons come straight from the cache, no _favicon request
  p = await dashboard();
  await expect(mail()).toHaveAttribute('src', /^data:image\/png/);
  expect(await p.evaluate(() => [...document.querySelectorAll('.tile img')].filter(i => i.src.includes('/_favicon/')).length)).toBe(0);
  await expect(tile(p, 'Mystery').locator('.letter')).toHaveText('U');
  await p.screenshot({ path: path.join(SHOTS, 'favicons.png'), clip: { x: 0, y: 150, width: 1100, height: 260 } });
  await p.close();
});

/* ---------- accessibility ---------- */
test('a11y: visible focus, menus by keyboard, focus return, reduced motion', async () => {
  const p = await dashboard(baseData());
  await tile(p, 'Mail').focus();
  await p.keyboard.press('Tab');
  const ring = await p.evaluate(() => { const a = document.activeElement; const t = a.classList.contains('tile') ? a.querySelector('.plate') : a; return getComputedStyle(t).outlineStyle; });
  expect(ring).not.toBe('none');

  // section "More" button by keyboard: opens menu with focus, Esc returns focus to the button
  const more = sec(p, 'Daily').locator('.icon-btn[title="More"]');
  await more.focus();
  await p.keyboard.press('Enter');
  await expect(p.locator('#menu .mi').first()).toBeFocused();
  await p.keyboard.press('Escape');
  await expect(more).toBeFocused();

  // dialog traps Tab
  await tile(p, 'Mail').focus();
  await p.keyboard.press('e');
  for (let i = 0; i < 12; i++) await p.keyboard.press('Tab');
  expect(await p.evaluate(() => document.getElementById('dialog').contains(document.activeElement))).toBe(true);
  await p.keyboard.press('Escape');
  await expect(tile(p, 'Mail')).toBeFocused();

  await p.emulateMedia({ reducedMotion: 'reduce' });
  await p.click('.tool[data-panel="notes"]');
  expect(await p.evaluate(() => getComputedStyle(document.getElementById('drawer')).animationName)).toBe('none');
  await p.close();
});

/* ---------- performance ---------- */
test('performance: 3,000 bookmarks in 60 sections', async () => {
  const sections = Array.from({ length: 60 }, (_, s) => [`Section ${s + 1}`,
    Array.from({ length: 50 }, (_, i) => item(`https://site${(s * 50 + i) % 700}.example/page/${s}-${i}`, `Bookmark ${s}-${i}`, i % 7 ? [] : ['tagged']))]);
  const big = mkData([['Big', sections], ['Other', [['Inbox', []]]]]);
  await setData(big);
  const p = await open(NT());
  const cdp = await ctx.newCDPSession(p);
  await p.waitForFunction(() => document.querySelectorAll('.tile').length === 3000, null, { polling: 'raf' });
  const loadMs = Math.round(await p.evaluate(() => performance.now()));   // navigation start -> 3,000 tiles in the DOM

  // cost of one change (full re-render): collapse a section, wait for the next frame
  const commitMs = await p.evaluate(async () => {
    const times = [];
    for (let k = 0; k < 5; k++) {
      const btn = document.querySelector('.sec .sec-h .icon-btn');
      const t = performance.now();
      btn.click();
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      times.push(performance.now() - t);
    }
    return times.sort((a, b) => a - b)[2];
  });

  // dragover handler cost on a 50-tile section (fires ~every 50ms while dragging)
  const dragoverMs = await p.evaluate(() => {
    const el = document.querySelectorAll('.sec')[5], r = el.getBoundingClientRect();
    const dt = new DataTransfer(); dt.setData('text/uri-list', 'https://x.example/');
    const t = performance.now();
    for (let i = 0; i < 200; i++) el.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.left + (i % 200), clientY: r.top + 60 + (i % 100) }));
    return (performance.now() - t) / 200;
  });

  // scrolling frame time, with glass blur on and off. Reported, not asserted: headless frame pacing is throttled.
  const scroll = () => p.evaluate(async () => {
    window.scrollTo(0, 0);
    const frames = []; let last = performance.now();
    for (let i = 0; i < 90; i++) {
      window.scrollBy(0, 60);
      await new Promise(r => requestAnimationFrame(r));
      const now = performance.now(); frames.push(now - last); last = now;
    }
    frames.sort((a, b) => a - b);
    return { median: frames[45], p95: frames[85] };
  });
  const withBlur = await scroll();
  await p.evaluate(() => document.documentElement.style.setProperty('--blur', '0px'));
  const noBlur = await scroll();

  // search over 3,000 items
  const searchMs = await p.evaluate(() => { const q = document.getElementById('q'); q.focus(); const t = performance.now(); q.value = 'bookmark 42 #tagged'; q.dispatchEvent(new Event('input')); return performance.now() - t; });

  // listener / node leak check: 20 re-renders, then compare counters after GC
  await cdp.send('HeapProfiler.collectGarbage');
  const before = await cdp.send('Memory.getDOMCounters');
  await p.evaluate(async () => { for (let k = 0; k < 20; k++) { document.querySelector('.sec .sec-h .icon-btn').click(); await new Promise(r => setTimeout(r, 10)); } });
  await p.waitForTimeout(300);
  await cdp.send('HeapProfiler.collectGarbage');
  const after = await cdp.send('Memory.getDOMCounters');

  const report = { loadMs, commitMs: Math.round(commitMs), dragoverMs: +dragoverMs.toFixed(3), searchMs: Math.round(searchMs), scrollWithBlur: withBlur, scrollNoBlur: noBlur, domBefore: before, domAfter: after };
  console.log('PERF', JSON.stringify(report));
  fs.writeFileSync(path.join(SHOTS, 'perf.json'), JSON.stringify(report, null, 2));
  await p.screenshot({ path: path.join(SHOTS, 'perf-3000.png') });

  expect(after.jsEventListeners).toBeLessThan(before.jsEventListeners * 1.1 + 50);
  expect(after.nodes).toBeLessThan(before.nodes * 1.1 + 500);
  expect(commitMs).toBeLessThan(1000);
  expect(dragoverMs).toBeLessThan(8);
  await p.close();
});

/* ---------- drag and drop everywhere + right-click menus ---------- */
test('drag search results, Library folders, sessions, windows and workspaces; right-click menus everywhere', async () => {
  const d = baseData();
  d.library = [
    { id: 'l1', url: `${base}/p/libone`, title: 'Lib One', tags: [], note: '', added: 1, folder: 'Reading list' },
    { id: 'l2', url: `${base}/p/libtwo`, title: 'Lib Two', tags: [], note: '', added: 2, folder: 'Reading list' },
    { id: 'l3', url: `${base}/p/libthree`, title: 'Lib Three', tags: [], note: '', added: 3, folder: 'Reading list' }
  ];
  d.sessions = [{ id: 's1', name: 'Morning', created: Date.now(), tabs: [{ url: `${base}/p/sess1`, title: 'Sess One' }, { url: `${base}/p/sess2`, title: 'Sess Two' }] }];
  const p = await dashboard(d);
  const titlesIn = async name => secByName(await getData(), name)?.items.map(i => i.title);
  const libTitles = async () => (await getData()).library.map(i => i.title);
  const search = async text => { await p.locator('#q').focus(); await p.locator('#q').fill(text); await expect(p.locator('.res').first()).toBeVisible(); };
  const libBtn = p.locator('.tool[data-panel="library"]');

  // a board bookmark dragged from search onto another section moves there
  await search('zeta');
  await p.locator('.res', { hasText: 'Zeta article' }).dragTo(sec(p, 'Daily'));
  await expect.poll(() => titlesIn('Daily')).toContain('Zeta article');
  expect(await titlesIn('Reading')).not.toContain('Zeta article');
  await expect(p.locator('#results')).toBeHidden();

  // a Library link dragged from search is copied onto the board; the Library keeps it
  await search('lib one');
  await p.locator('.res.lib', { hasText: 'Lib One' }).dragTo(sec(p, 'Daily'));
  await expect.poll(() => titlesIn('Daily')).toContain('Lib One');
  expect(await libTitles()).toContain('Lib One');
  // ... and onto a workspace tab
  await search('lib two');
  await p.locator('.res.lib', { hasText: 'Lib Two' }).dragTo(p.locator('.ws', { hasText: 'Work' }));
  await expect.poll(() => titlesIn('Inbox')).toContain('Lib Two');

  // right-click a Library result: Add to section > Reading
  await search('lib three');
  await p.locator('.res.lib', { hasText: 'Lib Three' }).click({ button: 'right' });
  await expect(p.locator('#menu')).toBeVisible();
  await p.screenshot({ path: path.join(SHOTS, 'result-menu.png') });
  await menuClick(p, 'Add to section');
  await menuClick(p, 'Reading');
  await expect.poll(() => titlesIn('Reading')).toContain('Lib Three');
  // right-click a board result: Move to Library
  await search('mail');
  await p.locator('.res', { hasText: 'Mail' }).first().click({ button: 'right' });
  await menuClick(p, 'Move to Library');
  await expect.poll(libTitles).toContain('Mail');
  expect(await titlesIn('Daily')).not.toContain('Mail');
  // clicking a result still opens it
  await search('alpha');
  await expect(p.locator('.res', { hasText: 'Alpha article' })).toBeVisible();

  // a tile dropped on the Library button moves into the Library
  await p.keyboard.press('Escape'); await p.keyboard.press('Escape');
  await tile(p, 'News').dragTo(libBtn);
  await expect.poll(libTitles).toContain('News');
  expect(await titlesIn('Daily')).not.toContain('News');
  // a whole section dropped on it becomes a Library folder
  await sec(p, 'Reading').locator('.sec-h').dragTo(libBtn);
  await expect.poll(async () => !!secByName(await getData(), 'Reading')).toBe(false);
  expect((await getData()).library.filter(i => i.folder === 'Reading').map(i => i.title)).toEqual(expect.arrayContaining(['Alpha article', 'Lib Three']));
  await p.locator('.toast button.undo').last().click();
  await expect.poll(async () => !!secByName(await getData(), 'Reading')).toBe(true);

  // workspace tabs reorder by drag
  const wsNames = async () => (await getData()).workspaces.map(w => w.name);
  const pers = await p.locator('.ws', { hasText: 'Personal' }).boundingBox();
  await p.locator('.ws', { hasText: 'Work' }).dragTo(p.locator('.ws', { hasText: 'Personal' }), { targetPosition: { x: 4, y: pers.height / 2 } });
  await expect.poll(wsNames).toEqual(['Work', 'Personal']);

  // Library panel: drag a folder onto a workspace tab -> new section there; right-click -> rename
  await p.click('.tool[data-panel="library"]');
  const folderRow = p.locator('.row', { hasText: 'Reading list' });
  await folderRow.dragTo(p.locator('.ws', { hasText: 'Work' }));
  await expect.poll(() => titlesIn('Reading list')).toEqual(['Lib One', 'Lib Two', 'Lib Three']);
  expect(wsByName(await getData(), 'Work').sections.map(s => s.name)).toContain('Reading list');
  await folderRow.click({ button: 'right' });
  await menuClick(p, 'Rename folder');
  await p.locator('#dialog input').fill('Later');
  await p.keyboard.press('Enter');
  await expect.poll(async () => (await getData()).library.filter(i => i.folder === 'Later').length).toBe(3);
  await p.keyboard.press('Escape');

  // right-click empty board space
  await p.locator('.ws', { hasText: 'Personal' }).click();
  await p.mouse.click(150, 780, { button: 'right' });
  await expect(p.locator('#menu')).toBeVisible();
  await expect(p.locator('#menu .mi').first()).toContainText('New section');
  await p.screenshot({ path: path.join(SHOTS, 'board-menu.png') });
  await p.keyboard.press('Escape');

  // Sessions: drag the card onto a section; right-click menu
  await p.click('.tool[data-panel="sessions"]');
  await p.locator('.sess').dragTo(sec(p, 'Daily'));
  await expect.poll(() => titlesIn('Daily')).toEqual(expect.arrayContaining(['Sess One', 'Sess Two']));
  await p.locator('.sess .sess-top').click({ button: 'right' });
  await menuClick(p, 'Save to Library');
  await expect.poll(libTitles).toContain('Sess Two');
  await p.keyboard.press('Escape');

  // Open tabs: right-click a tab, and drag a whole window onto a workspace tab
  const other = await open(`${base}/p/open-tab`);
  await p.bringToFront();
  await p.click('.tool[data-panel="tabs"]');
  const row = p.locator('.tab-row', { hasText: 'Page open-tab' });
  await row.click({ button: 'right' });
  await menuClick(p, 'Save to section');
  await menuClick(p, 'Empty');
  await expect.poll(() => titlesIn('Empty')).toEqual(['Page open-tab']);
  await p.locator('.win-h').first().dragTo(p.locator('.ws', { hasText: 'Work' }));
  await expect.poll(async () => wsByName(await getData(), 'Work').sections.map(s => s.name)).toContain('Saved tabs');
  await other.close();
  await p.close();
});

/* ---------- every accent stays readable ---------- */
test('accent colours: buttons and accent text stay readable in every theme (White, Yellow, custom dark...)', async () => {
  const contrast = (p, sel, bgSel) => p.evaluate(([sel, bgSel]) => {
    const rgb = s => s.match(/[\d.]+/g).slice(0, 3).map(Number);
    const L = c => c.map(v => v / 255).map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
    const el = document.querySelector(sel), fg = rgb(getComputedStyle(el).color);
    let bgEl = bgSel ? document.querySelector(bgSel) : el, bg;
    // skip see-through fills (e.g. the 12% grey behind plain buttons): measure against the solid surface underneath
    while (bgEl) { const c = getComputedStyle(bgEl).backgroundColor, al = /rgba/.test(c) ? +c.match(/[\d.]+/g)[3] : 1; if (al >= 0.9) { bg = rgb(c); break; } bgEl = bgEl.parentElement; }
    const a = L(fg), b = L(bg || [0, 0, 0]);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  }, [sel, bgSel]);
  const accents = ['#0A84FF', '#5E5CE6', '#BF5AF2', '#FF375F', '#FF453A', '#FF9F0A', '#FFD60A', '#30D158', '#63E6E2', '#64D2FF', '#8E8E93', '#F2F2F7', '#111111'];
  for (const theme of ['black', 'dark', 'light']) {
    for (const accent of accents) {
      const d = baseData({ theme, accent });
      d.library = [{ id: 'l1', url: `${base}/p/x`, title: 'X', tags: [], note: '', added: 1 }];
      const p = await dashboard(d);
      await p.click('.tool[data-panel="library"]');
      const btn = await contrast(p, '.btn.primary');               // "Organize" (accent-filled)
      const tool = await contrast(p, '.tool.on');                   // active toolbar button (accent-filled)
      const icon = await contrast(p, '.ws.add', '.wstabs');         // accent-coloured icon
      const link = await contrast(p, '.drawer .btn:not(.primary)'); // accent-coloured button text
      expect.soft(btn, `${theme} ${accent} primary button`).toBeGreaterThanOrEqual(3);
      expect.soft(tool, `${theme} ${accent} active tool`).toBeGreaterThanOrEqual(3);
      expect.soft(icon, `${theme} ${accent} accent icon`).toBeGreaterThanOrEqual(2.6);
      expect.soft(link, `${theme} ${accent} accent text`).toBeGreaterThanOrEqual(2.6);
      if (accent === '#F2F2F7' && theme !== 'dark') await p.waitForTimeout(400), await p.screenshot({ path: path.join(SHOTS, `accent-white-${theme}.png`) });
      await p.close();
    }
  }
  // the popup's Save button too
  await setData(baseData({ theme: 'black', accent: '#F2F2F7' }));
  const target = await open(`${base}/p/accent-popup`);
  const pop = await openPopup(target);
  expect(await contrast(pop, '#saveBtn')).toBeGreaterThanOrEqual(4.5);
  await pop.screenshot({ path: path.join(SHOTS, 'popup-white-accent.png') });
  await pop.close(); await target.close();
});

/* ---------- Tabisto-style centered layout, wallpapers and frost ---------- */
test('centered layout: pill switcher, centered clock + greeting, frosted list cards, wallpapers (gradient + link), tuning sliders', async () => {
  const p = await dashboard(baseData({ layout: 'centered', view: 'list' }));
  const cls = c => p.evaluate(c => document.documentElement.classList.contains(c), c);
  const css = v => p.evaluate(v => document.documentElement.style.getPropertyValue(v), v);
  expect(await cls('layout-centered')).toBe(true);
  await expect(p.locator('#wsPill')).toBeVisible();
  await expect(p.locator('#wsPill')).toContainText('Personal');
  await expect(p.locator('.wsbar')).toBeHidden();
  await expect(p.locator('#greet')).toHaveText(/^Good (morning|afternoon|evening|night)\.$/);
  // rows show the site under the title, and every card has "+ Add link"
  await expect(tile(p, 'Mail').locator('.h')).toBeVisible();
  await sec(p, 'Daily').locator('.add-link').click();
  await expect(sec(p, 'Daily').locator('.add-row input')).toBeFocused();
  await p.keyboard.press('Escape');

  // the pill switches workspaces
  await p.locator('#wsPill').click();
  await menuClick(p, 'Work');
  await expect(p.locator('#wsPill')).toContainText('Work');
  await p.locator('#wsPill').click();
  await menuClick(p, 'Personal');

  // while dragging, the workspace tabs float in as drop targets
  const src = await tile(p, 'Video').boundingBox();
  await p.mouse.move(src.x + 10, src.y + 10);
  await p.mouse.down();
  await p.mouse.move(src.x + 30, src.y + 30, { steps: 4 });
  await expect(p.locator('.wsbar')).toBeVisible();
  await p.locator('.ws', { hasText: 'Work' }).hover();
  await p.mouse.up();
  await expect.poll(async () => secByName(await getData(), 'Inbox').items.map(i => i.title)).toEqual(['Video']);
  await expect(p.locator('.wsbar')).toBeHidden();

  // wallpapers: a gradient turns on frosted cards
  await p.click('.tool[data-panel="settings"]');
  await p.locator('.wall-opt', { hasText: 'Nebula' }).click();
  await expect.poll(async () => (await getData()).settings).toMatchObject({ wallpaper: 'nebula', material: 'frosted' });
  expect(await cls('has-wall')).toBe(true);
  expect(await cls('mat-frosted')).toBe(true);
  expect(await p.evaluate(() => getComputedStyle(document.querySelector('.sec')).backdropFilter)).toContain('blur');
  // tuning sliders (Tabisto's: card opacity, blur intensity, card radius, grid spacing, density, glow)
  const range = (label, v) => p.locator('.ctl', { hasText: new RegExp(`^${label}`) }).locator('input[type=range]').evaluate((r, v) => { r.value = v; r.dispatchEvent(new Event('input', { bubbles: true })); }, v);
  await range('Card opacity', 0.4); expect(await css('--card-opacity')).toBe('0.4');
  await range('Blur intensity', 30); expect(await css('--blur')).toBe('30px');
  await range('Card radius', 12); expect(await css('--radius')).toBe('12px');
  await range('Glow', 0.8); expect(await css('--glow')).toBe('0.8');
  await range('Density', 0.9); expect(await css('--density')).toBe('0.9');
  await range('Grid spacing', 20); expect(await css('--gap')).toBe('20px');
  await p.keyboard.press('Escape');
  await p.waitForTimeout(400);
  await p.screenshot({ path: path.join(SHOTS, 'centered-nebula-black.png') });

  // image from a link: a bad link is refused, a real image becomes the wallpaper
  await p.click('.tool[data-panel="settings"]');
  await p.locator('.btn', { hasText: 'Image from link' }).click();
  await p.locator('#dialog input').fill(`${base}/p/not-an-image`);
  await p.keyboard.press('Enter');
  await expect(p.locator('.toast').last()).toContainText('did not load as an image');
  await p.locator('.btn', { hasText: 'Image from link' }).click();
  await p.locator('#dialog input').fill(`${base}/fav.png`);
  await p.keyboard.press('Enter');
  await expect.poll(async () => (await getData()).settings.wallpaper).toBe('image');
  expect(await p.evaluate(() => document.getElementById('wall').style.background)).toContain('/fav.png');
  expect((await sw.evaluate(() => chrome.storage.local.get('wallpaper'))).wallpaper.url).toContain('/fav.png');

  // light theme on a light gradient
  await p.locator('.ctl', { hasText: /^Theme/ }).locator('.seg button', { hasText: 'Light' }).click();
  await p.locator('.wall-opt', { hasText: 'Aurora' }).click();
  await p.keyboard.press('Escape');
  await p.waitForTimeout(400);
  await p.screenshot({ path: path.join(SHOTS, 'centered-aurora-light.png') });

  // switching back to the Board layout
  await p.click('.tool[data-panel="settings"]');
  await p.locator('.ctl', { hasText: /^Layout/ }).locator('.seg button', { hasText: 'Board' }).click();
  expect(await cls('layout-centered')).toBe(false);
  await expect(p.locator('.wsbar')).toBeVisible();
  await expect(p.locator('#wsPill')).toBeHidden();
  await p.close();
});

/* ---------- sync: merge logic ---------- */
test('sync merge: three-way merge keeps both laptops\' changes', async () => {
  const { mergeDocs, mergeList } = await import(require('url').pathToFileURL(path.join(EXT, 'sync.js')).href);
  const it = (id, url, title = id) => ({ id, url, title, tags: [], note: '', added: 1 });
  const doc = items => ({ v: 2, workspaces: [{ id: 'w', name: 'Personal', notes: '', sections: [{ id: 's', name: 'Daily', color: '#0A84FF', collapsed: false, items }] }], library: [], sessions: [], settings: { theme: 'black', accent: '#0A84FF' } });
  const ids = d => d.workspaces[0].sections[0].items.map(i => i.id);
  const base = doc([it('a', 'https://a.x/'), it('b', 'https://b.x/'), it('c', 'https://c.x/')]);
  // A deletes b, B adds d: both happen
  let m = mergeDocs(base, doc([it('a', 'https://a.x/'), it('c', 'https://c.x/')]), doc([it('a', 'https://a.x/'), it('b', 'https://b.x/'), it('c', 'https://c.x/'), it('d', 'https://d.x/')]));
  expect(ids(m)).toEqual(['a', 'c', 'd']);
  // A edits a title and reorders, B edits c's title: all kept
  m = mergeDocs(base, doc([it('c', 'https://c.x/'), it('a', 'https://a.x/', 'A2'), it('b', 'https://b.x/')]), doc([it('a', 'https://a.x/'), it('b', 'https://b.x/'), it('c', 'https://c.x/', 'C2')]));
  expect(m.workspaces[0].sections[0].items.map(i => [i.id, i.title])).toEqual([['c', 'C2'], ['a', 'A2'], ['b', 'b']]);
  // only the other laptop reordered: its order is used
  m = mergeDocs(base, base, doc([it('c', 'https://c.x/'), it('b', 'https://b.x/'), it('a', 'https://a.x/')]));
  expect(ids(m)).toEqual(['c', 'b', 'a']);
  // deleted on one side but edited on the other: the edit wins
  m = mergeDocs(base, doc([it('a', 'https://a.x/'), it('c', 'https://c.x/')]), doc([it('a', 'https://a.x/'), it('b', 'https://b.x/', 'edited'), it('c', 'https://c.x/')]));
  expect(ids(m)).toContain('b');
  // first-time merge of two separately set-up laptops: same-named workspace/section and same URL are joined
  const other = doc([it('x1', 'https://a.x'), it('x2', 'https://z.x/')]);
  other.workspaces[0].id = 'w2'; other.workspaces[0].sections[0].id = 's2';
  m = mergeDocs(null, base, other);
  expect(m.workspaces.length).toBe(1);
  expect(m.workspaces[0].sections.length).toBe(1);
  expect(m.workspaces[0].sections[0].items.map(i => i.url)).toEqual(['https://a.x/', 'https://z.x/', 'https://b.x/', 'https://c.x/']);   // new links land next to their neighbour
  // settings merge per field
  const bs = { ...base, settings: { theme: 'black', accent: '#0A84FF', tile: 56 } };
  m = mergeDocs(bs, { ...bs, settings: { theme: 'light', accent: '#0A84FF', tile: 56 } }, { ...bs, settings: { theme: 'black', accent: '#FF375F', tile: 56 } });
  expect(m.settings).toEqual({ theme: 'light', accent: '#FF375F', tile: 56 });
  // Library: deletion on one side, addition on the other
  expect(mergeList([it('l1', 'https://l1/')], [], [it('l1', 'https://l1/'), it('l2', 'https://l2/')], 'lib').map(i => i.id)).toEqual(['l2']);
});

/* ---------- sync: two laptops through a (fake) private GitHub repo ---------- */
test('sync: connect, second laptop pulls, edits on both laptops merge, errors are shown', async () => {
  const api = `${base}/gh`;
  const setApi = p => p.evaluate(a => localStorage.setItem('tabogt-sync-api', a), api);
  const syncGroupEl = p => p.locator('.group', { hasText: 'Sync (private GitHub' });
  const openSync = async p => {
    if (!(await p.locator('#drawer').isVisible())) await p.evaluate(() => document.querySelector('.tool[data-panel="settings"]').click());
    await syncGroupEl(p).scrollIntoViewIfNeeded();
  };

  // ---- laptop A
  await setData(baseData());
  const a = await dashboard();
  await setApi(a);
  await openSync(a);
  const g = syncGroupEl(a);
  await g.getByLabel('Repository (owner/name)').fill('https://github.com/me/tabogt-data.git');
  await g.getByLabel('Access token').fill('wrong-token');
  await g.locator('.btn', { hasText: 'Connect' }).click();
  await expect(a.locator('.toast').last()).toContainText('rejected the token');
  // a public repository asks first
  await g.getByLabel('Repository (owner/name)').fill('me/open-repo');
  await g.getByLabel('Access token').fill('good-token');
  await g.locator('.btn', { hasText: 'Connect' }).click();
  await expect(a.locator('#dialog')).toContainText('public');
  await a.locator('#dialog .btn', { hasText: 'Cancel' }).click();
  await g.getByLabel('Repository (owner/name)').fill('me/tabogt-data');
  await g.locator('.btn', { hasText: 'Connect' }).click();
  await expect.poll(() => ghDoc()?.workspaces.map(w => w.name), { timeout: 15000 }).toEqual(['Personal', 'Work']);
  await expect(syncGroupEl(a).locator('.sync-status')).toHaveText(/Synced/);
  expect(JSON.stringify(ghDoc())).not.toContain('good-token');
  await a.screenshot({ path: path.join(SHOTS, 'sync-connected.png') });
  await a.keyboard.press('Escape');

  // ---- laptop B: a separate browser profile, fresh install
  const dirB = fs.mkdtempSync(path.join(os.tmpdir(), 'tabogt-test-b-'));
  const ctxB = await chromium.launchPersistentContext(dirB, { executablePath: BROWSER, channel: BROWSER ? undefined : 'chromium', headless: !process.env.HEADED,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`] });
  try {
    let [swB] = ctxB.serviceWorkers();
    if (!swB) swB = await ctxB.waitForEvent('serviceworker');
    const idB = swB.url().split('/')[2];
    const b = await ctxB.newPage();
    await b.setViewportSize({ width: 1440, height: 900 });
    b.on('pageerror', e => errors.push('laptopB: ' + e.message));
    await b.goto(`chrome-extension://${idB}/newtab.html`);
    await b.waitForSelector('.sec');
    await setApi(b);
    await openSync(b);
    const gb = syncGroupEl(b);
    await gb.getByLabel('Repository (owner/name)').fill('me/tabogt-data');
    await gb.getByLabel('Access token').fill('good-token');
    await gb.locator('.btn', { hasText: 'Connect' }).click();
    await expect(b.locator('#dialog')).toContainText('already has TabOgt data');
    await b.screenshot({ path: path.join(SHOTS, 'sync-first-choice.png') });
    await b.locator('#dialog .btn', { hasText: 'Use GitHub data' }).click();
    await expect(b.locator('.tile')).toHaveCount(6, { timeout: 15000 });
    await b.keyboard.press('Escape');
    const dataB = () => swB.evaluate(() => chrome.storage.local.get('data').then(r => r.data));
    expect((await dataB()).workspaces.map(w => w.name)).toEqual(['Personal', 'Work']);

    // B adds a bookmark -> uploaded -> A pulls it
    await sec(b, 'Empty').hover();
    await b.evaluate(url => { const dt = new DataTransfer(); dt.setData('text/plain', url); document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); }, `${base}/p/from-laptop-b`);
    await expect.poll(() => JSON.stringify(ghDoc()), { timeout: 15000 }).toContain('/p/from-laptop-b');
    await sw.evaluate(() => tabogtTest.syncNow());
    await expect(a.locator('.tile[href$="/p/from-laptop-b"]')).toHaveCount(1);

    // both edit before syncing: A deletes Video, B adds to its Library. Both changes survive on both laptops.
    await tile(a, 'Video').focus();
    await a.keyboard.press('Delete');
    await b.evaluate(url => import('./store.js').then(s => s.update(d => { s.addItem(d, 'library', { url, title: 'Saved on B', folder: 'B' }); })), `${base}/p/lib-b`);
    await sw.evaluate(() => tabogtTest.syncNow());
    await swB.evaluate(() => tabogtTest.syncNow());
    await sw.evaluate(() => tabogtTest.syncNow());
    const titlesOn = async get => { const x = await get(); return { board: x.workspaces.flatMap(w => w.sections.flatMap(s => s.items.map(i => i.url.endsWith('/p/from-laptop-b') ? 'from B' : i.title))), lib: x.library.map(i => i.title) }; };
    for (const get of [getData, dataB]) {
      const t = await titlesOn(get);
      expect(t.board).not.toContain('Video');
      expect(t.board).toContain('from B');
      expect(t.lib).toContain('Saved on B');
    }
    expect(ghDoc().library.map(i => i.title)).toContain('Saved on B');

    // settings travel too
    await b.evaluate(() => import('./store.js').then(s => s.update(d => { d.settings.accent = '#FF375F'; })));
    await swB.evaluate(() => tabogtTest.syncNow());
    await sw.evaluate(() => tabogtTest.syncNow());
    await expect.poll(() => a.evaluate(() => document.documentElement.style.getPropertyValue('--accent'))).toBe('#FF375F');

    // an expired token shows up as a clear status; disconnecting stops sync but keeps the data
    gh.token = 'rotated';
    await sw.evaluate(() => tabogtTest.syncNow());
    await openSync(a);
    await expect(syncGroupEl(a).locator('.sync-status')).toHaveText(/rejected the token/);
    gh.token = 'good-token';
    await syncGroupEl(a).locator('.btn', { hasText: 'Disconnect' }).click();
    await a.locator('#dialog .btn.primary').click();
    await expect(syncGroupEl(a).getByLabel('Access token')).toBeVisible();
    expect((await sw.evaluate(() => chrome.storage.local.get(['sync', 'syncBase']))).sync).toBeUndefined();
    await expect(a.locator('.tile[href$="/p/from-laptop-b"]')).toHaveCount(1);
    await b.close();
  } finally {
    await ctxB.close();
  }
  await a.close();
});

test('no console errors or CSP violations anywhere', async () => {
  // "Sharper" icons come from Google's favicon service, which answers 404 for sites it has never seen
  // (our 127.0.0.1 test pages). The page then shows the letter fallback; that 404 is expected network noise.
  // The sync test's fake GitHub answers 401 for the deliberately wrong token and 404 for "no data file yet"
  // on first connect; the browser logs those itself. Both are expected.
  const ours = errors.filter(e => !/gstatic\.com\/faviconV2|google\.com\/s2\/favicons|net::ERR_/.test(e) && !/status of (401|404) .*\/gh\/repos\//.test(e));
  expect(ours).toEqual([]);
});
