// Run from this folder:  npx playwright test            (headless)
//                        set HEADED=1 && npx playwright test   (watch it)
// Browser: your installed Brave by default; override with TABOGT_BROWSER=<path to chrome.exe/brave.exe>.
module.exports = {
  testDir: '.',
  testMatch: /.*\.spec\.js/,
  timeout: 120000,
  workers: 1,
  reporter: [['list']],
  expect: { timeout: 8000 }
};
