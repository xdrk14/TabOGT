// Renders icons/icon.svg (48, 128) and icons/icon-small.svg (16, 32) to the PNGs the manifest uses.
// Run from tests/:  node make-icons.cjs
const { chromium } = require('@playwright/test');
const fs = require('fs'), path = require('path');
const BRAVE = path.join(process.env.LOCALAPPDATA || '', 'BraveSoftware/Brave-Browser/Application/brave.exe');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.TABOGT_BROWSER || (fs.existsSync(BRAVE) ? BRAVE : undefined) });
  const p = await b.newPage();
  const dir = path.resolve(__dirname, '../icons');
  for (const [size, file] of [[16, 'icon-small.svg'], [32, 'icon-small.svg'], [48, 'icon.svg'], [128, 'icon.svg']]) {
    const svg = fs.readFileSync(path.join(dir, file), 'utf8').replace('<svg ', `<svg width="${size}" height="${size}" `);
    await p.setViewportSize({ width: size, height: size });
    await p.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block}</style>${svg}`);
    await p.screenshot({ path: path.join(dir, `${size}.png`), omitBackground: true });
  }
  await b.close();
})();
