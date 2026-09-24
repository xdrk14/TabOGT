// Shared data layer for TabOgt (new tab, popup, background)
export const WRITER = Math.random().toString(36).slice(2);
export const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);

// iOS system colours (dark variants): blue, green, orange, pink, purple, cyan, yellow, grey
export const COLORS = ['#0A84FF', '#30D158', '#FF9F0A', '#FF375F', '#BF5AF2', '#64D2FF', '#FFD60A', '#8E8E93'];
const OLD_COLORS = ['#8ab4ff', '#7ee0c3', '#f5b971', '#f28b9c', '#c3a6ff', '#9fd86b', '#6fd3f0', '#e9e4d8'];

// Pseudo-section id for the Library: bookmarks that are stored and searchable but not shown as tiles.
export const LIBRARY = 'library';

export const DEFAULT_SETTINGS = {
  theme: 'black', accent: '#0A84FF', font: 'system', material: 'solid', layout: 'centered',
  glass: 0.12, blur: 24, radius: 16, cardOpacity: 0.6, density: 1, glow: 0.3,
  view: 'list', tile: 56, sectionWidth: 270, gap: 16,
  showTitles: true, showCounts: true,
  showClock: true, clock24: false, greeting: '',
  openIn: 'same', iconSource: 'brave',
  wallpaper: 'none', wallColor: '#000000', wallDim: 0.2, wallBlur: 0
};

export function seed() {
  const now = Date.now();
  const mk = (url, title) => ({ id: uid(), url, title, tags: [], note: '', added: now });
  const d = {
    v: 3, rev: 0, activeWs: null, last: null, sessions: [], library: [], settings: { ...DEFAULT_SETTINGS },
    workspaces: [
      { id: uid(), name: 'Personal', notes: '', sections: [
        { id: uid(), name: 'Inbox', color: COLORS[0], collapsed: false, items: [] },
        { id: uid(), name: 'Daily', color: COLORS[1], collapsed: false, items: [
          mk('https://mail.google.com/', 'Gmail'),
          mk('https://www.youtube.com/', 'YouTube'),
          mk('https://search.brave.com/', 'Brave Search')
        ] }
      ] },
      { id: uid(), name: 'Work', notes: '', sections: [
        { id: uid(), name: 'Inbox', color: COLORS[2], collapsed: false, items: [] }
      ] }
    ]
  };
  d.activeWs = d.workspaces[0].id;
  return d;
}

const isColor = c => typeof c === 'string' && /^#[0-9a-f]{3,8}$/i.test(c);
const arr = x => Array.isArray(x) ? x.filter(v => v && typeof v === 'object') : [];

function cleanItems(list) {
  // Drop entries a hand-edited or foreign backup may carry: no URL, or a scheme we never store (javascript:, data:).
  const out = arr(list).filter(i => typeof i.url === 'string' && normalizeUrl(i.url));
  for (const i of out) {
    i.id ||= uid(); i.note = typeof i.note === 'string' ? i.note : ''; i.title = String(i.title || host(i.url)); i.added ||= Date.now();
    i.tags = Array.isArray(i.tags) ? i.tags.map(String) : typeof i.tags === 'string' ? i.tags.split(',').map(t => t.trim()).filter(Boolean) : [];
  }
  return out;
}

// 1.0.x -> 1.1: move untouched defaults to the new black / iOS look. Choices the user made are kept.
function migrate(d) {
  if ((d.v || 1) >= 3) return;
  if ((d.v || 1) >= 2) return migrate3(d);
  const s = d.settings || {};
  if (!s.theme || s.theme === 'dark') s.theme = 'black';
  if (!s.accent || s.accent === '#8ab4ff') s.accent = '#0A84FF';
  if (!s.wallpaper || s.wallpaper === 'aurora') s.wallpaper = 'none';
  if (!s.font || s.font === 'modern') s.font = 'system';
  if (s.radius === 18) s.radius = 16;
  if (s.tile === 60) s.tile = 56;
  for (const w of d.workspaces || []) for (const x of w.sections || []) {
    const k = OLD_COLORS.indexOf(String(x.color).toLowerCase());
    if (k > -1) x.color = COLORS[k];
  }
  d.settings = s;
  d.v = 2;
  migrate3(d);
}

// 1.3 -> 1.4: the Tabisto-style centered layout (frosted list cards around a centered clock) becomes the default.
// "Board" (the previous layout) stays one tap away in Customise > Appearance > Layout.
function migrate3(d) {
  const s = d.settings ||= {};
  s.layout ||= 'centered';
  if (s.layout === 'centered' && (!s.view || s.view === 'grid')) s.view = 'list';
  if (!s.sectionWidth || s.sectionWidth === 300) s.sectionWidth = 270;
  if (s.wallpaper && s.wallpaper !== 'none') s.material = 'frosted';
  d.v = 3;
}

export function normalizeData(d) {
  migrate(d);
  d.settings = { ...DEFAULT_SETTINGS, ...(d.settings || {}) };
  for (const k of ['accent', 'wallColor']) if (!isColor(d.settings[k])) d.settings[k] = DEFAULT_SETTINGS[k];
  d.sessions = arr(d.sessions).filter(s => Array.isArray(s.tabs));
  d.library = cleanItems(d.library);
  for (const i of d.library) i.folder = typeof i.folder === 'string' ? i.folder : '';
  d.workspaces = arr(d.workspaces);
  if (!d.workspaces.length) d.workspaces.push({ id: uid(), name: 'Personal', notes: '', sections: [] });
  for (const w of d.workspaces) {
    w.id ||= uid(); w.name ||= 'Workspace'; w.notes ??= ''; w.sections = arr(w.sections);
    for (const s of w.sections) {
      s.id ||= uid(); s.name ||= 'Section'; if (!isColor(s.color)) s.color = COLORS[0];
      s.items = cleanItems(s.items);
    }
  }
  if (!d.workspaces.find(w => w.id === d.activeWs)) d.activeWs = d.workspaces[0].id;
  return d;
}

export async function load() {
  const { data } = await chrome.storage.local.get('data');
  if (!data) { const d = seed(); await chrome.storage.local.set({ data: d }); return d; }
  return normalizeData(data);
}

// Unlocked write. Only for unload flushes, where waiting for the lock could outlive the page.
export async function write(d) {
  d.rev = (d.rev || 0) + 1;
  d.writer = WRITER;
  await chrome.storage.local.set({ data: d });
}

// Every writer (dashboards, popup, background) goes through this lock, so writes never interleave.
const locked = fn => navigator.locks ? navigator.locks.request('tabogt-data', fn) : fn();

export function save(d) { return locked(() => write(d)); }

// Read-modify-write on a fresh copy. Use this from short-lived contexts (popup, background)
// so a stale in-memory copy never overwrites changes made elsewhere. Return false from fn to skip saving.
export function update(fn) {
  return locked(async () => {
    const d = await load();
    if (await fn(d) !== false) await write(d);
    return d;
  });
}

export function normalizeUrl(u) {
  u = (u || '').trim();
  if (!u) return '';
  if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) {
    if (/^[^\s/]+\.[^\s]{2,}/.test(u) || /^localhost(:\d+)?/.test(u)) u = 'https://' + u;
    else return '';
  }
  try { const x = new URL(u); return /^(https?|ftp|file|chrome|brave|about):$/.test(x.protocol) ? x.href : ''; }
  catch { return ''; }
}

export function host(u) {
  try { return new URL(u).hostname.replace(/^www\./, '') || u; } catch { return u || ''; }
}

let favBase = null;
export function favicon(url, size = 64, source = 'brave') {
  if (source === 'online') return `https://www.google.com/s2/favicons?sz=${size}&domain_url=${encodeURIComponent(url)}`;
  favBase ||= chrome.runtime.getURL('/_favicon/');   // called once per tile per render; skip the URL object
  return `${favBase}?pageUrl=${encodeURIComponent(url)}&size=${size}`;
}

// Comparison key for duplicate detection: ignores scheme, www., trailing slash and #hash.
export const urlKey = u => (u || '').replace(/#.*$/, '').replace(/\/$/, '').replace(/^https?:\/\/(www\.)?/, '');

// Every place a URL is saved, board and Library. Library hits have w = null.
export function locate(d, url) {
  const n = urlKey(url), out = [];
  for (const w of d.workspaces) for (const s of w.sections) for (const i of s.items)
    if (urlKey(i.url) === n) out.push({ w, s, i });
  for (const i of d.library || []) if (urlKey(i.url) === n) out.push({ w: null, s: { id: LIBRARY, name: 'Library' }, i });
  return out;
}
export const placeLabel = hit => hit.w ? `${hit.w.name} › ${hit.s.name}` : 'Library' + (hit.i?.folder ? ` › ${hit.i.folder}` : '');

export function findSection(d, secId) {
  for (const w of d.workspaces) for (const s of w.sections) if (s.id === secId) return { w, s };
  return null;
}

export function sectionPaths(d) {
  return d.workspaces.flatMap(w => w.sections.map(s => ({ w, s, label: `${w.name} › ${s.name}` })));
}

export function makeItem({ url, title, tags = [], note = '', added }) {
  return { id: uid(), url, title: (title || '').trim() || host(url), tags, note, added: added || Date.now() };
}

export function addItem(d, secId, data, index) {
  if (secId === LIBRARY) {
    const item = { ...makeItem(data), folder: data.folder || '' };
    (d.library ||= []).push(item);
    return item;
  }
  const f = findSection(d, secId);
  if (!f) return null;
  const item = makeItem(data);
  if (index == null || index > f.s.items.length) f.s.items.push(item);
  else f.s.items.splice(index, 0, item);
  d.last = secId;
  return item;
}

export function defaultSection(d) {
  const f = d.last && findSection(d, d.last);
  if (f) return f.s;
  const w = d.workspaces.find(x => x.id === d.activeWs) || d.workspaces[0];
  if (!w.sections.length) w.sections.push({ id: uid(), name: 'Inbox', color: COLORS[0], collapsed: false, items: [] });
  return w.sections[0];
}

// Accent colours can be anything (White, Yellow, a custom pick), so derive readable companions:
// --on-accent: text on an accent-filled button: white while it reaches 3:1 (bold button text, as iOS does
//   on blue, red, pink, purple), otherwise black (White, Yellow, Green, Mint, Cyan, Orange...);
// --accent-text: the accent used as text or icon colour, nudged darker (light theme) or lighter (dark themes)
//   only when it would fall under 3:1 against the surface it sits on, so normal accents keep their exact colour.
function lum(hex) {
  let x = String(hex).replace('#', '');
  if (x.length < 6) x = x.slice(0, 3).split('').map(c => c + c).join('');
  return [0, 2, 4].map(i => parseInt(x.slice(i, i + 2), 16) / 255)
    .map(c => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
    .reduce((a, c, i) => a + c * [0.2126, 0.7152, 0.0722][i], 0);
}
const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
const toHex = rgb => '#' + rgb.map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
function mixHex(hex, to, t) {
  const p = h => { let x = h.replace('#', ''); if (x.length < 6) x = x.slice(0, 3).split('').map(c => c + c).join(''); return [0, 2, 4].map(i => parseInt(x.slice(i, i + 2), 16)); };
  const a = p(hex), b = p(to);
  return toHex(a.map((v, i) => v + (b[i] - v) * t));
}
export function accentVars(accent, light) {
  if (!/^#[0-9a-f]{3,8}$/i.test(accent || '')) accent = DEFAULT_SETTINGS.accent;
  const L = lum(accent);
  const surface = light ? 1 : lum('#2c2c2e');   // white cards / the lightest dark surface
  let text = accent.slice(0, 7);
  for (let t = 0.1; ratio(lum(text), surface) < 3 && t <= 1.001; t += 0.1) text = mixHex(accent, light ? '#000000' : '#ffffff', t);
  return { '--on-accent': ratio(L, 1) >= 3 ? '#fff' : '#000', '--accent-text': text };
}

export const savable = u => /^(https?|ftp|file):/i.test(u || '');
