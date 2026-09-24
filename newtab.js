import {
  WRITER, uid, COLORS, DEFAULT_SETTINGS, seed, normalizeData, load, save, write, normalizeUrl, host, favicon,
  locate, urlKey, findSection, addItem, savable, LIBRARY, placeLabel, accentVars
} from './store.js';
import { organize } from './organize.js';
import { checkRepo, readRemote } from './sync.js';

/* ================= Helpers ================= */
const $ = id => document.getElementById(id);
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
}
const ICONS = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  open: '<path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/>',
  more: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
  chev: '<path d="m6 9 6 6 6-6"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
  move: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  window: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 9h18"/>',
  private: '<path d="M3 3l18 18"/><path d="M10.6 5.1A10 10 0 0 1 12 5c5 0 9 4.5 10 7-.4 1-1.2 2.3-2.4 3.5M6.2 6.2C4 7.6 2.6 9.9 2 12c1 2.5 5 7 10 7 1.8 0 3.4-.6 4.8-1.4"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  sort: '<path d="M7 4v16M4 17l3 3 3-3M14 6h6M14 11h4M14 16h2"/>',
  back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  tab: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 9h18M8 5v4"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  cmd: '<path d="m5 8 4 4-4 4M12 17h7"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  upload: '<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  save: '<path d="M6 4h12v16l-6-4-6 4z"/>',
  restore: '<path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.5"/><path d="M4 4v4.5h4.5"/>',
  sessions: '<rect x="4" y="4" width="12" height="12" rx="2.5"/><path d="M8 20h9a3 3 0 0 0 3-3V8"/>',
  library: '<path d="M4 4h4v16H4zM10 4h4v16h-4z"/><path d="m16.5 5.5 3.4-.9 3.1 14.6-3.4.9z"/>',
  wand: '<path d="m4 20 11-11M14 4v3M18 6l-2 2M20 10h-3M9 5l1 2M19 15l-2-1"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>'
};
function svg(name, cls = '') {
  const t = document.createElement('template');
  t.innerHTML = `<svg viewBox="0 0 24 24" class="i ${cls}">${ICONS[name] || ''}</svg>`;
  return t.content.firstChild;
}
const iconBtn = (name, title, onclick) => h('button', { class: 'icon-btn', title, 'aria-label': title, onclick }, svg(name));
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const hash = s => [...(s || '')].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const smooth = () => matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';

/* ================= State ================= */
let D;
let wallpaper = null;
const ui = { drag: null, panel: null, hoverSec: null, results: [], sel: 0, undo: null, tabs: [] };

// Gradient wallpapers (our own CSS). Photos come from "Upload image" or "Image from link".
// LIGHT_WALLS pair best with the Light theme (their labels use dark text).
const WALLS = {
  aurora: ['Aurora', 'radial-gradient(90% 70% at 10% 0%, #d9f5e8 0%, transparent 60%), radial-gradient(80% 70% at 100% 20%, #e3ecff 0%, transparent 60%), linear-gradient(180deg, #f3f7f5, #eef1f8)'],
  midnight: ['Midnight', 'radial-gradient(120% 80% at 50% 0%, #16223a 0%, #0a0f1c 55%, #04060b 100%)'],
  dawn: ['Dawn', 'radial-gradient(90% 70% at 0% 0%, #ffe3d3 0%, transparent 60%), radial-gradient(80% 70% at 100% 10%, #f5dcff 0%, transparent 60%), linear-gradient(180deg, #fbf3ee, #f1eef8)'],
  ink: ['Ink', 'radial-gradient(100% 80% at 30% 0%, #1b2436 0%, #0b0d12 60%, #050608 100%)'],
  sand: ['Sand', 'radial-gradient(90% 70% at 20% 0%, #f5e8d2 0%, transparent 60%), linear-gradient(180deg, #f6efe4, #ece3d4)'],
  nebula: ['Nebula', 'radial-gradient(60% 60% at 25% 30%, #3a1f6b 0%, transparent 60%), radial-gradient(55% 55% at 80% 70%, #0f4f73 0%, transparent 60%), radial-gradient(40% 40% at 60% 20%, #6b1f5a 0%, transparent 60%), linear-gradient(160deg, #07060f, #0b0a18)'],
  lavender: ['Lavender', 'radial-gradient(90% 70% at 0% 0%, #ece1ff 0%, transparent 60%), radial-gradient(80% 70% at 100% 100%, #dfe7ff 0%, transparent 60%), linear-gradient(180deg, #f4f0fb, #eceefa)'],
  ember: ['Ember', 'radial-gradient(80% 70% at 50% 110%, #5a1d0e 0%, transparent 65%), radial-gradient(60% 50% at 80% 0%, #3b1410 0%, transparent 60%), linear-gradient(180deg, #120807, #1a0b08)'],
  mint: ['Mint', 'radial-gradient(90% 70% at 100% 0%, #d6f7ef 0%, transparent 60%), linear-gradient(180deg, #f0faf7, #e7f4f0)'],
  graphite: ['Graphite', 'linear-gradient(180deg, #2a2a2e 0%, #111113 100%)'],
  ocean: ['Ocean', 'radial-gradient(120% 90% at 50% 0%, #123a5c 0%, #07131f 60%, #03070c 100%)'],
  forest: ['Forest', 'radial-gradient(120% 90% at 50% 0%, #17392c 0%, #0a1712 60%, #040806 100%)'],
  dusk: ['Dusk', 'radial-gradient(120% 90% at 50% 0%, #3d2440 0%, #170e1a 60%, #080509 100%)']
};
const LIGHT_WALLS = new Set(['aurora', 'dawn', 'sand', 'lavender', 'mint']);
const wallSrc = () => wallpaper?.data || wallpaper?.url || '';
const cssUrl = u => `url("${String(u).replace(/["\\\n]/g, c => encodeURIComponent(c))}")`;

const activeWs = () => D.workspaces.find(w => w.id === D.activeWs) || D.workspaces[0];
const allItems = () => D.workspaces.flatMap(w => w.sections.flatMap(s => s.items.map(i => ({ w, s, i }))));

// The Library behaves like one more section (w = null), so move, edit and delete work on it too.
const libSection = () => ({ id: LIBRARY, name: 'Library', items: D.library });
const findSec = id => id === LIBRARY ? { w: null, s: libSection() } : findSection(D, id);
function findItem(id) {
  for (const w of D.workspaces) for (const s of w.sections) {
    const index = s.items.findIndex(i => i.id === id);
    if (index > -1) return { w, s, i: s.items[index], index };
  }
  const li = D.library.findIndex(i => i.id === id);
  return li > -1 ? { w: null, s: libSection(), i: D.library[li], index: li } : null;
}
const entryOf = it => ({ url: it.url, title: it.title || '', tags: [...(it.tags || [])], note: it.note || '' });
const copyLink = url => navigator.clipboard.writeText(url).then(() => toast('Link copied'));

function commit(fn, opts = {}) {
  const snap = opts.undo ? structuredClone(D) : null;
  fn();
  save(D);
  render();
  if (opts.msg) toast(opts.msg, snap ? () => { D = snap; save(D); render(); if (ui.panel === 'library') renderPanel(); } : null, opts.action);
}

// Undo restores a whole snapshot, so it is only safe while nothing else has changed since.
// Called when a newer undoable change or a write from another page arrives.
function dropUndo() {
  ui.undo = null;
  ui.undoKey = null;
  $('toasts').querySelectorAll('.toast button.undo').forEach(b => b.remove());
}

/* ================= Rendering ================= */
function render() {
  applySettings();
  renderWs();
  renderBoard();
  if (ui.panel === 'tabs' || ui.panel === 'sessions' || ui.panel === 'library') renderPanel();
}

function isLight() {
  const t = D.settings.theme;
  return t === 'light' || (t === 'system' && matchMedia('(prefers-color-scheme: light)').matches);
}

function applySettings() {
  const s = D.settings, r = document.documentElement, st = r.style;
  st.setProperty('--accent', s.accent);
  const av = accentVars(s.accent, isLight());
  for (const [k, v] of Object.entries(av)) st.setProperty(k, v);
  st.setProperty('--glass', s.glass);
  st.setProperty('--card-opacity', s.cardOpacity);
  st.setProperty('--density', s.density);
  st.setProperty('--glow', s.glow);
  st.setProperty('--blur', s.blur + 'px');
  st.setProperty('--radius', s.radius + 'px');
  st.setProperty('--tile', s.tile + 'px');
  st.setProperty('--section-w', s.sectionWidth + 'px');
  st.setProperty('--gap', s.gap + 'px');
  st.setProperty('--wall-dim', s.wallDim);
  st.setProperty('--wall-blur', s.wallBlur + 'px');
  // Black = true OLED black, Dark = iOS grouped grey, Light = iOS light; Auto follows the system (dark side = Black).
  r.classList.toggle('light', isLight());
  r.classList.toggle('theme-dark', !isLight() && s.theme === 'dark');
  r.classList.toggle('mat-frosted', s.material === 'frosted');
  r.classList.toggle('layout-centered', s.layout === 'centered');
  r.classList.toggle('has-wall', s.wallpaper !== 'none');
  for (const f of ['rounded', 'serif', 'mono']) r.classList.toggle('font-' + f, s.font === f);
  r.classList.toggle('no-clock', !s.showClock);
  r.classList.toggle('no-titles', !s.showTitles);
  r.classList.toggle('no-counts', !s.showCounts);
  // boot.js paints these before the page's modules load, so a new tab never flashes the wrong theme
  try { localStorage.setItem('tabogt-boot', JSON.stringify({ cls: [...r.classList].filter(c => /^(light|theme-dark|mat-frosted|has-wall|font-|layout-)/.test(c)), accent: s.accent, vars: av })); } catch { /* storage off */ }
  applyWall();
  tick();
}

let wallCss = null;
function applyWall() {
  const s = D.settings, w = $('wall');
  let css;
  if (s.wallpaper === 'none') css = 'none';
  else if (s.wallpaper === 'image' && wallSrc()) css = `center / cover no-repeat ${cssUrl(wallSrc())}`;
  else if (s.wallpaper === 'solid') css = s.wallColor;
  else css = WALLS[s.wallpaper]?.[1] || 'none';
  // Re-assigning a multi-megabyte data URL on every render forces a re-decode; only touch it when it changes.
  if (css !== wallCss) { wallCss = css; w.style.background = css; }
  w.style.filter = s.wallBlur ? '' : 'none';
}

function tick() {
  const s = D.settings, now = new Date();
  $('time').textContent = now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: !s.clock24 });
  const date = now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  const hr = now.getHours(), auto = hr < 5 ? 'Good night' : hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
  if (s.layout === 'centered') { $('date').textContent = date; $('greet').textContent = (s.greeting || auto) + '.'; }
  else $('date').textContent = s.greeting ? `${s.greeting}. ${date}` : date;
}

function renderWs() {
  const wrap = $('wsTabs');
  wrap.innerHTML = '';
  D.workspaces.forEach((w, i) => {
    const n = w.sections.reduce((a, s) => a + s.items.length, 0);
    const b = h('button', { class: 'ws' + (w.id === D.activeWs ? ' on' : ''), role: 'tab', 'aria-selected': String(w.id === D.activeWs), title: `Alt+${i + 1}. Double-click to rename`, 'data-id': w.id },
      w.name, h('span', { class: 'n' }, n));
    b.addEventListener('click', () => switchWs(w.id));
    b.addEventListener('dblclick', () => renameWs(w, b));
    b.addEventListener('contextmenu', e => { e.preventDefault(); wsMenu(w, e); });
    b.draggable = true;
    b.addEventListener('dragstart', e => {
      ui.drag = { type: 'ws', id: w.id };
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('application/x-tabogt-ws', w.id);
    });
    b.addEventListener('dragend', endDrag);
    wsDropTarget(b, w);
    wrap.append(b);
  });
  wrap.append(h('button', { class: 'ws add', title: 'New workspace', onclick: addWs }, svg('plus')));
  $('wsPill').replaceChildren(h('span', null, activeWs().name), svg('chev'));
  $('hint').hidden = allItems().length + D.library.length > 15;
}

// Centered layout: the workspace switcher is a pill in the top bar (like Tabisto's "Work ▾").
$('wsPill').addEventListener('click', e => showMenu([
  { heading: 'Workspaces' },
  ...D.workspaces.map((w, i) => ({ label: w.name, icon: w.id === D.activeWs ? 'check' : null, hint: i < 9 ? `Alt ${i + 1}` : null, act: () => switchWs(w.id) })),
  { sep: true },
  { label: 'New workspace', icon: 'plus', act: addWs },
  { label: `Options for ${activeWs().name}`, icon: 'more', act: () => wsMenu(activeWs(), { currentTarget: $('wsPill'), target: $('wsPill'), clientX: 0, clientY: 0 }) }
], e));
$('wsPill').addEventListener('contextmenu', e => { e.preventDefault(); wsMenu(activeWs(), e); });
// While anything is being dragged, the centered layout shows the workspace tabs as a floating drop bar.
document.addEventListener('dragstart', () => { if (ui.drag) document.body.classList.add('is-dragging'); });

function renderBoard() {
  const ws = activeWs(), b = $('board');
  const keep = focusKey(b);
  b.innerHTML = '';
  tilesUsed = new Set();
  for (const s of ws.sections) b.append(sectionEl(ws, s));
  for (const id of tileCache.keys()) if (!tilesUsed.has(id)) tileCache.delete(id);
  const add = h('button', { class: 'new-sec' }, h('span', null, svg('plus')), h('span', null, 'New section'));
  add.addEventListener('click', () => newSection(ws));
  newSectionDrop(add, ws);
  b.append(add);
  restoreFocus(b, keep);
}

// The board is rebuilt on every change, which would drop keyboard focus to <body>.
// Remember what was focused and put focus back on the same tile, its neighbour, or its section.
function focusKey(b) {
  const a = document.activeElement;
  if (!a || !b.contains(a)) return null;
  const tile = a.closest('.tile'), sec = a.closest('.sec');
  return { tile: tile?.dataset.id, sec: sec?.dataset.id, idx: tile ? [...tile.parentNode.children].indexOf(tile) : -1 };
}
function restoreFocus(b, k) {
  if (!k || (document.activeElement && document.activeElement !== document.body)) return;
  const sec = k.sec && b.querySelector(`.sec[data-id="${k.sec}"]`);
  const tiles = sec ? sec.querySelectorAll('.tile') : [];
  const el = (k.tile && b.querySelector(`.tile[data-id="${k.tile}"]`)) || (k.idx > -1 && tiles[Math.min(k.idx, tiles.length - 1)]) || sec?.querySelector('.sec-h .icon-btn');
  el?.focus({ preventScroll: true });
}

function sectionEl(ws, s) {
  const el = h('section', { class: 'sec glass' + (s.collapsed ? ' collapsed' : ''), 'data-id': s.id, style: `--sec:${s.color}` });
  const name = h('h3', { class: 'sec-name', title: 'Double-click to rename' }, s.name);
  const head = h('header', { class: 'sec-h', draggable: 'true' },
    h('button', { class: 'icon-btn', title: s.collapsed ? 'Expand' : 'Collapse', onclick: () => commit(() => { s.collapsed = !s.collapsed; }) }, svg('chev', 'chev')),
    h('span', { class: 'dot' }), name, h('span', { class: 'count' }, s.items.length),
    h('div', { class: 'sec-actions' },
      iconBtn('plus', 'Add link', () => showAddRow(el, s)),
      iconBtn('open', 'Open all', () => openAll(s)),
      iconBtn('more', 'More', e => secMenu(ws, s, e))));
  name.addEventListener('dblclick', () => renameSec(s, name, head));
  head.addEventListener('contextmenu', e => { e.preventDefault(); secMenu(ws, s, e); });
  head.addEventListener('dragstart', e => {
    if (name.isContentEditable) return e.preventDefault();
    ui.drag = { type: 'section', id: s.id };
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/x-tabogt-section', s.id);
    requestAnimationFrame(() => el.classList.add('dragging'));
  });
  head.addEventListener('dragend', endDrag);

  const items = h('div', { class: 'items ' + D.settings.view });
  if (!s.collapsed) for (const it of s.items) items.append(tileEl(it, s));   // collapsed tiles are display:none anyway
  el.append(head, items);
  if (!s.items.length) el.append(h('div', { class: 'empty' }, 'Drop links or tabs here, or paste a URL'));
  el.append(h('button', { class: 'add-link', onclick: () => showAddRow(el, s) }, svg('plus'), 'Add link'));
  sectionDrop(el, items, ws, s);
  el.addEventListener('mouseenter', () => { ui.hoverSec = s.id; });
  return el;
}

const LETTER_BG = ['#0A84FF', '#30D158', '#FF9F0A', '#FF375F', '#BF5AF2', '#5E5CE6', '#FF453A', '#40C8E0', '#AC8E68', '#636366'];
function letterEl(url, title) {
  const c = (host(url) || title || '?').replace(/^www\./, '')[0]?.toUpperCase() || '?';
  return h('span', { class: 'letter', style: `background:${LETTER_BG[hash(host(url)) % LETTER_BG.length]}` }, c);
}

// Icons are cached per website in IndexedDB as small PNG data URLs, so after the first visit every
// tile paints its icon instantly with no _favicon request. Brave's _favicon answers pages it has no icon
// for with a generic globe (HTTP 200), so each new icon is compared with that globe. A real icon is stored
// for the whole site; a globe is stored only for that exact page ("u:" key) and re-checked after a day,
// so one unvisited page never hides the icon of the rest of the site.
const ICON_PX = 64, LETTER_TTL = 864e5;
const iconMem = new Map();      // site -> data URL, or '' for "use the letter"
const iconJobs = new Map();     // site -> in-flight capture
let iconDb = null, iconQueue = [], iconFlushT = null;
const iconKey = url => { try { const u = new URL(url); return /^https?:$/.test(u.protocol) ? u.host.replace(/^www\./, '') : ''; } catch { return ''; } };

function loadIconCache() {
  return new Promise(res => {
    const rq = indexedDB.open('tabogt-icons', 1);
    rq.onupgradeneeded = () => rq.result.createObjectStore('icons');
    rq.onerror = () => res();
    rq.onsuccess = () => {
      iconDb = rq.result;
      const st = iconDb.transaction('icons').objectStore('icons'), keys = st.getAllKeys(), vals = st.getAll();
      vals.onsuccess = () => {
        const now = Date.now();
        keys.result.forEach((k, i) => { const v = vals.result[i]; if (v.data || now - v.t < LETTER_TTL) iconMem.set(k, v.data || ''); });
        res();
      };
      vals.onerror = () => res();
    };
  });
}
function storeIcon(key, data) {
  iconMem.set(key, data);
  iconQueue.push([key, { data, t: Date.now() }]);
  clearTimeout(iconFlushT);
  iconFlushT = setTimeout(() => {   // one transaction for a whole batch of newly seen icons
    if (!iconDb) return;
    const st = iconDb.transaction('icons', 'readwrite').objectStore('icons');
    for (const [k, v] of iconQueue.splice(0)) st.put(v, k);
  }, 400);
}
function clearIconCache() {
  iconMem.clear();
  iconDb?.transaction('icons', 'readwrite').objectStore('icons').clear();
}

let globePixels = null;   // Promise of the generic globe's pixels
const pixelsOf = img => { const c = h('canvas', { width: ICON_PX, height: ICON_PX }), g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, ICON_PX, ICON_PX); return [c, g.getImageData(0, 0, ICON_PX, ICON_PX).data]; };
function captureIcon(img, key) {
  const job0 = iconJobs.get(key);
  if (job0 && job0.page === img.dataset.page) return job0;
  globePixels ||= new Promise(res => { const g = new Image(); g.onload = () => res(pixelsOf(g)[1]); g.onerror = () => res(null); g.src = favicon('https://tabogt.invalid/', ICON_PX, 'brave'); });
  const job = globePixels.then(globe => {
    const [c, px] = pixelsOf(img);
    const generic = globe && globe.length === px.length && px.every((v, i) => v === globe[i]);
    if (generic) storeIcon('u:' + img.dataset.page, '');
    else storeIcon(key, c.toDataURL('image/png'));
    return generic;
  }).catch(() => false).finally(() => { if (iconJobs.get(key) === job) iconJobs.delete(key); });
  job.page = img.dataset.page;
  iconJobs.set(key, job);
  return job;
}

function iconImg(url, title) {
  const brave = D.settings.iconSource === 'brave', key = brave && iconKey(url);
  if (key && iconMem.get(key)) return h('img', { alt: '', decoding: 'async', draggable: 'false', src: iconMem.get(key) });
  if (key && iconMem.has('u:' + url)) return letterEl(url, title);
  // loading must be set before src, or the browser starts fetching every icon at once
  const img = h('img', { alt: '', loading: 'lazy', decoding: 'async', draggable: 'false', src: favicon(url, ICON_PX, D.settings.iconSource) });
  img.addEventListener('error', () => img.replaceWith(letterEl(url, title)), { once: true });
  img.dataset.page = url;
  if (key) img.addEventListener('load', () => captureIcon(img, key)
    .then(generic => { if (generic && img.isConnected) img.replaceWith(letterEl(url, title)); }), { once: true });
  return img;
}

// Rebuilding thousands of tiles on every change is the main render cost on big boards, so an unchanged
// bookmark keeps its element. Handlers look the bookmark up by id when they fire, never via a stale copy.
const tileCache = new Map();   // item id -> { sig, el }
let tilesUsed = new Set();
function tileEl(it, s) {
  const sig = [it.url, it.title, it.tags.join(','), it.note, D.settings.view, D.settings.openIn, D.settings.iconSource].join('\u0001');
  const hit = !tilesUsed.has(it.id) && tileCache.get(it.id);
  tilesUsed.add(it.id);
  if (hit && hit.sig === sig) { hit.el.classList.remove('dragging', 'ins-before', 'ins-after'); return hit.el; }
  const list = D.settings.view === 'list';
  const a = h('a', {
    class: 'tile', href: it.url, draggable: 'true', 'data-id': it.id,
    title: `${it.title}\n${it.url}${it.tags.length ? '\n' + it.tags.map(t => '#' + t).join(' ') : ''}${it.note ? '\n\n' + it.note : ''}`,
    target: D.settings.openIn === 'new' ? '_blank' : null
  },
    h('span', { class: 'plate' }, iconImg(it.url, it.title)),
    h('span', { class: 't' }, it.title),
    // tags and host are only shown in list view; skipping them in grid view saves thousands of nodes per render
    list && it.tags.length ? h('span', { class: 'tg' }, it.tags.map(t => '#' + t).join(' ')) : null,
    list ? h('span', { class: 'h' }, host(it.url)) : null);
  a.addEventListener('dragstart', e => {
    ui.drag = { type: 'item', id: it.id };
    e.dataTransfer.effectAllowed = 'copyMove';
    e.dataTransfer.setData('text/uri-list', it.url);
    e.dataTransfer.setData('text/plain', it.url);
    requestAnimationFrame(() => a.classList.add('dragging'));
  });
  a.addEventListener('dragend', endDrag);
  a.addEventListener('contextmenu', e => { e.preventDefault(); const f = findItem(it.id); if (f) itemMenu(f.s, f.i, e); });
  a.addEventListener('keydown', e => {
    const f = (e.key === 'Delete' || e.key === 'F2' || e.key === 'e') && findItem(it.id);
    if (!f) return;
    if (e.key === 'Delete') { e.stopPropagation(); deleteItem(f.s, f.i); }
    else { e.preventDefault(); e.stopPropagation(); editItem(f.i); }
  });
  tileCache.set(it.id, { sig, el: a });
  return a;
}

/* ================= Drag and drop ================= */
const DRAG_URL_TYPES = ['text/uri-list', 'text/plain', 'text/html'];
const hasUrl = e => [...e.dataTransfer.types].some(t => DRAG_URL_TYPES.includes(t));

function clearMarks() {
  ui.mark = null;
  document.querySelectorAll('.drop, .sec-drop-before, .sec-drop-after, .ins-before, .ins-after, .ws-drop-before, .ws-drop-after')
    .forEach(n => n.classList.remove('drop', 'sec-drop-before', 'sec-drop-after', 'ins-before', 'ins-after', 'ws-drop-before', 'ws-drop-after'));
}

function endDrag() {
  if (ui.drag?.fromResults) hideResults();   // dropped somewhere: close the search list
  ui.drag = null;
  clearMarks();
  document.querySelectorAll('.dragging').forEach(n => n.classList.remove('dragging'));
  document.body.classList.remove('dragging-external', 'dragging-result', 'is-dragging');
}

function indexAt(items, e) {
  const tiles = [...items.children].filter(c => c.classList.contains('tile'));
  const list = items.classList.contains('list');
  for (let i = 0; i < tiles.length; i++) {
    const r = tiles[i].getBoundingClientRect();
    if (list) { if (e.clientY < r.top + r.height / 2) return i; }
    else {
      if (e.clientY < r.top) return i;
      if (e.clientY <= r.bottom && e.clientX < r.left + r.width / 2) return i;
    }
  }
  return tiles.length;
}

function markIndex(items, i) {
  const tiles = [...items.children].filter(c => c.classList.contains('tile'));
  if (i < tiles.length) tiles[i].classList.add('ins-before');
  else if (tiles.length) tiles[tiles.length - 1].classList.add('ins-after');
}

function urlsFromText(txt) {
  const out = [];
  const found = (txt || '').match(/(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)/gi);
  if (found) found.forEach(u => { const n = normalizeUrl(u.replace(/[),.;]+$/, '')); if (n) out.push(n); });
  else {
    const t = (txt || '').trim();
    if (/^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}(:\d+)?(\/\S*)?$/i.test(t)) { const n = normalizeUrl(t); if (n) out.push(n); }
  }
  return [...new Set(out)];
}

function titleFromTabs(url) {
  const t = ui.tabs.find(x => x.url === url);
  return t?.title || '';
}

function readExternal(dt) {
  const uri = dt.getData('text/uri-list'), html = dt.getData('text/html'), txt = dt.getData('text/plain');
  let title = '';
  if (html) {
    const a = new DOMParser().parseFromString(html, 'text/html').querySelector('a[href]');
    if (a) title = a.textContent.trim();
  }
  const lines = (uri || '').split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  const urls = lines.length ? lines.map(normalizeUrl).filter(Boolean) : urlsFromText(txt);
  return urls.map(url => ({ url, title: (urls.length === 1 && title && title !== url ? title : '') || titleFromTabs(url) }));
}

function entriesFromDrag(e) {
  const dr = ui.drag;
  let list;
  if (dr?.type === 'tab') list = [{ url: dr.url, title: dr.title }];
  else if (dr?.type === 'entries') list = dr.list;   // search results, Library folders, sessions, windows
  else list = readExternal(e.dataTransfer);
  return list.filter(x => savable(x.url));
}

// Dropping a section on the right half of another places it after, so the last slot is reachable.
const dropAfter = (el, e) => { const r = el.getBoundingClientRect(); return e.clientX > r.left + r.width / 2; };

function sectionDrop(el, items, ws, s) {
  el.addEventListener('dragover', e => {
    const dr = ui.drag;
    // dragover fires every few milliseconds: measure first, then touch classes only when the target changes,
    // so a drag over a large board does not force a style and layout pass per event.
    if (dr?.type === 'section') {
      if (dr.id === s.id) return;
      e.preventDefault();
      const key = s.id + (dropAfter(el, e) ? ':after' : ':before');
      if (ui.mark === key) return;
      clearMarks();
      el.classList.add(key.endsWith('after') ? 'sec-drop-after' : 'sec-drop-before');
      ui.mark = key;
      return;
    }
    if (!dr && !hasUrl(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = dr?.type === 'item' ? 'move' : 'copy';
    const idx = s.collapsed ? -1 : indexAt(items, e), key = s.id + ':' + idx;
    if (ui.mark === key) return;
    clearMarks();
    el.classList.add('drop');
    if (idx > -1) markIndex(items, idx);
    ui.mark = key;
  });
  el.addEventListener('dragleave', e => {
    if (!el.contains(e.relatedTarget)) {
      ui.mark = null;
      el.classList.remove('drop', 'sec-drop-before', 'sec-drop-after');
      el.querySelectorAll('.ins-before, .ins-after').forEach(n => n.classList.remove('ins-before', 'ins-after'));
    }
  });
  el.addEventListener('drop', e => {
    e.preventDefault();
    const dr = ui.drag;
    if (dr?.type === 'section') { const after = dropAfter(el, e); endDrag(); if (dr.id !== s.id) moveSection(ws, dr.id, s.id, after); return; }
    const idx = s.collapsed ? s.items.length : indexAt(items, e);
    if (dr?.type === 'item') { const id = dr.id; endDrag(); commit(() => moveItem(id, s.id, idx)); return; }
    const entries = entriesFromDrag(e);
    endDrag();
    addEntries(s, entries, idx);
  });
}

function addEntries(s, entries, idx) {
  if (!entries.length) return toast('Nothing to add. Drop or paste a web link.');
  const dupes = entries.filter(x => locate(D, x.url).some(hit => hit.w)).length;   // Library copies are expected, not duplicates
  commit(() => entries.forEach((x, k) => addItem(D, s.id, x, idx == null ? null : idx + k)),
    { undo: true, msg: `Added ${plural(entries.length, 'link')} to ${s.name}${dupes ? ` (${dupes} already saved elsewhere)` : ''}` });
}

function moveItem(id, toSecId, idx) {
  const f = findItem(id), t = findSec(toSecId);
  if (!f || !t) return;
  f.s.items.splice(f.index, 1);
  if (f.s.id === toSecId && f.index < idx) idx--;
  if (toSecId === LIBRARY) f.i.folder ||= f.s.name; else delete f.i.folder;
  t.s.items.splice(Math.max(0, Math.min(idx, t.s.items.length)), 0, f.i);
}

function moveSection(ws, dragId, targetId, after = false) {
  commit(() => {
    const from = ws.sections.findIndex(x => x.id === dragId);
    if (from < 0) return;
    const [sec] = ws.sections.splice(from, 1);
    const to = ws.sections.findIndex(x => x.id === targetId);
    ws.sections.splice(to < 0 ? ws.sections.length : to + (after ? 1 : 0), 0, sec);
  });
}

function wsDropTarget(b, w) {
  b.addEventListener('dragover', e => {
    const dr = ui.drag;
    if (!dr && !hasUrl(e)) return;
    if (dr?.type === 'section' && activeWs().id === w.id) return;
    if (dr?.type === 'ws') {
      if (dr.id === w.id) return;
      e.preventDefault();
      const cls = dropAfter(b, e) ? 'ws-drop-after' : 'ws-drop-before';
      if (!b.classList.contains(cls)) { clearMarks(); b.classList.add(cls); }
      return;
    }
    e.preventDefault();
    clearMarks();
    b.classList.add('drop');
  });
  b.addEventListener('dragleave', () => b.classList.remove('drop', 'ws-drop-before', 'ws-drop-after'));
  b.addEventListener('drop', e => {
    e.preventDefault();
    const dr = ui.drag;
    if (dr?.type === 'ws') {
      const after = dropAfter(b, e), id = dr.id;
      endDrag();
      if (id !== w.id) commit(() => {
        const [x] = D.workspaces.splice(D.workspaces.findIndex(v => v.id === id), 1);
        D.workspaces.splice(D.workspaces.indexOf(w) + (after ? 1 : 0), 0, x);
      });
      return;
    }
    if (dr?.type === 'entries' && dr.label) { endDrag(); entriesToNewSection(w, dr.list, dr.label, false); return; }
    if (dr?.type === 'section') {
      const src = activeWs(), id = dr.id;
      endDrag();
      commit(() => {
        const i = src.sections.findIndex(x => x.id === id);
        if (i > -1) w.sections.push(...src.sections.splice(i, 1));
      }, { undo: true, msg: `Moved section to ${w.name}` });
      return;
    }
    if (!w.sections.length) w.sections.push({ id: uid(), name: 'Inbox', color: COLORS[0], collapsed: false, items: [] });
    const target = w.sections[0];
    if (dr?.type === 'item') {
      const id = dr.id;
      endDrag();
      commit(() => moveItem(id, target.id, target.items.length), { undo: true, msg: `Moved to ${w.name} › ${target.name}` });
      return;
    }
    const entries = entriesFromDrag(e);
    endDrag();
    addEntries(target, entries);
  });
}

function newSectionDrop(btn, ws) {
  btn.addEventListener('dragover', e => {
    const dr = ui.drag;
    if (dr?.type === 'section' || (!dr && !hasUrl(e))) return;
    e.preventDefault(); clearMarks(); btn.classList.add('drop');
  });
  btn.addEventListener('dragleave', () => btn.classList.remove('drop'));
  btn.addEventListener('drop', e => {
    e.preventDefault();
    const dr = ui.drag;
    const s = { id: uid(), name: (dr?.type === 'entries' && dr.label) || 'New section', color: COLORS[ws.sections.length % COLORS.length], collapsed: false, items: [] };
    if (dr?.type === 'item') {
      const id = dr.id;
      endDrag();
      commit(() => { ws.sections.push(s); moveItem(id, s.id, 0); });
    } else {
      const entries = entriesFromDrag(e);
      endDrag();
      if (!entries.length) return;
      commit(() => { ws.sections.push(s); entries.forEach(x => addItem(D, s.id, x)); });
    }
    startRenameById(s.id);
  });
}

// The Library toolbar button and the open Library panel accept links, tiles and whole sections.
function libraryDrop(el) {
  const ok = e => { const dr = ui.drag; return !(el.id === 'drawer' && ui.panel !== 'library') && dr?.type !== 'ws' && !dr?.fromLibrary && (dr || hasUrl(e)); };
  el.addEventListener('dragover', e => { if (!ok(e)) return; e.preventDefault(); e.stopPropagation(); if (!el.classList.contains('drop')) { clearMarks(); el.classList.add('drop'); } });
  el.addEventListener('dragleave', e => { if (!el.contains(e.relatedTarget)) el.classList.remove('drop'); });
  el.addEventListener('drop', e => {
    if (!ok(e)) return;
    e.preventDefault(); e.stopPropagation();
    const dr = ui.drag, list = dr?.type === 'item' || dr?.type === 'section' ? null : entriesFromDrag(e);
    endDrag();
    if (dr?.type === 'item') moveToLibrary(dr.id);
    else if (dr?.type === 'section') { const f = findSection(D, dr.id); if (f) sectionToLibrary(f.w, f.s); }
    else addToLibrary(list, dr?.label || '');
  });
}
libraryDrop(document.querySelector('.tool[data-panel="library"]'));
libraryDrop($('drawer'));

document.addEventListener('dragenter', e => { if (!ui.drag && hasUrl(e)) document.body.classList.add('dragging-external'); });
document.addEventListener('dragover', e => { if (!ui.drag && hasUrl(e)) e.preventDefault(); });
document.addEventListener('drop', e => { if (e.target.matches?.('input, textarea')) return; e.preventDefault(); endDrag(); });
window.addEventListener('dragleave', e => { if (!e.relatedTarget) { clearMarks(); document.body.classList.remove('dragging-external'); } });

/* ================= Workspaces & sections ================= */
function switchWs(id) {
  if (D.activeWs === id) return;
  D.activeWs = id;
  save(D);
  render();
  if (ui.panel === 'notes') renderPanel();
}

function addWs() {
  const w = { id: uid(), name: 'New workspace', notes: '', sections: [{ id: uid(), name: 'Inbox', color: COLORS[0], collapsed: false, items: [] }] };
  commit(() => { D.workspaces.push(w); D.activeWs = w.id; });
  const b = document.querySelector(`.ws[data-id="${w.id}"]`);
  if (b) renameWs(w, b);
}

function renameWs(w, b) {
  const inp = h('input', { class: 'ws-edit', value: w.name, 'aria-label': 'Workspace name' });
  b.replaceWith(inp);
  inp.focus(); inp.select();
  let done = false;
  const finish = ok => {
    if (done) return; done = true;
    if (ok && inp.value.trim()) commit(() => { w.name = inp.value.trim(); }); else renderWs();
  };
  inp.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) finish(true); if (e.key === 'Escape') { e.stopPropagation(); finish(false); } });
  inp.addEventListener('blur', () => finish(true));
}

function wsMenu(w, e) {
  const i = D.workspaces.indexOf(w);
  if (i < 0) return;
  showMenu([
    { label: 'Rename', icon: 'edit', act: () => renameWs(w, document.querySelector(`.ws[data-id="${w.id}"]`)) },
    { label: 'New section here', icon: 'plus', act: () => { switchWs(w.id); newSection(w); } },
    { sep: true },
    { label: 'Move left', icon: 'back', disabled: i === 0, act: () => commit(() => { D.workspaces.splice(i - 1, 0, D.workspaces.splice(i, 1)[0]); }) },
    { label: 'Move right', icon: 'move', disabled: i === D.workspaces.length - 1, act: () => commit(() => { D.workspaces.splice(i + 1, 0, D.workspaces.splice(i, 1)[0]); }) },
    { sep: true },
    { label: 'Delete workspace', icon: 'trash', danger: true, disabled: D.workspaces.length < 2, act: () => commit(() => {
      const at = D.workspaces.indexOf(w);
      if (at < 0 || D.workspaces.length < 2) return;
      D.workspaces.splice(at, 1);
      if (D.activeWs === w.id) D.activeWs = D.workspaces[Math.max(0, at - 1)].id;
    }, { undo: true, msg: `Deleted workspace ${w.name}` }) }
  ], e);
}

function newSection(ws, name = 'New section') {
  const s = { id: uid(), name, color: COLORS[ws.sections.length % COLORS.length], collapsed: false, items: [] };
  commit(() => ws.sections.push(s));
  startRenameById(s.id);
  return s;
}

function startRenameById(id) {
  const el = document.querySelector(`.sec[data-id="${id}"]`);
  const f = findSection(D, id);
  if (el && f) { el.scrollIntoView({ block: 'nearest', behavior: smooth() }); renameSec(f.s, el.querySelector('.sec-name'), el.querySelector('.sec-h')); }
}

function renameSec(s, nameEl, head) {
  head.draggable = false;
  nameEl.contentEditable = 'true';
  nameEl.focus();
  document.getSelection().selectAllChildren(nameEl);
  let done = false;
  const finish = ok => {
    if (done) return; done = true;
    nameEl.contentEditable = 'false';
    const v = nameEl.textContent.trim();
    if (ok && v && v !== s.name) commit(() => { s.name = v; }); else renderBoard();
  };
  nameEl.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); finish(true); }
    if (e.key === 'Escape') { e.stopPropagation(); finish(false); }
  });
  nameEl.addEventListener('blur', () => finish(true), { once: true });
}

function showAddRow(el, s) {
  let row = el.querySelector('.add-row');
  if (row) { row.querySelector('input').focus(); return; }
  if (s.collapsed) { commit(() => { s.collapsed = false; }); el = document.querySelector(`.sec[data-id="${s.id}"]`); }
  const inp = h('input', { placeholder: 'Paste or type a URL, then Enter', spellcheck: 'false' });
  const go = () => {
    const urls = inp.value.split(/\s+/).map(normalizeUrl).filter(u => u && savable(u));
    if (!urls.length) { inp.select(); return toast('That does not look like a web address.'); }
    ui.hoverSec = s.id;
    addEntries(s, urls.map(url => ({ url, title: titleFromTabs(url) })));
    showAddRow(document.querySelector(`.sec[data-id="${s.id}"]`), s);
  };
  row = h('div', { class: 'add-row' }, inp, h('button', { class: 'btn sm primary', onclick: go }, 'Add'));
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.isComposing) go();
    if (e.key === 'Escape') { e.stopPropagation(); row.remove(); }
  });
  el.append(row);
  inp.focus();
}

async function openAll(s, newWindow = false) {
  const urls = s.items.map(i => i.url);
  if (!urls.length) return;
  if (urls.length > 12 && !(await confirmBox(`Open ${urls.length} tabs?`, 'Open all'))) return;
  if (newWindow) chrome.windows.create({ url: urls });
  else urls.forEach(url => chrome.tabs.create({ url, active: false }));
}

function sortSection(s, how) {
  const by = {
    name: (a, b) => a.title.localeCompare(b.title),
    newest: (a, b) => b.added - a.added,
    oldest: (a, b) => a.added - b.added,
    domain: (a, b) => host(a.url).localeCompare(host(b.url))
  }[how];
  commit(() => s.items.sort(by), { undo: true, msg: `Sorted ${s.name}` });
}

async function saveWindowTabsTo(s) {
  const tabs = (await chrome.tabs.query({ currentWindow: true })).filter(t => savable(t.url));
  addEntries(s, tabs.map(t => ({ url: t.url, title: t.title })));
}

function secMenu(ws, s, e) {
  showMenu([
    { label: 'Add link', icon: 'plus', act: () => showAddRow(document.querySelector(`.sec[data-id="${s.id}"]`), s) },
    { label: 'Save this window’s tabs here', icon: 'tab', act: () => saveWindowTabsTo(s) },
    { label: 'Rename', icon: 'edit', act: () => startRenameById(s.id) },
    { swatches: true, value: s.color, pick: c => commit(() => { s.color = c; }) },
    { sep: true },
    { label: 'Open all in new tabs', icon: 'open', act: () => openAll(s) },
    { label: 'Open all in new window', icon: 'window', act: () => openAll(s, true) },
    { sep: true },
    { label: 'Sort', icon: 'sort', sub: () => [
      { label: 'By name', act: () => sortSection(s, 'name') },
      { label: 'Newest first', act: () => sortSection(s, 'newest') },
      { label: 'Oldest first', act: () => sortSection(s, 'oldest') },
      { label: 'By website', act: () => sortSection(s, 'domain') }
    ] },
    { label: 'Move to workspace', icon: 'move', sub: () => D.workspaces.filter(w => w !== ws).map(w => ({
      label: w.name, act: () => commit(() => { const i = ws.sections.indexOf(s); if (i > -1) w.sections.push(...ws.sections.splice(i, 1)); }, { undo: true, msg: `Moved ${s.name} to ${w.name}` })
    })) },
    { label: 'Move to Library', icon: 'library', act: () => sectionToLibrary(ws, s) },
    { label: s.collapsed ? 'Expand' : 'Collapse', icon: 'chev', act: () => commit(() => { s.collapsed = !s.collapsed; }) },
    { sep: true },
    { label: 'Delete section', icon: 'trash', danger: true, act: () => commit(() => { const i = ws.sections.indexOf(s); if (i > -1) ws.sections.splice(i, 1); }, { undo: true, msg: `Deleted ${s.name} (${plural(s.items.length, 'link')})` }) }
  ], e);
}

/* ================= Items ================= */
function openUrl(url, how = 'same') {
  if (how === 'new') chrome.tabs.create({ url, active: true });
  else if (how === 'bg') chrome.tabs.create({ url, active: false });
  else if (how === 'window') chrome.windows.create({ url });
  else if (how === 'private') chrome.windows.create({ url, incognito: true }).catch(() => toast('Allow TabOgt in private windows at brave://extensions to use this.'));
  else location.href = url;
}

// Looks the bookmark up by id, so a dialog or menu opened before a sync from another page still hits the live copy.
function deleteItem(s, it) {
  if (!findItem(it.id)) return;
  commit(() => { const f = findItem(it.id); f.s.items.splice(f.index, 1); }, { undo: true, msg: `Deleted ${it.title}` });
}

function sectionOptions(selected) {
  return D.workspaces.map(w => h('optgroup', { label: w.name },
    w.sections.map(s => { const o = new Option(s.name, s.id); o.selected = s.id === selected; return o; })));
}

function itemMenu(s, it, e) {
  showMenu([
    { label: 'Open in new tab', icon: 'open', act: () => openUrl(it.url, 'new') },
    { label: 'Open in new window', icon: 'window', act: () => openUrl(it.url, 'window') },
    { label: 'Open in private window', icon: 'private', act: () => openUrl(it.url, 'private') },
    { sep: true },
    { label: 'Edit', icon: 'edit', sub: null, hint: 'E', act: () => editItem(it) },
    { label: 'Copy link', icon: 'copy', act: () => copyLink(it.url) },
    { label: 'Move to', icon: 'move', sub: () => D.workspaces.flatMap(w => [
      { heading: w.name },
      ...w.sections.filter(x => x !== s).map(x => ({ label: x.name, act: () => commit(() => moveItem(it.id, x.id, x.items.length), { undo: true, msg: `Moved to ${w.name} › ${x.name}` }) }))
    ]) },
    { label: 'Move to Library', icon: 'library', act: () => moveToLibrary(it.id) },
    { sep: true },
    { label: 'Delete', icon: 'trash', danger: true, hint: 'Del', act: () => deleteItem(s, it) }
  ], e);
}

function editItem(it) {
  const f = findItem(it.id);
  if (!f) return;
  const title = h('input', { value: it.title });
  const url = h('input', { value: it.url, spellcheck: 'false' });
  const tags = h('input', { value: it.tags.join(', '), placeholder: 'design, reading', spellcheck: 'false' });
  const note = h('textarea', { rows: '3' }); note.value = it.note;
  const libOpt = new Option('Library (search only)', LIBRARY);
  libOpt.selected = f.s.id === LIBRARY;
  const sec = h('select', null, h('optgroup', { label: 'Library' }, libOpt), sectionOptions(f.s.id));
  const doSave = () => {
    const u = normalizeUrl(url.value);
    if (!u) { url.focus(); return toast('Enter a valid web address.'); }
    closeDialog();
    // Re-resolve by id: another page may have replaced D while the dialog was open.
    const cur = findItem(it.id);
    if (!cur) return toast('That bookmark was deleted elsewhere.');
    commit(() => {
      const x = cur.i;
      x.title = title.value.trim() || host(u);
      x.url = u;
      x.tags = tags.value.split(',').map(t => t.trim().replace(/^#/, '')).filter(Boolean);
      x.note = note.value.trim();
      const to = findSec(sec.value);
      if (to && to.s.id !== cur.s.id) moveItem(x.id, to.s.id, to.s.items.length);
    });
  };
  openDialog([
    h('h2', null, 'Edit bookmark'),
    h('label', null, 'Title', title),
    h('label', null, 'Address', url),
    h('label', null, 'Tags (comma separated)', tags),
    h('label', null, 'Note', note),
    h('label', null, 'Section', sec),
    h('div', { class: 'btns' },
      h('button', { class: 'btn danger', style: 'margin-right:auto', onclick: () => { closeDialog(); deleteItem(f.s, it); } }, svg('trash'), 'Delete'),
      h('button', { class: 'btn', onclick: closeDialog }, 'Cancel'),
      h('button', { class: 'btn primary', onclick: doSave }, 'Save'))
  ], doSave);
  title.select();
}

/* ================= Menu ================= */
function showMenu(items, e, keepPos) {
  const m = $('menu');
  if (m.hidden) ui.menuFrom = document.activeElement;
  m.innerHTML = '';
  for (const it of items) {
    if (it.sep) { m.append(h('div', { class: 'msep' })); continue; }
    if (it.heading) { m.append(h('div', { class: 'mlabel' }, it.heading)); continue; }
    if (it.swatches) {
      m.append(h('div', { class: 'swatches' }, COLORS.map(c => h('button', {
        class: 'sw' + (c === it.value ? ' on' : ''), style: `background:${c}`, title: c,
        onclick: () => { closeMenu(true); it.pick(c); }
      }))));
      continue;
    }
    const b = h('button', { class: 'mi' + (it.danger ? ' danger' : ''), role: 'menuitem', disabled: it.disabled },
      it.icon ? svg(it.icon) : null, h('span', null, it.label),
      it.sub ? h('span', { class: 'sub' }, '›') : it.hint ? h('span', { class: 'sub' }, it.hint) : null);
    if (it.disabled) b.style.opacity = '.4';
    b.addEventListener('click', ev => {
      ev.stopPropagation();
      if (it.disabled) return;
      if (it.sub) {
        const list = it.sub();
        showMenu([{ label: 'Back', icon: 'back', back: true, act: () => showMenu(items, null, true) }, { sep: true },
          ...(list.length ? list : [{ heading: 'Nothing here yet' }])], null, true);
        return;
      }
      if (!it.back) closeMenu(true);
      it.act?.();
    });
    m.append(b);
  }
  m.hidden = false;
  if (!keepPos && e) {
    const tr = e.currentTarget?.getBoundingClientRect?.() || e.target.getBoundingClientRect();
    const kb = !e.clientX && !e.clientY;
    const x = kb ? tr.left : e.clientX, y = kb ? tr.bottom : e.clientY;
    const r = m.getBoundingClientRect();
    m.style.left = Math.min(x, innerWidth - r.width - 8) + 'px';
    m.style.top = Math.min(y, innerHeight - r.height - 8) + 'px';
  } else if (keepPos) {
    const r = m.getBoundingClientRect();
    if (r.bottom > innerHeight - 8) m.style.top = Math.max(8, innerHeight - r.height - 8) + 'px';
  }
  m.querySelector('.mi')?.focus({ preventScroll: true });
}
// restore: return focus to where it was when the menu opened (for keyboard users), if that element still exists.
function closeMenu(restore = false) {
  const m = $('menu');
  if (m.hidden) return;
  m.hidden = true;
  const from = ui.menuFrom;
  ui.menuFrom = null;
  if (restore && from && from !== document.body && from.isConnected) from.focus({ preventScroll: true });
}
document.addEventListener('mousedown', e => { if (!$('menu').hidden && !$('menu').contains(e.target)) closeMenu(); });
window.addEventListener('blur', closeMenu);
window.addEventListener('resize', closeMenu);
$('menu').addEventListener('keydown', e => {
  const btns = [...$('menu').querySelectorAll('.mi:not([disabled])')];
  const i = btns.indexOf(document.activeElement);
  if (e.key === 'ArrowDown') { e.preventDefault(); btns[(i + 1) % btns.length]?.focus(); }
  if (e.key === 'ArrowUp') { e.preventDefault(); btns[(i - 1 + btns.length) % btns.length]?.focus(); }
  if (e.key === 'Home') { e.preventDefault(); btns[0]?.focus(); }
  if (e.key === 'End') { e.preventDefault(); btns.at(-1)?.focus(); }
});

/* ================= Dialogs & toasts ================= */
let dialogEnter = null, dialogCancel = null, dialogFrom = null;
// onCancel runs when the dialog is dismissed with Esc or a backdrop click, so pending prompts always settle.
function openDialog(nodes, onEnter, onCancel) {
  const d = $('dialog');
  if ($('modal').hidden) dialogFrom = document.activeElement;
  d.innerHTML = '';
  d.append(...nodes);
  d.setAttribute('aria-label', nodes.find(n => n.tagName === 'H2')?.textContent || 'Dialog');
  dialogEnter = onEnter || null;
  dialogCancel = onCancel || null;
  $('modal').hidden = false;
}
function closeDialog() {
  const cancel = dialogCancel, from = dialogFrom;
  $('modal').hidden = true; dialogEnter = null; dialogCancel = null; dialogFrom = null;
  cancel?.();
  if (from?.isConnected && from !== document.body) from.focus({ preventScroll: true });
}
$('modal').addEventListener('mousedown', e => { if (e.target === $('modal')) closeDialog(); });
$('dialog').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.isComposing && dialogEnter && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'BUTTON') { e.preventDefault(); dialogEnter(); }
  if (e.key === 'Tab') {   // keep focus inside the modal
    const f = [...$('dialog').querySelectorAll('input, select, textarea, button')].filter(x => !x.disabled);
    if (!f.length) return;
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f.at(-1).focus(); }
    else if (!e.shiftKey && document.activeElement === f.at(-1)) { e.preventDefault(); f[0].focus(); }
  }
});

function confirmBox(text, ok = 'Confirm', danger = false) {
  return new Promise(res => {
    const done = v => { res(v); closeDialog(); };
    openDialog([
      h('h2', null, text),
      h('div', { class: 'btns' },
        h('button', { class: 'btn', onclick: () => done(false) }, 'Cancel'),
        h('button', { class: 'btn primary' + (danger ? ' danger' : ''), onclick: () => done(true) }, ok))
    ], () => done(true), () => res(false));
    $('dialog').querySelector('.primary').focus();
  });
}

function promptBox(title, value = '', ok = 'Save') {
  return new Promise(res => {
    const inp = h('input', { value });
    const done = v => { res(v); closeDialog(); };
    openDialog([h('h2', null, title), inp, h('div', { class: 'btns' },
      h('button', { class: 'btn', onclick: () => done(null) }, 'Cancel'),
      h('button', { class: 'btn primary', onclick: () => done(inp.value.trim()) }, ok))], () => done(inp.value.trim()), () => res(null));
    inp.focus(); inp.select();
  });
}

function toast(msg, undo, action) {
  const t = h('div', { class: 'toast', role: 'status' }, h('span', null, msg));
  if (action) t.append(h('button', { class: 'act', onclick: () => { t.remove(); action.run(); } }, action.label));
  const key = {};
  if (undo) {
    dropUndo();   // only the newest change can be undone; an older snapshot would also revert it
    t.append(h('button', { class: 'undo', onclick: () => { undo(); t.remove(); ui.undo = null; } }, 'Undo'));
    ui.undo = () => { undo(); t.remove(); };
    ui.undoKey = key;
  }
  $('toasts').append(t);
  while ($('toasts').children.length > 3) $('toasts').firstChild.remove();
  setTimeout(() => { t.remove(); if (ui.undoKey === key) ui.undo = null; }, action ? 12000 : 6000);
}

/* ================= Search & commands ================= */
const q = $('q');

function commands() {
  const ws = activeWs();
  return [
    { label: 'New section', icon: 'plus', run: () => newSection(ws) },
    { label: 'New workspace', icon: 'plus', run: addWs },
    { label: 'Save open tabs as a session', icon: 'sessions', run: () => saveSession() },
    { label: 'Save open tabs into a new section', icon: 'tab', run: async () => {
      const tabs = (await chrome.tabs.query({ currentWindow: true })).filter(t => savable(t.url));
      const s = { id: uid(), name: 'Saved tabs', color: COLORS[ws.sections.length % COLORS.length], collapsed: false, items: [] };
      commit(() => { ws.sections.push(s); tabs.forEach(t => addItem(D, s.id, { url: t.url, title: t.title })); }, { undo: true, msg: `Saved ${plural(tabs.length, 'tab')} into a new section` });
      startRenameById(s.id);
    } },
    { label: 'Open Library', icon: 'library', run: () => openPanel('library') },
    { label: 'Organize Library into a workspace', icon: 'wand', run: organizeLibrary },
    { label: 'Remove duplicate bookmarks', icon: 'trash', run: removeDuplicates },
    { label: 'Theme: Black', icon: 'globe', run: () => setSetting('theme', 'black') },
    { label: 'Theme: Dark', icon: 'globe', run: () => setSetting('theme', 'dark') },
    { label: 'Theme: Light', icon: 'globe', run: () => setSetting('theme', 'light') },
    { label: D.settings.view === 'grid' ? 'Switch to list view' : 'Switch to grid view', icon: 'sort', run: () => setSetting('view', D.settings.view === 'grid' ? 'list' : 'grid', true) },
    { label: 'Collapse all sections', icon: 'chev', run: () => commit(() => ws.sections.forEach(s => { s.collapsed = true; })) },
    { label: 'Expand all sections', icon: 'chev', run: () => commit(() => ws.sections.forEach(s => { s.collapsed = false; })) },
    { label: 'Customise', icon: 'edit', run: () => openPanel('settings') },
    { label: 'Open tabs panel', icon: 'tab', run: () => openPanel('tabs') },
    { label: 'Sessions', icon: 'sessions', run: () => openPanel('sessions') },
    { label: 'Notes', icon: 'edit', run: () => openPanel('notes') },
    { label: 'Import bookmarks from Brave into the Library', icon: 'download', run: importBrave },
    { label: 'Import a file into the Library (CSV, HTML, Raindrop, backup)', icon: 'upload', run: () => $('fileIn').click() },
    { label: 'Export backup', icon: 'download', run: exportJSON }
  ];
}

// Search covers the board and the Library. Library copies of links already on the board are skipped.
const LIB_SEC = { id: LIBRARY, name: 'Library' };
function searchPool() {
  const board = allItems(), onBoard = new Set(board.map(x => blobOf(x).key));
  return board.concat(D.library.map(i => ({ w: null, s: LIB_SEC, i, lib: true })).filter(x => !onBoard.has(blobOf(x).key)));
}
// Lower-cased search text per bookmark, cached until the bookmark object is replaced.
const blobs = new WeakMap();
function blobOf(x) {
  const it = x.i;
  let b = blobs.get(it);
  if (!b || b.src !== it.title + it.url + it.note + it.tags + x.s.name) {
    const title = it.title.toLowerCase();
    b = { src: it.title + it.url + it.note + it.tags + x.s.name, title, hs: host(it.url).toLowerCase(), key: urlKey(it.url),
      blob: `${title} ${it.url.toLowerCase()} ${it.note.toLowerCase()} ${it.tags.join(' ').toLowerCase()} ${x.s.name.toLowerCase()} ${(it.folder || '').toLowerCase()}` };
    blobs.set(it, b);
  }
  return b;
}

function highlight(text, tokens) {
  const frag = document.createDocumentFragment();
  const low = text.toLowerCase(), marks = [];
  for (const t of tokens) {
    if (!t) continue;
    let i = low.indexOf(t);
    while (i > -1) { marks.push([i, i + t.length]); i = low.indexOf(t, i + t.length); }
  }
  marks.sort((a, b) => a[0] - b[0]);
  let pos = 0;
  for (const [a, b] of marks) {
    if (a < pos) continue;
    frag.append(text.slice(pos, a), h('mark', null, text.slice(a, b)));
    pos = b;
  }
  frag.append(text.slice(pos));
  return frag;
}

function runSearch() {
  const v = q.value.trim();
  const rows = [];
  let head = null;
  if (v.startsWith('>')) {
    const t = v.slice(1).trim().toLowerCase();
    head = 'Commands';
    commands().filter(c => c.label.toLowerCase().includes(t)).forEach(c => rows.push({ kind: 'cmd', ...c }));
  } else if (!v) {
    head = 'Recently added. Type > for commands.';
    searchPool().sort((a, b) => b.i.added - a.i.added).slice(0, 8).forEach(x => rows.push({ kind: 'item', ...x, tokens: [] }));
  } else {
    const tokens = v.toLowerCase().split(/\s+/);
    const tagT = tokens.filter(t => t.startsWith('#') && t.length > 1).map(t => t.slice(1));
    const txtT = tokens.filter(t => !t.startsWith('#'));
    const direct = normalizeUrl(v);
    if (direct && !/\s/.test(v) && /[./:]/.test(v)) rows.push({ kind: 'url', url: direct });
    const scored = [];
    for (const x of searchPool()) {
      const it = x.i, { title, hs, blob } = blobOf(x);
      if (!txtT.every(t => blob.includes(t))) continue;
      if (!tagT.every(t => it.tags.some(g => g.toLowerCase().startsWith(t)))) continue;
      let sc = 0;
      for (const t of txtT) sc += title.startsWith(t) ? 6 : title.includes(t) ? 4 : hs.includes(t) ? 3 : 1;
      scored.push({ ...x, sc: sc + tagT.length * 2 });
    }
    scored.sort((a, b) => b.sc - a.sc || b.i.added - a.i.added).slice(0, 40).forEach(x => rows.push({ kind: 'item', ...x, tokens: txtT }));
    if (!scored.length) head = 'No saved bookmarks match.';
    rows.push({ kind: 'web', text: v });
  }
  ui.results = rows;
  ui.sel = 0;
  if (!ui.drag) document.body.classList.remove('dragging-result');
  const box = $('results');
  box.innerHTML = '';
  if (head) box.append(h('div', { class: 'res-head' }, head));
  rows.forEach((r, i) => {
    let el;
    if (r.kind === 'item') {
      el = h('div', { class: 'res' + (r.lib ? ' lib' : ''), role: 'option' }, iconImg(r.i.url, r.i.title),
        h('div', { class: 'rt' }, h('b', null, highlight(r.i.title, r.tokens)), h('small', null, highlight(r.i.url.replace(/^https?:\/\//, ''), r.tokens))),
        h('span', { class: 'loc' }, placeLabel(r)));
      if (r.lib) {
        const add = h('button', { class: 'res-add', title: 'Add to the board (Alt+Enter), or drag the row onto a section', 'aria-label': 'Add to the board' }, svg('plus'));
        add.addEventListener('click', e => { e.stopPropagation(); addFromLibrary(r.i); });
        el.append(add);
      }
    } else if (r.kind === 'cmd') {
      el = h('div', { class: 'res', role: 'option' }, h('span', { class: 'ico' }, svg(r.icon || 'cmd')), h('div', { class: 'rt' }, h('b', null, r.label)));
    } else if (r.kind === 'url') {
      el = h('div', { class: 'res', role: 'option' }, h('span', { class: 'ico' }, svg('link')), h('div', { class: 'rt' }, h('b', null, 'Go to ' + r.url)));
    } else {
      el = h('div', { class: 'res', role: 'option' }, h('span', { class: 'ico' }, svg('globe')), h('div', { class: 'rt' }, h('b', null, `Search the web for “${r.text}”`)));
    }
    el.id = 'res-' + i;
    el.addEventListener('mousemove', () => selectRes(i));
    // No preventDefault on mousedown: it would block dragging. ui.resDown keeps the list open while the input blurs.
    el.addEventListener('mousedown', () => { ui.resDown = true; });
    el.addEventListener('click', e => activateRes(i, e.ctrlKey || e.metaKey));
    el.addEventListener('auxclick', e => { if (e.button === 1) activateRes(i, true); });
    el.addEventListener('contextmenu', e => { e.preventDefault(); resMenu(r, e); });
    const link = r.kind === 'item' ? r.i : r.kind === 'url' ? { url: r.url, title: '' } : null;
    if (link) {
      el.draggable = true;
      el.addEventListener('dragstart', e => {
        // a bookmark already on the board moves; Library links and typed URLs are copied onto the board
        ui.drag = r.kind === 'item' && !r.lib ? { type: 'item', id: r.i.id, fromResults: true } : { type: 'entries', list: [entryOf(link)], fromLibrary: !!r.lib, fromResults: true };
        e.dataTransfer.effectAllowed = 'copyMove';
        e.dataTransfer.setData('text/uri-list', link.url);
        e.dataTransfer.setData('text/plain', link.url);
        // fade the list so the board below takes the drop (only if the drag is still going: a fast drop can beat this frame)
        requestAnimationFrame(() => { if (ui.drag?.fromResults) document.body.classList.add('dragging-result'); });
      });
      // dragend arrives after the drop (and after anything typed since), so the list is closed by the drop itself;
      // a cancelled drag just leaves the list open
      el.addEventListener('dragend', () => { ui.resDown = false; if (ui.drag) { ui.drag.fromResults = false; endDrag(); } });
    }
    box.append(el);
  });
  box.hidden = !rows.length && !head;
  q.setAttribute('aria-expanded', String(!box.hidden));
  selectRes(0);
}

function selectRes(i) {
  const els = $('results').querySelectorAll('.res');
  if (!els.length) return;
  ui.sel = (i + els.length) % els.length;
  els.forEach((e, k) => { e.classList.toggle('on', k === ui.sel); e.setAttribute('aria-selected', String(k === ui.sel)); });
  els[ui.sel].scrollIntoView({ block: 'nearest' });
  q.setAttribute('aria-activedescendant', els[ui.sel].id);
}

function activateRes(i, bg) {
  const r = ui.results[i];
  if (!r) return;
  hideResults();
  if (r.kind === 'item') openUrl(r.i.url, bg ? 'bg' : D.settings.openIn === 'new' ? 'new' : 'same');
  else if (r.kind === 'url') openUrl(r.url, bg ? 'bg' : 'same');
  else if (r.kind === 'cmd') { q.value = ''; q.blur(); r.run(); }
  else chrome.search.query({ text: r.text, disposition: bg ? 'NEW_TAB' : 'CURRENT_TAB' });
}

function hideResults() { $('results').hidden = true; q.setAttribute('aria-expanded', 'false'); q.removeAttribute('aria-activedescendant'); }

q.addEventListener('input', runSearch);
q.addEventListener('focus', runSearch);
// hide shortly after the box loses focus, unless the list is being used or the box was refocused meanwhile
q.addEventListener('blur', () => setTimeout(() => { if (!ui.resDown && !ui.drag && document.activeElement !== q) hideResults(); }, 150));
document.addEventListener('mouseup', () => setTimeout(() => {
  if (!ui.resDown) return;
  ui.resDown = false;
  if (document.activeElement !== q && !ui.drag && $('menu').hidden) hideResults();
}));

function resMenu(r, e) {
  if (r.kind !== 'item' && r.kind !== 'url') return;
  const link = r.kind === 'item' ? r.i : { url: r.url, title: host(r.url), tags: [], note: '' };
  const done = fn => () => { hideResults(); fn(); };
  const items = [
    { label: 'Open', icon: 'link', act: done(() => openUrl(link.url, D.settings.openIn === 'new' ? 'new' : 'same')) },
    { label: 'Open in new tab', icon: 'open', act: done(() => openUrl(link.url, 'new')) },
    { label: 'Open in new window', icon: 'window', act: done(() => openUrl(link.url, 'window')) },
    { label: 'Open in private window', icon: 'private', act: done(() => openUrl(link.url, 'private')) },
    { sep: true },
    { label: 'Copy link', icon: 'copy', act: () => copyLink(link.url) }
  ];
  if (r.kind === 'item' && !r.lib) items.push(
    { label: 'Show on the board', icon: 'folder', act: done(() => revealItem(r.i.id)) },
    { label: 'Edit', icon: 'edit', act: done(() => editItem(r.i)) },
    { label: 'Move to', icon: 'move', sub: () => sectionPicker((s, w) => moveTo(r.i.id, s, w), r.s) },
    { label: 'Move to Library', icon: 'library', act: done(() => moveToLibrary(r.i.id)) },
    { sep: true },
    { label: 'Delete', icon: 'trash', danger: true, act: done(() => deleteItem(r.s, r.i)) });
  else items.push(
    { label: 'Add to the board', icon: 'plus', hint: r.lib ? 'Alt+Enter' : null, act: done(() => addEntries(boardTarget(), [entryOf(link)])) },
    { label: 'Add to section', icon: 'move', sub: () => sectionPicker((s, w) => addTo(s, w, [entryOf(link)])) },
    r.lib ? { label: 'Edit', icon: 'edit', act: done(() => editItem(r.i)) } : { label: 'Save to Library', icon: 'library', act: done(() => addToLibrary([entryOf(link)])) },
    ...(r.lib ? [{ sep: true }, { label: 'Remove from Library', icon: 'trash', danger: true, act: done(() => deleteItem(null, r.i)) }] : []));
  showMenu(items, e);
}
q.addEventListener('keydown', e => {
  if (e.key === 'ArrowDown') { e.preventDefault(); selectRes(ui.sel + 1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); selectRes(ui.sel - 1); }
  else if (e.key === 'Enter' && e.altKey && ui.results[ui.sel]?.lib) { e.preventDefault(); addFromLibrary(ui.results[ui.sel].i); }
  else if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); activateRes(ui.sel, e.ctrlKey || e.metaKey); }
  else if (e.key === 'Escape') { e.stopPropagation(); if (q.value) { q.value = ''; runSearch(); } else { hideResults(); q.blur(); } }
});

/* ================= Drawer panels ================= */
const PANEL_TITLES = { library: 'Library', tabs: 'Open tabs', sessions: 'Sessions', notes: 'Notes', settings: 'Customise' };

function openPanel(name) {
  if (ui.panel === name) return closePanel();
  ui.panel = name;
  $('drawer').hidden = false;
  document.querySelectorAll('.tool').forEach(b => b.classList.toggle('on', b.dataset.panel === name));
  renderPanel();
}
function closePanel() {
  ui.panel = null;
  $('drawer').hidden = true;
  document.querySelectorAll('.tool').forEach(b => b.classList.remove('on'));
}
document.querySelectorAll('.tool').forEach(b => b.addEventListener('click', () => openPanel(b.dataset.panel)));
$('drawerClose').addEventListener('click', closePanel);

async function renderPanel() {
  const body = $('drawerBody'), name = ui.panel;
  $('drawerTitle').textContent = PANEL_TITLES[name] || '';
  const top = body.scrollTop;
  const frag = document.createDocumentFragment();
  if (name === 'library') panelLibrary(frag);
  else if (name === 'tabs') await panelTabs(frag);
  else if (name === 'sessions') panelSessions(frag);
  else if (name === 'notes') panelNotes(frag);
  else if (name === 'settings') panelSettings(frag);
  if (ui.panel !== name) return;
  body.innerHTML = '';
  body.append(frag);
  body.scrollTop = top;
}

async function refreshTabs() { ui.tabs = await chrome.tabs.query({}); }

async function panelTabs(root) {
  await refreshTabs();
  const cur = (await chrome.windows.getCurrent()).id;
  const target = h('select', { class: 'field-in' }, sectionOptions(ui.tabTarget || activeWs().sections[0]?.id));
  target.addEventListener('change', () => { ui.tabTarget = target.value; });
  ui.tabTarget = target.value;
  const tgtSec = () => findSection(D, target.value)?.s;
  root.append(h('div', { class: 'group' },
    h('p', { class: 'muted small', style: 'margin:0 0 10px' }, 'Drag any tab onto a section, or save to:'),
    target,
    h('div', { class: 'btns', style: 'margin-top:10px' },
      h('button', { class: 'btn sm primary', onclick: () => { const s = tgtSec(); if (s) saveWindowTabsTo(s); } }, svg('save'), 'Save this window’s tabs'),
      h('button', { class: 'btn sm', onclick: () => saveSession() }, svg('sessions'), 'Save as session'))));
  const wins = [...new Set(ui.tabs.map(t => t.windowId))].sort((a, b) => (a === cur ? -1 : b === cur ? 1 : 0));
  const saved = new Set(allItems().map(x => urlKey(x.i.url)));
  const list = h('div', { class: 'group' });
  wins.forEach((wid, n) => {
    const tabs = ui.tabs.filter(t => t.windowId === wid && savable(t.url));
    if (!tabs.length) return;
    const head = h('div', { class: 'win-h', draggable: 'true', title: 'Drag onto the board to save every tab in this window' }, wid === cur ? `This window (${tabs.length})` : `Window ${n + 1} (${tabs.length})`);
    const winEntries = () => tabs.map(t => ({ url: t.url, title: t.title }));
    head.addEventListener('dragstart', e => {
      ui.drag = { type: 'entries', list: winEntries(), label: 'Saved tabs' };
      e.dataTransfer.effectAllowed = 'copy';
      e.dataTransfer.setData('text/uri-list', tabs.map(t => t.url).join('\r\n'));
    });
    head.addEventListener('dragend', endDrag);
    head.addEventListener('contextmenu', e => {
      e.preventDefault();
      showMenu([
        { label: 'Save all to section', icon: 'move', sub: () => sectionPicker((s, w) => addTo(s, w, winEntries())) },
        { label: 'Save all as a new section', icon: 'plus', act: () => entriesToNewSection(activeWs(), winEntries(), 'Saved tabs') },
        { label: 'Save all to Library', icon: 'library', act: () => addToLibrary(winEntries(), 'Saved tabs') }
      ], e);
    });
    list.append(head);
    for (const t of tabs) {
      const img = t.favIconUrl && !t.favIconUrl.startsWith('chrome') ? h('img', { src: t.favIconUrl, alt: '' }) : iconImg(t.url, t.title, 32);
      img.addEventListener('error', () => img.replaceWith(h('span', { class: 'ph' })), { once: true });
      const row = h('div', { class: 'tab-row' + (saved.has(urlKey(t.url)) ? ' saved' : ''), draggable: 'true', title: t.url, tabindex: '0', role: 'button' },
        img, h('span', { class: 'tt' }, t.title || t.url),
        iconBtn('save', 'Save to selected section', ev => { ev.stopPropagation(); const s = tgtSec(); if (s) addEntries(s, [{ url: t.url, title: t.title }]); }),
        iconBtn('x', 'Close tab', ev => { ev.stopPropagation(); chrome.tabs.remove(t.id); }));
      row.addEventListener('click', () => { chrome.tabs.update(t.id, { active: true }); chrome.windows.update(t.windowId, { focused: true }); });
      row.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target === row) row.click(); });
      row.addEventListener('contextmenu', e => { e.preventDefault(); tabMenu(t, e); });
      row.addEventListener('dragstart', e => {
        ui.drag = { type: 'tab', url: t.url, title: t.title };
        e.dataTransfer.effectAllowed = 'copy';
        e.dataTransfer.setData('text/uri-list', t.url);
      });
      row.addEventListener('dragend', endDrag);
      list.append(row);
    }
  });
  root.append(list);
}

let tabsT;
const tabsChanged = () => { clearTimeout(tabsT); tabsT = setTimeout(() => { if (ui.panel === 'tabs') renderPanel(); else refreshTabs(); }, 250); };
chrome.tabs.onUpdated.addListener((id, info) => { if (info.status === 'complete' || info.title) tabsChanged(); });
chrome.tabs.onRemoved.addListener(tabsChanged);
chrome.tabs.onCreated.addListener(tabsChanged);

async function saveSession(close = false) {
  const tabs = (await chrome.tabs.query({ currentWindow: true })).filter(t => savable(t.url));
  if (!tabs.length) return toast('No web pages open in this window.');
  const name = await promptBox('Name this session', new Date().toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }));
  if (name == null) return;
  commit(() => D.sessions.unshift({ id: uid(), name: name || 'Session', created: Date.now(), tabs: tabs.map(t => ({ url: t.url, title: t.title })) }),
    { msg: `Saved session with ${plural(tabs.length, 'tab')}` });
  if (close) {
    const self = await chrome.tabs.getCurrent();
    chrome.tabs.remove(tabs.map(t => t.id).filter(id => id !== self?.id));
  }
  if (ui.panel === 'sessions') renderPanel();
}

function panelSessions(root) {
  root.append(h('div', { class: 'group' },
    h('p', { class: 'muted small', style: 'margin:0 0 10px' }, 'A session stores every tab in this window so you can reopen them later.'),
    h('div', { class: 'btns' },
      h('button', { class: 'btn sm primary', onclick: () => saveSession(false) }, svg('save'), 'Save open tabs'),
      h('button', { class: 'btn sm', onclick: () => saveSession(true) }, svg('x'), 'Save and close them'))));
  const list = h('div', { class: 'group' });
  if (!D.sessions.length) list.append(h('p', { class: 'muted' }, 'No sessions yet.'));
  for (const s of D.sessions) {
    const date = new Date(s.created).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    const a = sessionActions(s);
    const card = h('div', { class: 'sess', draggable: 'true', title: 'Drag onto the board to add these tabs as a section' },
      h('div', { class: 'sess-top' }, h('b', null, s.name), h('span', { class: 'muted small' }, `${plural(s.tabs.length, 'tab')}, ${date}`)),
      h('div', { class: 'btns' },
        h('button', { class: 'btn sm', onclick: a.restore }, svg('window'), 'Restore'),
        h('button', { class: 'btn sm', onclick: a.openHere }, svg('open'), 'Open here'),
        h('button', { class: 'btn sm', onclick: a.toSection }, svg('folder'), 'To section'),
        iconBtn('edit', 'Rename', a.rename),
        iconBtn('trash', 'Delete', a.remove)),
      h('details', null, h('summary', null, 'Show tabs'),
        h('ul', null, s.tabs.map(t => h('li', null, h('a', { href: t.url, style: 'color:inherit' }, t.title || t.url))))));
    card.addEventListener('dragstart', e => {
      if (e.target.closest?.('a')) return;   // a single link inside drags on its own
      ui.drag = { type: 'entries', list: s.tabs.map(t => ({ url: t.url, title: t.title })), label: s.name };
      e.dataTransfer.effectAllowed = 'copy';
      e.dataTransfer.setData('text/uri-list', s.tabs.map(t => t.url).join('\r\n'));
    });
    card.addEventListener('dragend', endDrag);
    card.addEventListener('contextmenu', e => {
      if (e.target.closest('a')) return;
      e.preventDefault();
      showMenu([
        { label: 'Restore in a new window', icon: 'window', act: a.restore },
        { label: 'Open here', icon: 'open', act: a.openHere },
        { sep: true },
        { label: 'Add as a section', icon: 'folder', act: a.toSection },
        { label: 'Add to section', icon: 'move', sub: () => sectionPicker((x, w) => addTo(x, w, s.tabs.map(t => ({ url: t.url, title: t.title })))) },
        { label: 'Save to Library', icon: 'library', act: () => addToLibrary(s.tabs.map(t => ({ url: t.url, title: t.title })), s.name) },
        { sep: true },
        { label: 'Rename', icon: 'edit', act: a.rename },
        { label: 'Delete session', icon: 'trash', danger: true, act: a.remove }
      ], e);
    });
    list.append(card);
  }
  root.append(list);
}

function sessionActions(s) {
  return {
    restore: () => chrome.windows.create({ url: s.tabs.map(t => t.url) }),
    openHere: () => s.tabs.forEach(t => chrome.tabs.create({ url: t.url, active: false })),
    toSection: () => entriesToNewSection(activeWs(), s.tabs.map(t => ({ url: t.url, title: t.title })), s.name, false),
    rename: async () => { const n = await promptBox('Rename session', s.name); if (n) commit(() => { s.name = n; }); },
    remove: () => commit(() => { const i = D.sessions.indexOf(s); if (i > -1) D.sessions.splice(i, 1); }, { undo: true, msg: `Deleted session ${s.name}` })
  };
}

function tabMenu(t, e) {
  const entry = [{ url: t.url, title: t.title }];
  showMenu([
    { label: 'Switch to tab', icon: 'tab', act: () => { chrome.tabs.update(t.id, { active: true }); chrome.windows.update(t.windowId, { focused: true }); } },
    { sep: true },
    { label: 'Save to the board', icon: 'plus', act: () => addEntries(boardTarget(), entry) },
    { label: 'Save to section', icon: 'move', sub: () => sectionPicker((s, w) => addTo(s, w, entry)) },
    { label: 'Save to Library', icon: 'library', act: () => addToLibrary(entry) },
    { label: 'Copy link', icon: 'copy', act: () => copyLink(t.url) },
    { sep: true },
    { label: 'Close tab', icon: 'x', danger: true, act: () => chrome.tabs.remove(t.id) }
  ], e);
}

// Submenu of every section (this workspace first) plus "New section" per workspace. act(section|null, workspace)
function sectionPicker(act, skip) {
  const ws = activeWs();
  return [ws, ...D.workspaces.filter(w => w !== ws)].flatMap(w => [
    { heading: w.name },
    ...w.sections.filter(x => x !== skip).map(x => ({ label: x.name, act: () => act(x, w) })),
    { label: 'New section', icon: 'plus', act: () => act(null, w) }
  ]);
}
const addTo = (s, w, entries) => { hideResults(); return s ? addEntries(s, entries) : entriesToNewSection(w, entries); };
// Moves a bookmark into s, or into a new section of w when s is null (one undo step either way).
function moveTo(id, s, w) {
  hideResults();
  if (s) return commit(() => moveItem(id, s.id, s.items.length), { undo: true, msg: `Moved to ${w.name} › ${s.name}` });
  const n = { id: uid(), name: 'New section', color: COLORS[w.sections.length % COLORS.length], collapsed: false, items: [] };
  commit(() => { w.sections.push(n); moveItem(id, n.id, 0); }, { undo: true, msg: `Moved to ${w.name} › New section` });
  if (w.id === D.activeWs) startRenameById(n.id);
}

function entriesToNewSection(w, entries, name = 'New section', rename = true) {
  entries = entries.filter(x => savable(x.url));
  if (!entries.length) return null;
  const s = { id: uid(), name, color: COLORS[w.sections.length % COLORS.length], collapsed: false, items: [] };
  commit(() => { w.sections.push(s); entries.forEach(x => addItem(D, s.id, x)); }, { undo: true, msg: `Added ${plural(entries.length, 'link')} to ${w.name} › ${name}` });
  if (rename && w.id === D.activeWs) startRenameById(s.id);
  return s;
}

function addToLibrary(entries, folder = '') {
  const have = new Set(D.library.map(i => urlKey(i.url)));
  const add = entries.filter(x => savable(x.url) && !have.has(urlKey(x.url)) && have.add(urlKey(x.url)));
  if (!add.length) return toast(entries.length ? 'Already in your Library.' : 'Nothing to add.');
  commit(() => add.forEach(x => addItem(D, LIBRARY, { ...x, folder: x.folder || folder })), { undo: true, msg: `Added ${plural(add.length, 'link')} to the Library` });
}
function moveToLibrary(id) {
  const f = findItem(id);
  if (!f?.w) return;
  commit(() => moveItem(id, LIBRARY, D.library.length), { undo: true, msg: `Moved ${f.i.title} to the Library` });
}
function sectionToLibrary(ws, s) {
  commit(() => {
    const i = ws.sections.indexOf(s);
    if (i < 0) return;
    ws.sections.splice(i, 1);
    D.library.push(...s.items.map(x => ({ ...x, folder: s.name })));
  }, { undo: true, msg: `Moved ${s.name} (${plural(s.items.length, 'link')}) to the Library` });
}

// "Show on the board": switch workspace, expand the section, scroll to the tile and flash it.
function revealItem(id) {
  const f = findItem(id);
  if (!f?.w) return;
  if (D.activeWs !== f.w.id) switchWs(f.w.id);
  if (f.s.collapsed) commit(() => { f.s.collapsed = false; });
  requestAnimationFrame(() => {
    const el = document.querySelector(`.tile[data-id="${id}"]`);
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: smooth() });
    el.focus({ preventScroll: true });
    el.classList.add('flash');
    setTimeout(() => el.classList.remove('flash'), 1600);
  });
}

// Right-click on empty space around the board
document.addEventListener('contextmenu', e => {
  if (e.defaultPrevented || e.target.closest('.sec, .new-sec, .ws, .results, .search, .tools, .drawer, .menu, .modal, .toasts, input, textarea, select, a, button')) return;
  e.preventDefault();
  const ws = activeWs(), list = D.settings.view === 'list';
  showMenu([
    { label: 'New section', icon: 'plus', act: () => newSection(ws) },
    { label: 'New workspace', icon: 'plus', act: addWs },
    { sep: true },
    { label: list ? 'Show as icons' : 'Show as list', icon: 'sort', act: () => setSetting('view', list ? 'grid' : 'list', true) },
    { label: 'Collapse all sections', icon: 'chev', act: () => commit(() => ws.sections.forEach(s => { s.collapsed = true; })) },
    { label: 'Expand all sections', icon: 'chev', act: () => commit(() => ws.sections.forEach(s => { s.collapsed = false; })) },
    { sep: true },
    { label: 'Search', icon: 'link', hint: 'Ctrl K', act: () => q.focus() },
    { label: 'Library', icon: 'library', act: () => openPanel('library') },
    { label: 'Customise', icon: 'edit', act: () => openPanel('settings') }
  ], e);
});

/* ================= Library ================= */
// Section on the board that "add from Library" puts links into: the one under the pointer, else the last used, else the first.
function boardTarget() {
  const ws = activeWs();
  return ws.sections.find(x => x.id === ui.hoverSec) || ws.sections.find(x => x.id === D.last) || ws.sections[0] || newSection(ws, 'Inbox');
}
function addFromLibrary(it) {
  hideResults();
  addEntries(boardTarget(), [{ url: it.url, title: it.title, tags: [...it.tags], note: it.note }]);
}

function organizeLibrary() {
  if (!D.library.length) return toast('The Library is empty. Import bookmarks first.');
  const groups = organize(D.library, urlKey);
  const total = groups.reduce((a, [, l]) => a + l.length, 0);
  let name = 'Organized', k = 2;
  while (D.workspaces.some(w => w.name === name)) name = `Organized ${k++}`;
  const ws = { id: uid(), name, notes: '', sections: groups.map(([sec, list], i) => ({
    id: uid(), name: sec, color: COLORS[i % COLORS.length],
    collapsed: total > 400,   // big libraries open collapsed so the board stays fast; expand what you need
    items: list.map(x => ({ id: uid(), url: x.url, title: x.title, tags: [...x.tags], note: x.note, added: x.added }))
  })) };
  commit(() => { D.workspaces.push(ws); D.activeWs = ws.id; }, { undo: true, msg: `Organized ${plural(total, 'bookmark')} into ${plural(ws.sections.length, 'section')} in “${name}”` });
  closePanel();
}

function removeDuplicates() {
  const seen = new Set(), keepB = [], libSeen = new Set();
  let n = 0;
  for (const w of D.workspaces) for (const s of w.sections) for (const i of s.items) { const k = urlKey(i.url); if (seen.has(k)) { n++; keepB.push(i.id); } else seen.add(k); }
  const dropLib = new Set();
  for (const i of D.library) { const k = urlKey(i.url); if (libSeen.has(k)) { n++; dropLib.add(i.id); } else libSeen.add(k); }
  if (!n) return toast('No duplicates found.');
  const dropB = new Set(keepB);
  commit(() => {
    for (const w of D.workspaces) for (const s of w.sections) s.items = s.items.filter(i => !dropB.has(i.id));
    D.library = D.library.filter(i => !dropLib.has(i.id));
  }, { undo: true, msg: `Removed ${plural(n, 'duplicate')}` });
}

function panelLibrary(root) {
  const lib = D.library, folders = new Map();
  for (const i of lib) { const f = i.folder || 'Unsorted'; folders.set(f, (folders.get(f) || 0) + 1); }
  root.append(group(null,
    h('div', { class: 'lib-hero' }, h('b', null, lib.length.toLocaleString()), h('span', null, lib.length === 1 ? 'bookmark in your Library' : 'bookmarks in your Library')),
    h('p', { class: 'muted small', style: 'margin:0' }, 'Imports land here as one list. They are searchable (Ctrl K) but not shown on the board. Drag a search result or a folder onto the board, press + or Alt+Enter, or right-click for more. Drop links, tiles or sections on the Library button to move them here.')));
  root.append(h('div', { class: 'btns stack' },
    h('button', { class: 'btn primary', onclick: organizeLibrary, disabled: !lib.length }, svg('wand'), 'Organize into a workspace'),
    h('button', { class: 'btn', onclick: () => $('fileIn').click() }, svg('upload'), 'Import file (CSV, HTML, Raindrop)'),
    h('button', { class: 'btn', onclick: importBrave }, svg('download'), 'Import from Brave'),
    h('button', { class: 'btn', onclick: removeDuplicates }, svg('copy'), 'Remove duplicates')));
  if (folders.size) {
    const rows = [...folders].sort((a, b) => b[1] - a[1]).slice(0, 300).map(([f, n]) => {
      const row = h('div', { class: 'row', draggable: 'true', title: 'Drag onto the board, or right-click for more' },
        h('span', { class: 'row-t' }, f), h('span', { class: 'muted small' }, n),
        iconBtn('plus', 'Add this folder to the board as a section', () => folderToBoard(f)),
        iconBtn('trash', 'Remove this folder from the Library', () => removeFolder(f)));
      row.addEventListener('dragstart', e => {
        const list = folderItems(f).map(entryOf);
        ui.drag = { type: 'entries', list, label: leaf(f), fromLibrary: true };
        e.dataTransfer.effectAllowed = 'copy';
        e.dataTransfer.setData('text/uri-list', list.map(x => x.url).join('\r\n'));
      });
      row.addEventListener('dragend', endDrag);
      row.addEventListener('contextmenu', e => { e.preventDefault(); folderMenu(f, e); });
      return row;
    });
    root.append(group('Folders', ...rows));
  }
  if (lib.length) root.append(h('button', { class: 'btn danger', style: 'margin-top:14px', onclick: async () => {
    if (await confirmBox(`Remove all ${lib.length} bookmarks from the Library?`, 'Clear Library', true)) commit(() => { D.library = []; }, { undo: true, msg: 'Library cleared' });
  } }, svg('trash'), 'Clear Library'));
}

const leaf = f => f.split(' / ').pop();
const folderItems = f => D.library.filter(i => (i.folder || 'Unsorted') === f);
const folderToBoard = (f, w = activeWs()) => entriesToNewSection(w, folderItems(f).map(entryOf), leaf(f), false);
const removeFolder = f => { const n = folderItems(f).length; commit(() => { D.library = D.library.filter(i => (i.folder || 'Unsorted') !== f); }, { undo: true, msg: `Removed ${plural(n, 'bookmark')} from the Library` }); };
function folderMenu(f, e) {
  const list = () => folderItems(f).map(entryOf);
  showMenu([
    { label: 'Add to the board as a section', icon: 'folder', act: () => folderToBoard(f) },
    { label: 'Add to workspace', icon: 'move', sub: () => D.workspaces.map(w => ({ label: w.name, act: () => folderToBoard(f, w) })) },
    { label: 'Add links to section', icon: 'plus', sub: () => sectionPicker((s, w) => addTo(s, w, list())) },
    { label: 'Open all', icon: 'open', act: () => openAll({ items: folderItems(f) }) },
    { sep: true },
    { label: 'Rename folder', icon: 'edit', act: async () => {
      const n = (await promptBox('Rename folder', f))?.trim();
      if (!n || n === f) return;
      commit(() => D.library.forEach(i => {
        const cur = i.folder || 'Unsorted';
        if (cur === f) i.folder = n; else if (cur.startsWith(f + ' / ')) i.folder = n + cur.slice(f.length);
      }), { undo: true, msg: `Renamed to ${n}` });
    } },
    { label: 'Remove from Library', icon: 'trash', danger: true, act: () => removeFolder(f) }
  ], e);
}

// iOS-style grouped list: optional small header above an inset card of rows.
function group(title, ...rows) {
  return h('div', { class: 'group' }, title ? h('h3', null, title) : null, h('div', { class: 'card' }, ...rows));
}

let notesT, notesPending = null;
function flushNotes() {
  clearTimeout(notesT);
  const p = notesPending;
  notesPending = null;
  if (!p) return false;
  const w = D.workspaces.find(x => x.id === p.id);   // D may have been replaced by a sync since typing began
  if (w) w.notes = p.text;
  return !!w;
}
function panelNotes(root) {
  const ws = activeWs();
  const ta = h('textarea', { class: 'notes-area', placeholder: `Notes for ${ws.name}. Saved automatically.` });
  ta.value = ws.notes;
  ta.addEventListener('input', () => {
    notesPending = { id: ws.id, text: ta.value };
    clearTimeout(notesT);
    notesT = setTimeout(() => { if (flushNotes()) save(D); }, 350);
  });
  root.append(h('p', { class: 'muted small' }, `Workspace: ${ws.name}`), ta);
  setTimeout(() => ta.focus(), 50);
}

/* ================= Settings ================= */
let setT = null;
function setSetting(k, v, board = false) {
  D.settings[k] = v;
  clearTimeout(setT);
  setT = setTimeout(() => { setT = null; save(D); }, 200);
  applySettings();
  if (board) renderBoard();
}

function ctlRange(label, k, min, max, step, fmt = v => v) {
  const out = h('span', { class: 'val' }, fmt(D.settings[k]));
  const r = h('input', { type: 'range', min, max, step, value: D.settings[k] });
  r.addEventListener('input', () => { out.textContent = fmt(+r.value); setSetting(k, +r.value); });
  return h('label', { class: 'ctl range' }, h('span', null, label), out, r);
}
function ctlSeg(label, k, opts, board = false, after) {
  const seg = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': label });
  for (const [v, l] of opts) {
    const b = h('button', { class: D.settings[k] === v ? 'on' : '', role: 'radio', 'aria-checked': String(D.settings[k] === v) }, l);
    b.addEventListener('click', () => {
      setSetting(k, v, board);
      seg.querySelectorAll('button').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', String(x === b)); });
      after?.();
    });
    seg.append(b);
  }
  return h('div', { class: 'ctl' }, h('span', null, label), seg);
}
function ctlSwitch(label, k) {
  const c = h('input', { type: 'checkbox', class: 'switch' });
  c.checked = !!D.settings[k];
  c.addEventListener('change', () => setSetting(k, c.checked));
  return h('label', { class: 'ctl' }, h('span', null, label), c);
}

// iOS system colours, plus white and graphite
const ACCENTS = [['#0A84FF', 'Blue'], ['#5E5CE6', 'Indigo'], ['#BF5AF2', 'Purple'], ['#FF375F', 'Pink'], ['#FF453A', 'Red'], ['#FF9F0A', 'Orange'],
  ['#FFD60A', 'Yellow'], ['#30D158', 'Green'], ['#63E6E2', 'Mint'], ['#64D2FF', 'Cyan'], ['#8E8E93', 'Graphite'], ['#F2F2F7', 'White']];

function panelSettings(root) {
  const s = D.settings;
  // Appearance
  const acc = h('div', { class: 'swatches' });
  const drawAcc = () => {
    acc.innerHTML = '';
    ACCENTS.forEach(([c, name]) => acc.append(h('button', { class: 'sw' + (s.accent.toLowerCase() === c.toLowerCase() ? ' on' : ''), style: `--c:${c}`, title: name, 'aria-label': name, onclick: () => { setSetting('accent', c); drawAcc(); } })));
    const ci = h('input', { type: 'color', class: 'sw-input', value: s.accent, title: 'Custom colour', 'aria-label': 'Custom colour' });
    ci.addEventListener('input', () => setSetting('accent', ci.value));
    ci.addEventListener('change', drawAcc);
    acc.append(ci);
  };
  drawAcc();
  const pct = v => Math.round(v * 100) + '%';
  const frostRows = [ctlRange('Card opacity', 'cardOpacity', 0.1, 1, 0.01, pct), ctlRange('Blur intensity', 'blur', 0, 50, 1, v => v + 'px')];
  const showFrost = () => frostRows.forEach(r => { r.hidden = D.settings.material !== 'frosted'; });
  showFrost();
  root.append(group('Appearance',
    ctlSeg('Theme', 'theme', [['black', 'Black'], ['dark', 'Dark'], ['light', 'Light'], ['system', 'Auto']]),
    h('div', { class: 'ctl col' }, h('span', null, 'Accent'), acc),
    ctlSeg('Layout', 'layout', [['centered', 'Centered'], ['board', 'Board']], true, () => tick()),
    ctlSeg('Surfaces', 'material', [['solid', 'Solid'], ['frosted', 'Frosted']], false, showFrost),
    ...frostRows,
    ctlRange('Card radius', 'radius', 0, 28, 1, v => v + 'px'),
    ctlRange('Glow', 'glow', 0, 1, 0.01, pct),
    ctlRange('Density', 'density', 0.8, 1.2, 0.01, pct),
    ctlSeg('Font', 'font', [['system', 'System'], ['rounded', 'Rounded'], ['serif', 'Serif'], ['mono', 'Mono']])));

  // Wallpaper
  const walls = h('div', { class: 'walls' });
  const drawWalls = () => {
    walls.innerHTML = '';
    walls.append(h('button', { class: 'wall-opt none' + (s.wallpaper === 'none' ? ' on' : ''), onclick: () => { setSetting('wallpaper', 'none'); drawWalls(); } }, 'None'));
    for (const [k, [label, css]] of Object.entries(WALLS))
      walls.append(h('button', { class: 'wall-opt' + (s.wallpaper === k ? ' on' : '') + (LIGHT_WALLS.has(k) ? ' lt' : ''), style: `background:${css}`, onclick: () => { useWall(k); drawWalls(); } }, label));
    const solid = h('button', { class: 'wall-opt' + (s.wallpaper === 'solid' ? ' on' : ''), style: `background:${s.wallColor}`, onclick: () => { useWall('solid'); drawWalls(); } }, 'Solid');
    const img = h('button', { class: 'wall-opt' + (s.wallpaper === 'image' ? ' on' : '') + (wallSrc() ? '' : ' empty'), style: wallSrc() ? `background-image:${cssUrl(wallSrc())}` : '',
      onclick: () => { if (wallSrc()) { useWall('image'); drawWalls(); } else pickWallpaper(drawWalls); } }, wallSrc() ? 'My image' : '+ Photo');
    walls.append(solid, img);
  };
  drawWalls();
  const wc = h('input', { type: 'color', class: 'sw-input', value: s.wallColor });
  wc.addEventListener('input', () => { D.settings.wallColor = wc.value; useWall('solid'); });
  wc.addEventListener('change', drawWalls);
  root.append(group('Wallpaper', h('div', { class: 'ctl col' }, walls),
    h('div', { class: 'ctl btns' },
      h('button', { class: 'btn sm', onclick: () => pickWallpaper(drawWalls) }, svg('upload'), 'Upload image'),
      h('button', { class: 'btn sm', onclick: () => wallpaperFromLink(drawWalls) }, svg('image'), 'Image from link'),
      h('label', { class: 'btn sm' }, wc, 'Solid colour'),
      wallSrc() ? h('button', { class: 'btn sm danger', onclick: async () => { await chrome.storage.local.remove('wallpaper'); wallpaper = null; if (s.wallpaper === 'image') setSetting('wallpaper', 'none'); drawWalls(); } }, 'Remove image') : null),
    ctlRange('Wallpaper dim', 'wallDim', 0, 0.8, 0.01, pct),
    ctlRange('Wallpaper blur', 'wallBlur', 0, 40, 1, v => v + 'px')),
    h('p', { class: 'foot' }, 'Choosing a wallpaper turns on frosted cards; tune them with Card opacity and Blur intensity above. For photos, upload one or paste a link to any image (e.g. from Unsplash).'));

  // Layout
  root.append(group('Layout',
    ctlSeg('View', 'view', [['grid', 'Icons'], ['list', 'List']], true),
    ctlRange('Icon size', 'tile', 36, 96, 2, v => v + 'px'),
    ctlRange('Section width', 'sectionWidth', 200, 520, 10, v => v + 'px'),
    ctlRange('Grid spacing', 'gap', 6, 36, 1, v => v + 'px'),
    ctlSwitch('Show titles', 'showTitles'),
    ctlSwitch('Show counts', 'showCounts')));

  // Header
  const greet = h('input', { class: 'field-in', value: s.greeting, placeholder: 'Automatic (Good morning…)' });
  greet.addEventListener('input', () => setSetting('greeting', greet.value.trim()));
  root.append(group('Header',
    ctlSwitch('Clock', 'showClock'),
    ctlSwitch('24-hour time', 'clock24'),
    h('label', { class: 'ctl' }, h('span', null, 'Greeting'), greet)));

  // Behaviour
  root.append(group('Behaviour',
    ctlSeg('Open links', 'openIn', [['same', 'This tab'], ['new', 'New tab']], true),
    ctlSeg('Site icons', 'iconSource', [['brave', 'Private'], ['online', 'Sharper']], true),
    h('div', { class: 'ctl' }, h('span', null, 'Icon cache'), h('button', { class: 'btn sm', onclick: () => { clearIconCache(); tileCache.clear(); renderBoard(); toast('Icons will be fetched again.'); } }, svg('restore'), 'Refresh icons'))),
    h('p', { class: 'foot' }, 'Private uses icons Brave already has and keeps a copy on this computer so tabs open instantly. Sharper fetches icons from Google’s favicon service, which sees the site addresses.'));

  // Sync
  root.append(syncGroup());

  // Data
  const n = allItems().length, secs = D.workspaces.reduce((a, w) => a + w.sections.length, 0);
  root.append(group('Your data',
    h('div', { class: 'ctl' }, h('span', null, `${plural(n, 'bookmark')} on the board, ${D.library.length.toLocaleString()} in the Library`)),
    h('div', { class: 'ctl btns' },
      h('button', { class: 'btn sm', onclick: importBrave }, svg('download'), 'Import from Brave'),
      h('button', { class: 'btn sm', onclick: () => $('fileIn').click() }, svg('upload'), 'Import file'),
      h('button', { class: 'btn sm', onclick: exportJSON }, svg('save'), 'Back up (JSON)'),
      h('button', { class: 'btn sm', onclick: exportHTML }, svg('download'), 'Export HTML')),
    h('div', { class: 'ctl' }, h('button', { class: 'btn sm danger', onclick: async () => {
      if (!(await confirmBox('Erase everything and start fresh?', 'Erase all', true))) return;
      const snap = structuredClone(D);
      D = seed(); save(D); render(); renderPanel();
      toast('Everything erased', () => { D = snap; save(D); render(); renderPanel(); });
    } }, svg('trash'), 'Erase all'))),
    h('p', { class: 'foot' }, `${plural(secs, 'section')} across ${plural(D.workspaces.length, 'workspace')}. Imports (CSV, HTML, Raindrop, Brave) go to the Library. Stored only on this computer.`));

  // Shortcuts
  const keys = [['Ctrl K or /', 'Search and commands'], ['Type anywhere', 'Start searching'], ['Alt Enter', 'Add a Library result to the board'], ['Ctrl V', 'Paste a URL into the section under the pointer'],
    ['Alt 1 to 9', 'Switch workspace'], ['Ctrl Z', 'Undo last change'], ['E or F2', 'Edit the focused bookmark'], ['Delete', 'Delete the focused bookmark'],
    ['Alt Shift D', 'Save popup (any page)'], ['Alt Shift S', 'Instant save (any page)'], ['Esc', 'Close panels and menus']];
  root.append(group('Shortcuts', ...keys.map(([k, d]) => h('div', { class: 'ctl' }, h('span', { class: 'small' }, d), h('kbd', null, k)))),
    h('p', { class: 'foot' }, 'Change the Alt Shift shortcuts at brave://extensions/shortcuts.'));
}

/* ================= Sync (private GitHub repository) ================= */
const ago = t => { const s = Math.round((Date.now() - t) / 1000); return s < 10 ? 'just now' : s < 60 ? `${s} s ago` : s < 3600 ? `${Math.round(s / 60)} min ago` : new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }); };
function syncStateText(st) {
  if (!st || st.status === 'off') return ['Not connected', ''];
  if (st.status === 'syncing') return ['Syncing…', ''];
  if (st.status === 'error') return [st.error, 'err'];
  return [`Synced ${ago(st.last || st.at)}`, 'ok'];
}
function showSyncState(st) {
  const el = ui.syncStatusEl;
  if (!el?.isConnected) return;
  const [text, cls] = syncStateText(st);
  el.textContent = text;
  el.className = 'sync-status ' + cls;
}

function syncGroup() {
  const g = group('Sync (private GitHub repository)');
  const card = g.querySelector('.card');
  chrome.storage.local.get(['sync', 'syncState']).then(({ sync, syncState }) => {
    if (sync?.repo) {
      ui.syncStatusEl = h('span', { class: 'sync-status' });
      card.append(
        h('div', { class: 'ctl' }, h('span', null, 'Repository'), h('span', { class: 'muted' }, sync.repo)),
        h('div', { class: 'ctl' }, h('span', null, 'Status'), ui.syncStatusEl),
        h('div', { class: 'ctl btns' },
          h('button', { class: 'btn sm', onclick: async e => { e.currentTarget.disabled = true; await chrome.runtime.sendMessage({ type: 'sync-now' }); if (e.target.isConnected) e.target.disabled = false; } }, svg('restore'), 'Sync now'),
          h('button', { class: 'btn sm danger', onclick: disconnectSync }, 'Disconnect')));
      showSyncState(syncState);
      g.append(h('p', { class: 'foot' }, 'Changes upload a few seconds after you make them. Other laptops pick them up when a new tab opens and every 5 minutes. Edits made on two laptops are merged.'));
    } else {
      const repo = h('input', { class: 'field-in', placeholder: 'yourname/tabogt-data', spellcheck: 'false', 'aria-label': 'Repository (owner/name)' });
      const token = h('input', { class: 'field-in', type: 'password', placeholder: 'github_pat_…', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Access token' });
      const go = h('button', { class: 'btn sm primary', onclick: () => connectSync(repo.value, token.value, go) }, 'Connect');
      token.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) go.click(); });
      card.append(
        h('label', { class: 'ctl' }, h('span', null, 'Repository'), repo),
        h('label', { class: 'ctl' }, h('span', null, 'Access token'), token),
        h('div', { class: 'ctl btns' }, go));
      g.append(h('div', { class: 'foot' },
        h('b', null, 'Set up once (free):'),
        h('ol', null,
          h('li', null, 'On github.com create a new ', h('b', null, 'private'), ' repository, e.g. tabogt-data.'),
          h('li', null, 'Settings → Developer settings → Fine-grained tokens → Generate. Repository access: only that repository. Permissions: ', h('b', null, 'Contents: Read and write'), '.'),
          h('li', null, 'Paste owner/name and the token here, then Connect. Do the same on your other laptops.')),
        'The token stays on this computer only. It is not in backups or in the synced file.'));
    }
  });
  return g;
}

// Returns 'replace' | 'merge' | null
function chooseFirstSync(remote) {
  const n = remote.doc.workspaces.reduce((a, w) => a + w.sections.reduce((b, s) => b + s.items.length, 0), 0);
  return new Promise(res => {
    const done = v => { res(v); closeDialog(); };
    openDialog([
      h('h2', null, 'This repository already has TabOgt data'),
      h('p', { class: 'muted', style: 'margin:0' }, `${plural(n, 'bookmark')} in ${plural(remote.doc.workspaces.length, 'workspace')}, ${remote.doc.library.length.toLocaleString()} in the Library. Use it on this laptop, or combine it with what is here?`),
      h('div', { class: 'btns' },
        h('button', { class: 'btn', onclick: () => done(null) }, 'Cancel'),
        h('button', { class: 'btn', onclick: () => done('merge') }, 'Merge with this laptop'),
        h('button', { class: 'btn primary', onclick: () => done('replace') }, 'Use GitHub data'))
    ], () => done('replace'), () => res(null));
  });
}

async function connectSync(repoIn, tokenIn, btn) {
  const repo = repoIn.trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/, '').replace(/\/+$/, '');
  const token = tokenIn.trim();
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return toast('Enter the repository as owner/name, e.g. yourname/tabogt-data.');
  if (!token) return toast('Paste your GitHub access token.');
  let api;
  try { api = localStorage.getItem('tabogt-sync-api') || undefined; } catch { /* storage off */ }   // test hook
  const cfg = { repo, token, path: 'tabogt-data.json', ...(api ? { api } : {}) };
  btn.disabled = true;
  btn.textContent = 'Checking…';
  try {
    const info = await checkRepo(cfg);
    if (!info.private && !(await confirmBox('This repository is public: anyone could read your bookmarks. Connect anyway?', 'Connect anyway', true))) return;
    const remote = await readRemote(cfg);
    const mode = remote ? await chooseFirstSync(remote) : 'merge';
    if (!mode) return;
    await chrome.storage.local.set({ sync: { ...cfg, firstMode: mode }, syncState: { status: 'syncing', at: Date.now() } });
    const res = await chrome.runtime.sendMessage({ type: 'sync-now' });
    if (res?.status === 'error') toast(res.error);
    else toast(mode === 'replace' ? 'Connected. This laptop now has your GitHub data.' : 'Connected. Your bookmarks are synced.');
  } catch (e) {
    toast(e.message || 'Could not reach GitHub.');
  } finally {
    if (btn.isConnected) { btn.disabled = false; btn.textContent = 'Connect'; }
  }
}

async function disconnectSync() {
  if (!(await confirmBox('Stop syncing this laptop? Your bookmarks stay here and in the repository.', 'Disconnect', true))) return;
  await chrome.storage.local.remove(['sync', 'syncBase']);
  await chrome.storage.local.set({ syncState: { status: 'off', at: Date.now() } });
  renderPanel();
}

// Any wallpaper (gradient, colour or photo) switches cards to frosted glass so it shows through, like Tabisto.
function useWall(k) {
  setSetting('wallpaper', k);
  if (k !== 'none' && D.settings.material !== 'frosted') setSetting('material', 'frosted');
  if (ui.panel === 'settings') setTimeout(renderPanel);
}

async function wallpaperFromLink(after) {
  const link = await promptBox('Paste a link to an image (https://…)', '', 'Use image');
  if (!link) return;
  let u;
  try { u = new URL(link.trim()); } catch { return toast('That is not a web address.'); }
  if (!/^https?:$/.test(u.protocol)) return toast('Use an https:// image link.');
  const ok = await new Promise(res => { const im = new Image(); im.onload = () => res(true); im.onerror = () => res(false); im.src = u.href; });
  if (!ok) return toast('That link did not load as an image. Copy the image address itself (right-click the image > Copy image address).');
  wallpaper = { url: u.href };
  await chrome.storage.local.set({ wallpaper });
  wallCss = null;
  useWall('image');
  after?.();
}

function pickWallpaper(after) {
  const inp = h('input', { type: 'file', accept: 'image/*' });
  inp.addEventListener('change', async () => {
    const f = inp.files[0];
    if (!f) return;
    let bmp;
    try { bmp = await createImageBitmap(f); }
    catch { return toast('That image format is not supported. Try a JPG or PNG.'); }
    const scale = Math.min(1, 2560 / bmp.width);
    const c = h('canvas', { width: Math.round(bmp.width * scale), height: Math.round(bmp.height * scale) });
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    wallpaper = { data: c.toDataURL('image/jpeg', 0.88) };
    await chrome.storage.local.set({ wallpaper });
    wallCss = null;
    useWall('image');
    after?.();
  });
  inp.click();
}

/* ================= Import / export ================= */
// Imports never touch the board: every bookmark is added to the Library as one list (duplicates skipped),
// keeping its original folder so search and "Organize" can use it.
function finishImport(name, groups) {
  const have = new Set(D.library.map(i => urlKey(i.url))), add = [];
  let dup = 0;
  for (const [folder, items] of groups) for (const it of items) {
    if (!savable(it.url)) continue;
    const k = urlKey(it.url);
    if (have.has(k)) { dup++; continue; }
    have.add(k);
    add.push({ url: it.url, title: it.title, tags: it.tags || [], note: it.note || '', added: it.added, folder: folder || '' });
  }
  if (!add.length) return toast(dup ? `All ${plural(dup, 'bookmark')} are already in your Library.` : 'No bookmarks found to import.');
  commit(() => add.forEach(x => addItem(D, LIBRARY, x)), {
    undo: true, msg: `Added ${plural(add.length, 'bookmark')} to your Library${dup ? ` (${dup} already there)` : ''}`,
    action: { label: 'Organize', run: organizeLibrary }
  });
  if (ui.panel === 'settings' || ui.panel === 'library') renderPanel();
}

async function importBrave() {
  const ok = await chrome.permissions.request({ permissions: ['bookmarks'] }).catch(() => false);
  if (!ok) return toast('Bookmark access was not granted.');
  const tree = await chrome.bookmarks.getTree();
  const groups = new Map();
  const walk = (node, path) => {
    for (const c of node.children || []) {
      if (c.url) {
        const key = path.join(' / ') || 'Bookmarks';
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push({ url: c.url, title: c.title, added: c.dateAdded });
      } else walk(c, [...path, c.title]);
    }
  };
  tree.forEach(r => walk(r, []));
  finishImport('Brave', groups);
}

function parseNetscape(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const groups = new Map();
  const kids = dl => [...dl.children].flatMap(c => c.tagName === 'P' ? [...c.children] : [c]);
  const walk = (dl, path) => {
    for (const dt of kids(dl)) {
      if (dt.tagName !== 'DT') continue;
      const h3 = dt.querySelector(':scope > h3'), a = dt.querySelector(':scope > a');
      if (h3) {
        const sub = dt.querySelector(':scope > dl') || (dt.nextElementSibling?.tagName === 'DL' ? dt.nextElementSibling : null);
        if (sub) walk(sub, [...path, h3.textContent.trim()]);
      } else if (a) {
        const key = path.join(' / ') || 'Imported';
        if (!groups.has(key)) groups.set(key, []);
        const dd = dt.nextElementSibling?.tagName === 'DD' ? dt.nextElementSibling.textContent.trim() : '';
        const added = +a.getAttribute('add_date');
        groups.get(key).push({
          url: a.getAttribute('href'), title: a.textContent.trim(), note: dd,
          tags: (a.getAttribute('tags') || '').split(',').map(t => t.trim()).filter(Boolean),
          added: added ? added * 1000 : Date.now()
        });
      }
    }
  };
  const root = doc.querySelector('dl');
  if (root) walk(root, []);
  return groups;
}

function parseCSV(t, sep = ',') {
  const rows = []; let row = [], f = '', inQ = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (inQ) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else inQ = false; } else f += c; }
    else if (c === '"') inQ = true;
    else if (c === sep) { row.push(f); f = ''; }
    else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; }
    else if (c !== '\r') f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows;
}

// Any CSV or TSV with a URL column: Raindrop, Pocket, Instapaper, Notion, spreadsheets, or a plain list.
// Column names are matched loosely; without a header row the first URL-looking column is used.
const CSV_COLS = {
  url: ['url', 'link', 'href', 'address', 'uri', 'website', 'web address', 'page url'],
  title: ['title', 'name', 'page title', 'bookmark', 'label'],
  folder: ['folder', 'category', 'collection', 'group', 'list', 'section', 'path', 'parent'],
  tags: ['tags', 'tag', 'labels', 'keywords'],
  note: ['note', 'notes', 'description', 'excerpt', 'comment', 'summary'],
  created: ['created', 'created at', 'created_at', 'date', 'date added', 'added', 'time_added', 'timestamp']
};
const looksUrl = v => /^(https?:\/\/|www\.)\S+$/i.test((v || '').trim());
function groupsFromCSV(text) {
  text = text.replace(/^\uFEFF/, '');
  const first = text.split(/\r?\n/, 1)[0];
  const sep = ['\t', ';', ','].sort((a, b) => first.split(b).length - first.split(a).length)[0];
  const rows = parseCSV(text, sep).filter(r => r.some(c => c.trim()));
  const norm = x => x.trim().toLowerCase().replace(/[_-]+/g, ' ');
  let head = (rows[0] || []).map(norm);
  const find = names => head.findIndex(x => names.includes(x) || names.includes(x.replace(/ /g, '_')));
  let ci = Object.fromEntries(Object.entries(CSV_COLS).map(([k, names]) => [k, find(names)]));
  if (ci.url < 0 && rows[0]?.some(looksUrl)) {   // no header row
    const u = rows[0].findIndex(looksUrl);
    ci = { url: u, title: rows[0].findIndex((c, i) => i !== u && c.trim() && !looksUrl(c)), folder: -1, tags: -1, note: -1, created: -1 };
    head = null;
  }
  if (ci.url < 0) return new Map();
  const groups = new Map();
  const cell = (r, k) => (ci[k] > -1 && r[ci[k]] || '').trim();
  for (const r of head ? rows.slice(1) : rows) {
    const url = normalizeUrl(cell(r, 'url'));
    if (!url) continue;
    const key = cell(r, 'folder').replace(/\s*[/>]\s*/g, ' / ') || 'Unsorted';
    if (!groups.has(key)) groups.set(key, []);
    const raw = cell(r, 'created'), created = /^\d{9,10}$/.test(raw) ? +raw * 1000 : /^\d{12,13}$/.test(raw) ? +raw : Date.parse(raw);
    groups.get(key).push({
      url, title: cell(r, 'title'),
      tags: cell(r, 'tags').split(/[,;|]/).map(t => t.trim().replace(/^#/, '')).filter(Boolean),
      note: cell(r, 'note'),
      added: isNaN(created) ? Date.now() : created
    });
  }
  return groups;
}

$('fileIn').addEventListener('change', async e => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  const text = await f.text();
  const stem = f.name.replace(/\.[^.]+$/, '');
  const label = /raindrop/i.test(f.name) ? 'Raindrop' : stem.slice(0, 40) || 'Import';
  try {
    if (/\.json$/i.test(f.name)) {
      const data = JSON.parse(text);
      if (!Array.isArray(data.workspaces)) throw new Error('Not a TabOgt backup');
      if (!(await confirmBox('Replace everything with this backup?', 'Restore backup', true))) return;
      commit(() => { D = normalizeData(data); }, { undo: true, msg: 'Backup restored' });
    } else if (/\.(csv|tsv)$/i.test(f.name)) finishImport(label, groupsFromCSV(text));
    else if (/\.txt$/i.test(f.name)) finishImport(label, new Map([['', urlsFromText(text.replace(/\s+/g, ' ')).map(url => ({ url, title: '' }))]]));
    else finishImport(label, parseNetscape(text));
  } catch (err) {
    toast('Could not read that file: ' + err.message);
  }
  if (ui.panel === 'settings') renderPanel();
});

function download(name, text, type) {
  const a = h('a', { href: URL.createObjectURL(new Blob([text], { type })), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
const stamp = () => new Date().toISOString().slice(0, 10);
function exportJSON() {
  const { writer, ...clean } = D;
  download(`tabogt-backup-${stamp()}.json`, JSON.stringify(clean, null, 1), 'application/json');
}
function exportHTML() {
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  let out = '<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n<TITLE>Bookmarks</TITLE>\n<H1>Bookmarks</H1>\n<DL><p>\n';
  for (const w of D.workspaces) {
    out += `  <DT><H3>${esc(w.name)}</H3>\n  <DL><p>\n`;
    for (const s of w.sections) {
      out += `    <DT><H3>${esc(s.name)}</H3>\n    <DL><p>\n`;
      for (const i of s.items) {
        out += `      <DT><A HREF="${esc(i.url)}" ADD_DATE="${Math.floor(i.added / 1000)}"${i.tags.length ? ` TAGS="${esc(i.tags.join(','))}"` : ''}>${esc(i.title)}</A>\n`;
        if (i.note) out += `      <DD>${esc(i.note)}\n`;
      }
      out += '    </DL><p>\n';
    }
    out += '  </DL><p>\n';
  }
  if (D.library.length) {
    const byFolder = new Map();
    for (const i of D.library) { const f = i.folder || 'Unsorted'; if (!byFolder.has(f)) byFolder.set(f, []); byFolder.get(f).push(i); }
    out += '  <DT><H3>Library</H3>\n  <DL><p>\n';
    for (const [f, list] of byFolder) {
      out += `    <DT><H3>${esc(f)}</H3>\n    <DL><p>\n`;
      for (const i of list) out += `      <DT><A HREF="${esc(i.url)}" ADD_DATE="${Math.floor(i.added / 1000)}"${i.tags.length ? ` TAGS="${esc(i.tags.join(','))}"` : ''}>${esc(i.title)}</A>\n`;
      out += '    </DL><p>\n';
    }
    out += '  </DL><p>\n';
  }
  out += '</DL><p>\n';
  download(`tabogt-bookmarks-${stamp()}.html`, out, 'text/html');
}

/* ================= Global keys & paste ================= */
document.addEventListener('keydown', e => {
  const typing = e.target.matches('input, textarea, select, [contenteditable="true"]');
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); q.focus(); q.select(); return; }
  if (e.key === 'Escape') {
    if (!$('menu').hidden) closeMenu(true);
    else if (!$('modal').hidden) closeDialog();
    else if (ui.panel) closePanel();
    return;
  }
  if (typing || !$('modal').hidden) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && ui.undo) { e.preventDefault(); const u = ui.undo; ui.undo = null; u(); return; }
  if (e.altKey && /^[1-9]$/.test(e.key)) { const w = D.workspaces[+e.key - 1]; if (w) { e.preventDefault(); switchWs(w.id); } return; }
  if (e.key === '/') { e.preventDefault(); q.focus(); return; }
  if (!e.ctrlKey && !e.altKey && !e.metaKey && e.key.length === 1 && /\S/.test(e.key) && $('menu').hidden) q.focus();
});

document.addEventListener('paste', e => {
  if (e.target.matches('input, textarea, [contenteditable="true"]')) return;
  const urls = urlsFromText(e.clipboardData.getData('text/plain')).filter(savable);
  if (!urls.length) return;
  e.preventDefault();
  const ws = activeWs();
  const s = ws.sections.find(x => x.id === ui.hoverSec) || ws.sections[0] || newSection(ws, 'Inbox');
  addEntries(s, urls.map(url => ({ url, title: titleFromTabs(url) })));
});

/* ================= Sync & init ================= */
chrome.storage.onChanged.addListener((ch, area) => {
  if (area !== 'local') return;
  if (ch.data?.newValue && ch.data.newValue.writer !== WRITER) {
    D = normalizeData(ch.data.newValue);
    dropUndo();    // a snapshot taken before this write would silently revert it
    closeMenu();   // its actions point at objects from the replaced copy
    render();
    // Do not replace the notes box while someone is typing in it; unsaved text is re-applied by id on save.
    if (ui.panel === 'settings' || (ui.panel === 'notes' && !$('drawer').contains(document.activeElement))) renderPanel();
  }
  if (ch.wallpaper) { wallpaper = ch.wallpaper.newValue || null; applyWall(); }
  if (ch.syncState) showSyncState(ch.syncState.newValue);
  if (ch.sync && !!ch.sync.oldValue !== !!ch.sync.newValue && ui.panel === 'settings') renderPanel();
});
matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => { if (D.settings.theme === 'system') applySettings(); });

// Closing the tab inside a debounce window used to lose the last notes or settings change.
// Write straight away without the lock: the page may be gone before the lock is granted.
function flushPending() {
  const notes = flushNotes();
  if (notes || setT) { clearTimeout(setT); setT = null; write(D); }
}
addEventListener('pagehide', flushPending);
document.addEventListener('visibilitychange', () => { if (document.hidden) flushPending(); });

async function init() {
  const [d, w] = await Promise.all([load(), chrome.storage.local.get('wallpaper'), loadIconCache()]);
  D = d;
  wallpaper = w.wallpaper || null;
  render();
  setInterval(tick, 1000 * 15);
  (window.requestIdleCallback || setTimeout)(refreshTabs);
  chrome.runtime.sendMessage({ type: 'sync-open' }).catch(() => {});   // pull the other laptop's changes
}
init();
