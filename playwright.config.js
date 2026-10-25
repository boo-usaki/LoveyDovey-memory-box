// 伴侶記憶匣自動測試設定。說明見 TESTING.md。
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: { ...devices['Desktop Chrome'], screenshot: 'off', video: 'off', trace: 'off' },
});
