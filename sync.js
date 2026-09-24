// Sync with a private GitHub repository: TabOgt keeps one JSON file (default tabogt-data.json) in the repo.
// Runs in the background service worker. Config lives in chrome.storage.local "sync" (repo, token, path),
// never inside the data itself, so the token is not in backups or in the synced file.
//
// Merging is three-way: "base" is the copy both sides agreed on at the last sync. Comparing this laptop's
// copy and the remote copy against it tells an edit from a delete from an add, per workspace, section,
// bookmark, Library entry, session and setting, so changes made on two laptops are combined, not overwritten.
import { update, normalizeData, urlKey } from './store.js';

const FILE = 'tabogt-data.json';
const API = 'https://api.github.com';

/* ---------------- merge ---------------- */

// Stable JSON (sorted keys) so equal data always compares equal.
export const canon = x => JSON.stringify(x, (k, v) => v && typeof v === 'object' && !Array.isArray(v)
  ? Object.fromEntries(Object.keys(v).sort().map(key => [key, v[key]])) : v);

// Only these parts of the data travel. activeWs, last, rev and writer stay per device.
export const syncPart = d => structuredClone({ v: 3, workspaces: d.workspaces, library: d.library || [], sessions: d.sessions || [], settings: d.settings });

const CHILD = { ws: ['sections', 'sec'], sec: ['items', 'item'] };
// The same thing created on both laptops before they synced (e.g. two "Personal" workspaces, or the same link) is joined.
const MATCH = {
  ws: x => String(x.name).toLowerCase(),
  sec: x => String(x.name).toLowerCase(),
  item: x => urlKey(x.url),
  lib: x => urlKey(x.url)
};

const pick = (b, l, r) => canon(l) === canon(b) ? (r === undefined ? l : r) : (l === undefined ? r : l);

function mergeEl(kind, b, l, r) {
  const out = {};
  for (const k of new Set([...Object.keys(l), ...Object.keys(r)])) {
    if (CHILD[kind]?.[0] === k) out[k] = mergeList(b?.[k], l[k], r[k], CHILD[kind][1]);
    else out[k] = pick(b?.[k], l[k], r[k]);   // this laptop's edit wins only if both changed the same field
  }
  return out;
}

const idsOf = a => a.map(x => x.id);
function orderChanged(b, s) {
  const inS = new Set(idsOf(s)), common = idsOf(b).filter(i => inS.has(i)), inB = new Set(common);
  return common.join('\u0001') !== idsOf(s).filter(i => inB.has(i)).join('\u0001');
}

export function mergeList(b, l, r, kind) {
  b ||= []; l ||= []; r ||= [];
  const B = new Map(b.map(x => [x.id, x]));
  // Keep this laptop's order unless only the other laptop reordered.
  const remoteFirst = orderChanged(b, r) && !orderChanged(b, l);
  const [P, S] = remoteFirst ? [r, l] : [l, r];
  const Pm = new Map(P.map(x => [x.id, x])), Sm = new Map(S.map(x => [x.id, x]));
  const both = (p, s) => remoteFirst ? [s, p] : [p, s];   // -> [local, remote]
  const out = [];
  for (const x of P) {
    const bx = B.get(x.id), sx = Sm.get(x.id);
    if (sx) out.push(mergeEl(kind, bx, ...both(x, sx)));
    else if (!bx || canon(x) !== canon(bx)) out.push(x);   // new here, or edited here after the other side deleted it
    // else: deleted on the other side and untouched here -> gone
  }
  let prev = null;
  for (const x of S) {
    if (Pm.has(x.id)) { prev = x.id; continue; }
    const bx = B.get(x.id);
    if (bx && canon(x) === canon(bx)) continue;             // deleted on the primary side, untouched here -> gone
    if (!bx && MATCH[kind]) {
      const key = MATCH[kind](x), at = out.findIndex(o => !B.has(o.id) && MATCH[kind](o) === key);
      if (at > -1) { out[at] = mergeEl(kind, null, ...both(out[at], x)); prev = out[at].id; continue; }
    }
    const at = prev ? out.findIndex(o => o.id === prev) + 1 : 0;
    out.splice(at, 0, x);
    prev = x.id;
  }
  return out;
}

export function mergeDocs(base, local, remote) {
  return {
    v: 3,
    workspaces: mergeList(base?.workspaces, local.workspaces, remote.workspaces, 'ws'),
    library: mergeList(base?.library, local.library, remote.library, 'lib'),
    sessions: mergeList(base?.sessions, local.sessions, remote.sessions, 'sess'),
    settings: mergeEl('settings', base?.settings || null, local.settings || {}, remote.settings || {})
  };
}

/* ---------------- GitHub ---------------- */

const enc = p => p.split('/').map(encodeURIComponent).join('/');
function ghFetch(cfg, url, opts = {}) {
  return fetch(url, {
    cache: 'no-store', ...opts,
    headers: { Authorization: `Bearer ${cfg.token}`, 'X-GitHub-Api-Version': '2022-11-28', Accept: 'application/vnd.github+json', ...(opts.headers || {}) }
  });
}
const contentsUrl = cfg => `${cfg.api || API}/repos/${cfg.repo}/contents/${enc(cfg.path || FILE)}`;

export class SyncError extends Error {
  constructor(msg, code) { super(msg); this.code = code; }
}
async function fail(r) {
  let detail = '';
  try { detail = (await r.json()).message || ''; } catch { /* not JSON */ }
  if (r.status === 401) throw new SyncError('GitHub rejected the token. It may have expired: create a new one and reconnect.', 'auth');
  if (r.status === 403) throw new SyncError(/rate limit/i.test(detail) ? 'GitHub rate limit reached. Sync will retry later.' : 'The token cannot write to this repository. Give it "Contents: Read and write" access to it.', 'auth');
  if (r.status === 404) throw new SyncError('Repository not found. Check the name (owner/repo) and that the token can access it.', 'repo');
  throw new SyncError(`GitHub error ${r.status}${detail ? ': ' + detail : ''}`, 'http');
}

// Checks repo access before saving the settings.
export async function checkRepo(cfg) {
  const r = await ghFetch(cfg, `${cfg.api || API}/repos/${cfg.repo}`);
  if (!r.ok) await fail(r);
  const j = await r.json();
  return { private: !!j.private, name: j.full_name };
}

const fromB64 = s => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\s/g, '')), c => c.charCodeAt(0)));
function toB64(s) {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

// -> null if the file does not exist yet, else { sha, doc }
export async function readRemote(cfg) {
  const r = await ghFetch(cfg, contentsUrl(cfg));
  if (r.status === 404) {
    await checkRepo(cfg);   // distinguishes "no file yet" from "no repo / no access"
    return null;
  }
  if (!r.ok) await fail(r);
  const meta = await r.json();
  let text;
  if (meta.content && meta.encoding === 'base64') text = fromB64(meta.content);
  else {   // files over 1 MB come without inline content
    const raw = await ghFetch(cfg, contentsUrl(cfg), { headers: { Accept: 'application/vnd.github.raw+json' } });
    if (!raw.ok) await fail(raw);
    text = await raw.text();
  }
  let doc;
  try { doc = JSON.parse(text); } catch { throw new SyncError(`${cfg.path || FILE} in the repository is not valid JSON.`, 'data'); }
  if (!Array.isArray(doc.workspaces)) throw new SyncError(`${cfg.path || FILE} in the repository is not TabOgt data.`, 'data');
  return { sha: meta.sha, doc: syncPart(normalizeData(doc)) };
}

async function writeRemote(cfg, doc, sha) {
  const body = { message: `TabOgt sync (${new Date().toISOString().slice(0, 16).replace('T', ' ')})`, content: toB64(JSON.stringify(doc, null, 1)) };
  if (sha) body.sha = sha;
  const r = await ghFetch(cfg, contentsUrl(cfg), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (r.status === 409 || r.status === 422) return null;   // someone else wrote first: caller re-reads and merges again
  if (!r.ok) await fail(r);
  return (await r.json()).content.sha;
}

/* ---------------- one sync round ---------------- */

const setState = s => chrome.storage.local.set({ syncState: { ...s, at: Date.now() } });
let baseCanon = null;   // canon() of the last agreed copy, cached so local no-op triggers skip the network

// reason 'local' = triggered by a local change: skipped when nothing differs from the last sync.
export async function syncOnce(reason = 'manual') {
  const { sync: cfg, syncBase } = await chrome.storage.local.get(['sync', 'syncBase']);
  if (!cfg?.repo || !cfg?.token) return { status: 'off' };
  if (reason === 'local' && baseCanon && !cfg.firstMode) {
    const { data } = await chrome.storage.local.get('data');
    if (data && canon(syncPart(data)) === baseCanon) return { status: 'ok', skipped: true };
  }
  await setState({ status: 'syncing', repo: cfg.repo });
  try {
    for (let attempt = 0; attempt < 4; attempt++) {
      const remote = await readRemote(cfg);
      const base = cfg.firstMode === 'merge' ? null : syncBase || null;
      let merged;
      await update(d => {
        const local = syncPart(d);
        merged = !remote ? local
          : cfg.firstMode === 'replace' ? remote.doc
          : mergeDocs(base, local, remote.doc);
        if (canon(merged) === canon(local)) return false;
        const active = d.activeWs;
        Object.assign(d, structuredClone(merged));
        normalizeData(d);
        if (d.workspaces.some(w => w.id === active)) d.activeWs = active;
      });
      let sha = remote?.sha;
      if (!remote || canon(merged) !== canon(remote.doc)) {
        sha = await writeRemote(cfg, merged, remote?.sha);
        if (!sha) continue;   // lost a race with the other laptop: read again and re-merge
      }
      baseCanon = canon(merged);
      const next = { ...cfg, sha };
      delete next.firstMode;
      await chrome.storage.local.set({ sync: next, syncBase: merged });
      await setState({ status: 'ok', repo: cfg.repo, last: Date.now() });
      return { status: 'ok' };
    }
    throw new SyncError('The other laptop kept writing at the same moment. Will retry shortly.', 'busy');
  } catch (e) {
    await setState({ status: 'error', repo: cfg.repo, error: e.message || String(e), code: e.code || 'net' });
    return { status: 'error', error: e.message };
  }
}
