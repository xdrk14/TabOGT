import { load, update, addItem, findSection, favicon, locate, savable, uid, COLORS, defaultSection, LIBRARY, placeLabel, accentVars } from './store.js';

const $ = id => document.getElementById(id);
let D, tab;

const tagsOf = v => v.split(',').map(t => t.trim().replace(/^#/, '')).filter(Boolean);

function status(msg, close = false) {
  $('status').textContent = msg;
  if (close) setTimeout(() => window.close(), 750);
}

function fillSections() {
  const sel = $('section');
  sel.innerHTML = '';
  const lib = document.createElement('optgroup');
  lib.label = 'Library';
  lib.append(new Option('Library (search only)', LIBRARY));
  sel.append(lib);
  for (const w of D.workspaces) {
    const g = document.createElement('optgroup');
    g.label = w.name;
    for (const s of w.sections) g.append(new Option(s.name, s.id));
    const n = new Option('+ New section in ' + w.name + '…', 'new:' + w.id);
    g.append(n);
    sel.append(g);
  }
  sel.value = defaultSection(D).id;
}

// Resolves the chosen section inside d (a fresh copy); falls back if it was deleted meanwhile.
function targetSection(d) {
  const v = $('section').value;
  if (v === LIBRARY) return LIBRARY;
  if (!v.startsWith('new:')) return findSection(d, v) ? v : defaultSection(d).id;
  const w = d.workspaces.find(x => x.id === v.slice(4));
  if (!w) return defaultSection(d).id;
  const name = $('newSec').value.trim() || 'New section';
  const s = { id: uid(), name, color: COLORS[w.sections.length % COLORS.length], collapsed: false, items: [] };
  w.sections.push(s);
  return s.id;
}

async function init() {
  D = await load();
  const light = D.settings.theme === 'light' || (D.settings.theme === 'system' && matchMedia('(prefers-color-scheme: light)').matches);
  document.documentElement.classList.toggle('light', light);
  document.documentElement.classList.toggle('theme-dark', !light && D.settings.theme === 'dark');
  document.documentElement.style.setProperty('--accent', D.settings.accent);
  for (const [k, v] of Object.entries(accentVars(D.settings.accent, light))) document.documentElement.style.setProperty(k, v);
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  fillSections();

  if (tab && savable(tab.url)) {
    $('title').value = tab.title || '';
    $('url').textContent = tab.url;
    $('fav').addEventListener('error', () => { $('fav').src = 'icons/32.png'; }, { once: true });
    $('fav').src = favicon(tab.url, 64, D.settings.iconSource);
    const hits = locate(D, tab.url);
    if (hits.length) {
      $('exists').hidden = false;
      $('exists').textContent = 'Already saved in ' + hits.map(placeLabel).join(', ');
    }
  } else {
    $('title').value = 'This page cannot be saved';
    $('title').disabled = true;
    $('url').textContent = tab?.url || '';
    $('saveBtn').disabled = true;
    $('fav').src = 'icons/32.png';
  }
  $('title').select();
}

$('section').addEventListener('change', e => {
  $('newSecRow').hidden = !e.target.value.startsWith('new:');
  if (!$('newSecRow').hidden) $('newSec').focus();
});

// Applies fn to a fresh copy under the shared lock, so changes made on the dashboard while
// this popup was open are kept. One write per popup: repeat clicks or Enter presses are ignored.
let busy = false;
async function write(fn) {
  if (busy) return null;
  busy = true;
  document.querySelectorAll('button').forEach(b => { b.disabled = true; });
  let out = null;
  await update(d => { out = fn(d); });
  return out;
}

async function saveOne() {
  if (!tab || !savable(tab.url)) return;
  const f = await write(d => {
    const secId = targetSection(d);
    addItem(d, secId, { url: tab.url, title: $('title').value, tags: tagsOf($('tags').value), note: $('note').value.trim() });
    return findSection(d, secId) || { lib: true };
  });
  if (f) status(f.lib ? 'Saved to Library' : `Saved to ${f.w.name} › ${f.s.name}`, true);
}

$('saveBtn').addEventListener('click', saveOne);
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter' || e.isComposing || e.target.tagName === 'BUTTON') return;
  if (!e.shiftKey && e.target.tagName !== 'TEXTAREA') { e.preventDefault(); saveOne(); }
  else if (e.key === 'Enter' && e.ctrlKey && e.target.tagName === 'TEXTAREA') { e.preventDefault(); saveOne(); }
});

$('saveAll').addEventListener('click', async () => {
  const tabs = (await chrome.tabs.query({ currentWindow: true })).filter(t => savable(t.url));
  if (!tabs.length) return status('No web pages open in this window.');
  const f = await write(d => {
    const secId = targetSection(d);
    tabs.forEach(t => addItem(d, secId, { url: t.url, title: t.title, tags: tagsOf($('tags').value) }));
    return findSection(d, secId) || { s: { name: 'Library' } };
  });
  if (f) status(`Saved ${tabs.length} tabs to ${f.s.name}`, true);
});

$('saveSession').addEventListener('click', async () => {
  const tabs = (await chrome.tabs.query({ currentWindow: true })).filter(t => savable(t.url));
  if (!tabs.length) return status('No web pages open in this window.');
  const name = new Date().toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  const ok = await write(d => d.sessions.unshift({ id: uid(), name, created: Date.now(), tabs: tabs.map(t => ({ url: t.url, title: t.title })) }));
  if (ok) status(`Session saved (${tabs.length} tabs)`, true);
});

$('openDash').addEventListener('click', () => { chrome.tabs.create({ url: 'chrome://newtab' }); window.close(); });

init();
