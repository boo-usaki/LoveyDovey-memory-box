// 伴侶記憶匣自動測試設定。說明見 TESTING.md。
const { defineConfig, devices } = require('@playwright/test');
const fs = require('fs');

const localEdge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const browserOverride = process.platform === 'win32' && fs.existsSync(localEdge) ? { launchOptions: { executablePath: localEdge } } : {};

module.exports = defineConfig({
  testDir: './tests',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: { ...devices['Desktop Chrome'], ...browserOverride, screenshot: 'off', video: 'off', trace: 'off' },
});
