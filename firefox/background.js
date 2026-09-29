import { load, update, addItem, sectionPaths, defaultSection, savable, host, LIBRARY } from './store.js';
import { syncOnce } from './sync.js';

let chain = Promise.resolve();
let timer = null;

// Menu items are created with a callback that checks runtime.lastError. Without it, Brave logged
// "Unchecked runtime.lastError: Cannot create item with duplicate id" whenever two rebuilds overlapped
// (install/startup plus a data change, or a restarted service worker). A duplicate is now updated in place,
// so its title still follows renamed sections, and nothing is logged.
function menuItem(props) {
  chrome.contextMenus.create(props, () => {
    if (!chrome.runtime.lastError) return;
    const { id, type, ...rest } = props;
    chrome.contextMenus.update(id, rest, () => void chrome.runtime.lastError);
  });
}

function rebuildMenus() {
  chain = chain.then(async () => {
    await chrome.contextMenus.removeAll();
    const d = await load();
    const paths = sectionPaths(d);
    for (const k of ['page', 'link']) {
      menuItem({ id: `root-${k}`, title: k === 'page' ? 'Save page to TabOgt' : 'Save link to TabOgt', contexts: [k] });
      menuItem({ id: `${k}|${LIBRARY}`, parentId: `root-${k}`, title: 'Library (search only)', contexts: [k] });
      menuItem({ id: `sep-${k}-lib`, parentId: `root-${k}`, type: 'separator', contexts: [k] });
      let lastWs = null;
      for (const p of paths) {
        if (lastWs && lastWs !== p.w.id) menuItem({ id: `sep-${k}-${p.w.id}`, parentId: `root-${k}`, type: 'separator', contexts: [k] });
        lastWs = p.w.id;
        menuItem({ id: `${k}|${p.s.id}`, parentId: `root-${k}`, title: p.label, contexts: [k] });
      }
    }
    // let the queued creates finish before the next rebuild's removeAll runs
    await new Promise(res => chrome.contextMenus.update(`root-link`, {}, () => { void chrome.runtime.lastError; res(); }));
  }).catch(err => console.warn('Menu rebuild failed', err));
}

async function flash(text, color) {
  try {
    await chrome.action.setBadgeBackgroundColor({ color });
    await chrome.action.setBadgeText({ text });
    setTimeout(() => chrome.action.setBadgeText({ text: '' }), 1600);
  } catch { /* ignore */ }
}

// secId null means the last used section. The write reads fresh data under the shared lock,
// so rapid menu clicks or quick-saves cannot overwrite each other or an open dashboard.
async function saveTo(secId, url, title) {
  if (!savable(url)) return flash('×', '#c0504d');
  let ok = false;
  await update(d => { ok = !!addItem(d, secId || defaultSection(d).id, { url, title }); return ok; });
  flash(ok ? '✓' : '×', ok ? '#3a8f6b' : '#c0504d');
}

chrome.runtime.onInstalled.addListener(() => { rebuildMenus(); startPolling(); });
chrome.runtime.onStartup.addListener(() => { rebuildMenus(); startPolling(); requestSync('startup'); });

/* ---------------- GitHub sync scheduling ---------------- */
// One sync at a time. Local edits are batched for a few seconds; new tabs pull (at most every 15 s);
// an alarm pulls every 5 minutes so a laptop left open still picks up the other one's changes.
let syncT = null, running = null, rerun = null, lastOpen = 0;
function requestSync(reason, delay = 0) {
  clearTimeout(syncT);
  syncT = setTimeout(async () => {
    if (running) { rerun = reason; return; }
    running = syncOnce(reason);
    await running;
    running = null;
    if (rerun) { const r = rerun; rerun = null; requestSync(r); }
  }, delay);
}
async function syncNow() {
  clearTimeout(syncT);
  while (running) await running;
  running = syncOnce('manual');
  const res = await running;
  running = null;
  return res;
}
function startPolling() { chrome.alarms.create('tabogt-sync', { periodInMinutes: 5 }); }
chrome.alarms.onAlarm.addListener(a => { if (a.name === 'tabogt-sync') requestSync('poll'); });

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.type === 'sync-now') { syncNow().then(reply); return true; }
  if (msg?.type === 'sync-open' && Date.now() - lastOpen > 15000) { lastOpen = Date.now(); requestSync('open'); }
});

chrome.storage.onChanged.addListener((ch, area) => {
  if (area !== 'local') return;
  if (ch.data) requestSync('local', 3000);
  const a = ch.sync?.oldValue, b = ch.sync?.newValue;
  // (re)connected: new repo or token, or a first-sync choice waiting to be applied
  if (b && (b.firstMode || a?.repo !== b.repo || a?.token !== b.token)) { startPolling(); requestSync('connect'); }
  if (ch.sync && !b) chrome.alarms.clear('tabogt-sync');
});

chrome.storage.onChanged.addListener((ch, area) => {
  if (area !== 'local' || !ch.data) return;
  const a = ch.data.oldValue, b = ch.data.newValue;
  const sig = x => x ? x.workspaces.map(w => w.name + ':' + w.sections.map(s => s.id + s.name).join(',')).join('|') : '';
  if (sig(a) === sig(b)) return;
  clearTimeout(timer);
  timer = setTimeout(rebuildMenus, 300);
});

function onMenuClick(info, tab) {
  const [kind, secId] = String(info.menuItemId).split('|');
  if (!secId) return;
  if (kind === 'link') {
    const title = (info.selectionText || '').trim() || host(info.linkUrl);
    return saveTo(secId, info.linkUrl, title);
  } else if (tab) {
    return saveTo(secId, tab.url, tab.title);
  }
}

async function onCommand(cmd) {
  if (cmd !== 'quick-save') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) return saveTo(null, tab.url, tab.title);
}

chrome.contextMenus.onClicked.addListener(onMenuClick);
chrome.commands.onCommand.addListener(onCommand);

// Lets tests/smoke.spec.js drive the real handlers (context menu clicks and shortcuts cannot be automated).
globalThis.tabogtTest = { onMenuClick, onCommand, rebuildMenus, menusReady: () => chain, syncNow };
