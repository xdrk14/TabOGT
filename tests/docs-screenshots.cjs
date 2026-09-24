// Renders the README screenshots into ../docs with demo bookmarks, in a throwaway browser profile.
// Run from tests/:  npm run docs
const { chromium } = require('@playwright/test');
const fs = require('fs'), os = require('os'), path = require('path');

const EXT = path.resolve(__dirname, '..');
const OUT = path.join(EXT, 'docs');
const BRAVE = path.join(process.env.LOCALAPPDATA || '', 'BraveSoftware/Brave-Browser/Application/brave.exe');
const BROWSER = process.env.TABOGT_BROWSER || (fs.existsSync(BRAVE) ? BRAVE : undefined);

let n = 0;
const id = () => 'd' + (++n).toString(36);
const it = (url, title) => ({ id: id(), url, title, tags: [], note: '', added: Date.now() - n * 60000 });
const sec = (name, color, items) => ({ id: id(), name, color, collapsed: false, items });
function demo(settings) {
  const personal = { id: id(), name: 'Personal', notes: '', sections: [
    sec('Daily', '#0A84FF', [it('https://mail.google.com/', 'Gmail'), it('https://calendar.google.com/', 'Calendar'), it('https://www.youtube.com/', 'YouTube'), it('https://open.spotify.com/', 'Spotify')]),
    sec('Build', '#30D158', [it('https://github.com/', 'GitHub'), it('https://vercel.com/', 'Vercel'), it('https://www.figma.com/', 'Figma'), it('https://linear.app/', 'Linear'), it('https://stackoverflow.com/', 'Stack Overflow')]),
    sec('Reading', '#FF9F0A', [it('https://news.ycombinator.com/', 'Hacker News'), it('https://www.theverge.com/', 'The Verge'), it('https://en.wikipedia.org/', 'Wikipedia')]),
    sec('Learning', '#BF5AF2', [it('https://developer.mozilla.org/', 'MDN Web Docs'), it('https://www.coursera.org/', 'Coursera'), it('https://www.khanacademy.org/', 'Khan Academy')])
  ] };
  const work = { id: id(), name: 'Work', notes: '', sections: [sec('Inbox', '#64D2FF', [it('https://www.notion.so/', 'Notion'), it('https://slack.com/', 'Slack')])] };
  return { v: 3, rev: 0, activeWs: personal.id, last: null, sessions: [], settings, workspaces: [personal, work],
    library: [it('https://arstechnica.com/', 'Ars Technica'), it('https://www.dribbble.com/', 'Dribbble')].map(x => ({ ...x, folder: 'Imported' })) };
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'tabogt-docs-')), {
    executablePath: BROWSER, channel: BROWSER ? undefined : 'chromium', headless: true, viewport: { width: 1440, height: 900 },
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`]
  });
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const url = `chrome-extension://${sw.url().split('/')[2]}/newtab.html`;
  // let first-run setup (starter bookmarks, menus) finish first, or it can overwrite the demo data
  await sw.evaluate(async () => { await tabogtTest.menusReady(); await new Promise(r => setTimeout(r, 500)); });
  const shot = async (file, settings, before) => {
    await sw.evaluate(d => chrome.storage.local.set({ data: d }), demo(settings));
    const p = await ctx.newPage();
    await p.goto(url);
    await p.waitForSelector('.sec');
    if (before) await before(p);
    await p.waitForTimeout(900);   // icons, drawer animation
    await p.screenshot({ path: path.join(OUT, file) });
    await p.close();
    console.log('wrote docs/' + file);
  };
  const frosted = { layout: 'centered', view: 'list', material: 'frosted', glow: 0.35 };
  await shot('centered-dark.png', { ...frosted, theme: 'black', wallpaper: 'nebula' });
  await shot('centered-light.png', { ...frosted, theme: 'light', wallpaper: 'aurora', accent: '#30D158' });
  await shot('board.png', { layout: 'board', view: 'grid', theme: 'black', wallpaper: 'none' });
  await shot('customise.png', { ...frosted, theme: 'black', wallpaper: 'ocean' }, p => p.click('.tool[data-panel="settings"]'));
  await shot('library.png', { ...frosted, theme: 'dark', wallpaper: 'midnight' }, p => p.click('.tool[data-panel="library"]'));
  await ctx.close();
})();
