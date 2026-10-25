// 伴侶記憶匣自動測試：直接開啟 repo 裡的 index.html，模擬使用者與 agent 的操作。
// 執行方式見 TESTING.md。測試不會連到外部服務，也不需要帳號或金鑰。
const { test, expect } = require('@playwright/test');
const path = require('path');
const { pathToFileURL } = require('url');

const PAGE = pathToFileURL(path.resolve(__dirname, '..', 'index.html')).href;
const OFFICIAL = 'https://boo-usaki.github.io/LoveyDovey-memory-box/';
const OLD_SYNC_KEY = 'companion-memory-shelf.sync';
const BACKUP_PASSWORD = '只給自己的密碼123';

const MEM = (from, title) => ({
  companion: '王小明', rounds: `${from}-${from + 9}`, title,
  fields: { '地點': '家', '場景概要': '概要' + title, '關鍵詞': ['詞'], '關鍵對話': '王小明：「嗨」', '情感變化及影響': '平穩', '{伴侶}覺得重要的事': '記得' },
});
const EV = (kw, date, len = 2) => ({
  category: 'FIR', date, keywords: kw,
  fields: { '時間': date.replace(/-/g, '/') + ' 晚上', '地點': '家裡', '細節': ['細節句子。'.repeat(len)] },
});
const realMemories = page => page.evaluate(() => state.memories.filter(m => !m.example).length);

/* 開一台「裝置」：獨立的瀏覽器資料、剪貼簿權限、收集頁面錯誤 */
async function openDevice(browser, { viewport = { width: 1280, height: 1000 }, mobile = false, init } = {}) {
  const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile });
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const page = await context.newPage();
  page.errors = []; page.on('pageerror', e => page.errors.push(e.message));
  if (init) await page.addInitScript(init);
  await page.goto(PAGE);
  await page.waitForTimeout(300);
  return { context, page };
}

test.describe('記憶', () => {
  test('agent 匯入、重複匯入會更新、貼上回覆、標記已轉移', async ({ browser }) => {
    const { context, page } = await openDevice(browser);
    const r = await page.evaluate(list => { memoryShelf.addCompanion('王小明', '張小美'); return memoryShelf.importMemories(JSON.stringify(list), '王小明'); }, [MEM(1, '雨夜'), MEM(11, '晴天')]);
    expect(r.ok).toBe(true);
    expect(r.added).toBe(2);
    expect(await page.evaluate(() => memoryShelf.list()[0].lastRound)).toBe(20);

    await page.evaluate(m => memoryShelf.importMemories(JSON.stringify([m]), '王小明'), MEM(11, '晴天改'));
    const titles = await page.evaluate(() => state.memories.filter(m => !m.example).map(m => m.title).sort());
    expect(titles).toEqual(['晴天改', '雨夜']);

    await page.click('#importHere');
    await page.fill('#importText', JSON.stringify([MEM(21, '貼上的')]));
    await page.click('#doImport');
    await expect.poll(() => realMemories(page)).toBe(3);

    await page.evaluate(() => { closeSheets(); state.current = '王小明'; state.tab = 'memory'; state.view = 'todo'; render(); });
    await page.locator('#cards button', { hasText: '已轉移' }).first().click();
    await expect.poll(() => page.evaluate(() => state.memories.filter(m => m.transferred).length)).toBe(1);
    expect(page.errors).toEqual([]);
    await context.close();
  });
});

test.describe('事件', () => {
  test('自動編號、日期進度、開新欄與改短', async ({ browser }) => {
    const { context, page } = await openDevice(browser);
    await page.evaluate(() => memoryShelf.addCompanion('王小明', '張小美'));
    const codes = () => page.evaluate(() => memoryShelf.events('王小明', 'FIR').flatMap(s => s.items.map(i => i.code)));

    let r = await page.evaluate(evs => memoryShelf.importEvents(JSON.stringify(evs), '王小明', 'FIR'), [EV('一', '2026-02-01'), EV('二', '2026-02-02'), EV('三', '2026-02-03')]);
    expect(r.ok).toBe(true);
    expect(await codes()).toEqual(['FIR-01-01', 'FIR-01-02', 'FIR-01-03']);
    expect(await page.evaluate(() => evRec('王小明', 'FIR').from)).toBe('2026-02-04');

    // 一欄放不下：先停下來問，選「開新欄」後接到 [FIR-02]
    r = await page.evaluate(evs => memoryShelf.importEvents(JSON.stringify(evs), '王小明', 'FIR'),
      ['長一', '長二', '長三', '長四', '長五'].map((kw, i) => EV(kw, `2026-02-0${5 + i}`, 80)));
    expect(r.pending).toBeTruthy();
    expect(r.pending.canOpenNew).toBe(true);
    await expect(page.locator('#evPendingBar')).toBeVisible();
    await expect(page.locator('#evPendingBar')).toContainText('在等妳決定');
    await expect(page.locator('.card.panel.overflow')).toBeVisible();
    await page.waitForTimeout(2200); // 短暫提示消失後，處理提醒仍必須留著
    await expect(page.locator('#evPendingBar')).toBeVisible();
    r = await page.evaluate(() => memoryShelf.resolveEventOverflow('new'));
    expect(r.ok).toBe(true);
    await expect(page.locator('#evPendingBar')).toBeHidden();
    expect((await codes()).some(c => c.startsWith('FIR-02-01'))).toBe(true);

    // 單則超過上限：只能改短
    r = await page.evaluate(ev => memoryShelf.importEvents(JSON.stringify([ev]), '王小明', 'FIR'), EV('超長', '2026-02-20', 120));
    expect(r.pending.canOpenNew).toBe(false);
    r = await page.evaluate(() => memoryShelf.resolveEventOverflow('fit', '[FIR-02-99] 超長\n時間：2026/02/20 晚上\n地點：家裡\n細節：\n- 改短後的內容'));
    expect(r.ok).toBe(true);
    expect(r.pending).toBeFalsy();
    const last = await page.evaluate(() => { const s = memoryShelf.events('王小明', 'FIR'); const it = s[s.length - 1].items; return it[it.length - 1]; });
    expect(last.text).toContain('改短後的內容');
    expect(page.errors).toEqual([]);
    await context.close();
  });
});

test.describe('備份', () => {
  test('清除、復原，重新整理後資料還在', async ({ browser }) => {
    const { context, page } = await openDevice(browser);
    await page.evaluate(([mems, evs]) => {
      memoryShelf.addCompanion('王小明', '張小美');
      memoryShelf.importMemories(JSON.stringify(mems), '王小明');
      memoryShelf.importEvents(JSON.stringify(evs), '王小明', 'FIR');
    }, [[MEM(1, '雨夜'), MEM(11, '晴天')], [EV('一', '2026-02-01'), EV('二', '2026-02-02')]]);
    const backup = await page.evaluate(password => encryptBackup(password), BACKUP_PASSWORD);
    const count = () => page.evaluate(() => ({ m: state.memories.filter(m => !m.example).length, e: liveEvents().length }));
    const before = await count();

    await page.evaluate(() => openSheet('backupSheet'));
    await page.click('#clearAll'); await page.click('#clearAll');
    await expect(page.locator('#backupResult')).toContainText('已清除');
    expect(await count()).toEqual({ m: 0, e: 0 });

    const result = await page.evaluate(async ([text, password]) => restoreBackup(await decryptBackup(text, password)), [backup, BACKUP_PASSWORD]);
    expect(result).toContain('已復原');
    expect(await count()).toEqual(before);

    await page.reload(); await page.waitForTimeout(300);
    expect(await count()).toEqual(before);
    expect(page.errors).toEqual([]);
    await context.close();
  });
});

test.describe('加密手機備份', () => {
  test('電腦加密、錯誤密碼擋下、手機復原與操作', async ({ browser }) => {
    const pc = await openDevice(browser);
    const A = pc.page;
    await A.evaluate(([mems, evs]) => {
      memoryShelf.addCompanion('王小明', '張小美');
      memoryShelf.importMemories(JSON.stringify(mems), '王小明');
      memoryShelf.importEvents(JSON.stringify(evs), '王小明', 'FIR');
      companionRecord('王小明').files.push({ id: 'f-local-only', name: '原始對話.txt', size: 123, uploadedAt: new Date().toISOString() });
      save();
    }, [[MEM(1, '雨夜'), MEM(11, '晴天')], [EV('一', '2026-02-01')]]);

    await A.evaluate(() => openSheet('backupSheet'));
    await A.fill('#backupPassword', '太短');
    await A.fill('#backupPasswordAgain', '太短');
    await A.click('#downloadBackup');
    await expect(A.locator('#backupResult')).toContainText('至少要有 4 個字元');
    await A.fill('#backupPassword', BACKUP_PASSWORD);
    await A.fill('#backupPasswordAgain', '不是同一組密碼');
    await A.click('#downloadBackup');
    await expect(A.locator('#backupResult')).toContainText('兩次輸入的密碼不一樣');
    await A.fill('#backupPasswordAgain', BACKUP_PASSWORD);
    const downloadReady = A.waitForEvent('download');
    await A.click('#downloadBackup');
    const download = await downloadReady;
    expect(download.suggestedFilename()).toMatch(/^伴侶記憶匣-手機備份-\d{4}-\d{2}-\d{2}\.memorybox$/);
    const chunks = [], stream = await download.createReadStream();
    for await (const chunk of stream) chunks.push(chunk);
    const encrypted = Buffer.concat(chunks).toString('utf8');
    await expect(A.locator('#backupResult')).toContainText('已下載加密手機備份');
    const envelope = JSON.parse(encrypted);
    expect(envelope.app).toBe('companion-memory-shelf-encrypted-backup');
    expect(envelope.encryption.name).toBe('AES-GCM');
    expect(encrypted).not.toContain('雨夜');
    await expect(A.evaluate(([text, password]) => decryptBackup(text, password), [encrypted, '錯的密碼'])).rejects.toThrow('密碼不對');
    const plain = JSON.parse(await A.evaluate(([text, password]) => decryptBackup(text, password), [encrypted, BACKUP_PASSWORD]));
    expect(plain.memories.filter(m => !m.example)).toHaveLength(2);
    expect(plain.companions.find(c => c.name === '王小明').files).toEqual([]); // 原始對話檔不進備份

    const phone = await openDevice(browser, { viewport: { width: 375, height: 812 }, mobile: true });
    const P = phone.page;
    await P.evaluate(() => openSheet('backupSheet'));
    await P.locator('#restoreFile').setInputFiles({ name: '手機備份.memorybox', mimeType: 'application/json', buffer: Buffer.from(encrypted) });
    await P.fill('#restorePassword', BACKUP_PASSWORD);
    await P.click('#doRestore'); await P.click('#doRestore');
    await expect(P.locator('#backupResult')).toContainText('已復原');
    expect(await realMemories(P)).toBe(2);
    expect(await P.evaluate(() => liveEvents().length)).toBe(1);

    // 手機版面：沒有左右溢出，可以複製整則、標記已轉移；電腦不會跟著改變
    await P.evaluate(() => { closeSheets(); state.current = '王小明'; state.tab = 'memory'; state.view = 'todo'; render(); });
    expect(await P.evaluate(() => document.scrollingElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    const copyBtn = P.locator('#cards button', { hasText: '複製整則' }).first();
    await copyBtn.scrollIntoViewIfNeeded(); await copyBtn.click();
    expect(await P.evaluate(() => navigator.clipboard.readText())).toContain('地點');
    await P.locator('#cards button', { hasText: '已轉移' }).first().click();
    expect(await P.evaluate(() => state.memories.filter(m => m.transferred).length)).toBe(1);
    expect(await A.evaluate(() => state.memories.filter(m => m.transferred).length)).toBe(0);

    expect(A.errors.concat(P.errors)).toEqual([]);
    await pc.context.close(); await phone.context.close();
  });
});

test.describe('使用說明', () => {
  test('只有一套流程，沒有 Claude 分頁', async ({ browser }) => {
    const { context, page } = await openDevice(browser);
    await page.evaluate(() => openSheet('guideSheet'));
    await expect(page.locator('#flowMain')).toBeVisible();
    await expect(page.locator('#flowMain > li')).toHaveCount(6);
    await expect(page.locator('#flowMain')).toContainText('不用建立 GitHub 帳號');
    await expect(page.locator('#flowMain')).toContainText('下載手機備份');
    await expect(page.locator('#flowMain')).toContainText('密碼不會被記住或上傳');
    await expect(page.locator('#flowMain')).toContainText('貼進「卿卿我我」');
    await page.evaluate(() => { closeSheets(); openSheet('backupSheet'); });
    await expect(page.locator('#backupSheet')).toContainText('備份會先在這台裝置加密');
    await expect(page.locator('#backupSheet')).toContainText('網站不會把密碼傳給作者、GitHub 或傳送備份檔的服務');
    await expect(page.locator('#backupSheet')).toContainText('不含上傳的原始對話檔');
    await expect(page.locator('#ghToken')).toHaveCount(0);
    await expect(page.locator('#tabClaude')).toHaveCount(0);
    await context.close();
  });
});

test.describe('在 Claude Artifact 裡打開', () => {
  const claudeStub = () => { window.__claudeUse = []; window.claude = { use: x => { window.__claudeUse.push(x); return Promise.resolve(null); } }; };

  test('只顯示正式網址提示，不呼叫 db/user、不存資料、沒有 agent API', async ({ browser }) => {
    const { context, page } = await openDevice(browser, { init: claudeStub });
    await expect(page.locator('#retiredNotice')).toBeVisible();
    await expect(page.locator('#retiredNotice')).toContainText('伴侶記憶匣只在正式網站更新，請改用正式版。');
    await expect(page.locator('.app')).toBeHidden();
    expect(await page.evaluate(() => window.__claudeUse)).toEqual([]);
    expect(await page.evaluate(() => typeof window.memoryShelf)).toBe('undefined');
    expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);
    await expect(page.locator('#retiredOpen')).toHaveAttribute('href', OFFICIAL);
    await page.click('#retiredCopy');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(OFFICIAL);
    expect(page.errors).toEqual([]);
    await context.close();
  });

  test('舊同步金鑰會被清掉，Claude 與一般網頁都不連 GitHub', async ({ browser }) => {
    const oldCfg = { token: 'ghp_old_test_token', id: 'g123' };
    const withOldKey = ([key, value, claude]) => {
      if (claude) window.claude = { use: () => Promise.resolve(null) };
      if (!localStorage.getItem(key)) localStorage.setItem(key, value);
    };

    const claudeCalls = [];
    const c = await browser.newContext(); await c.route('https://api.github.com/**', route => { claudeCalls.push(route.request().url()); return route.abort(); });
    const cp = await c.newPage(); const errors = []; cp.on('pageerror', e => errors.push(e.message));
    await cp.addInitScript(withOldKey, [OLD_SYNC_KEY, JSON.stringify(oldCfg), true]);
    await cp.goto(PAGE); await cp.waitForTimeout(500);
    expect(claudeCalls).toEqual([]);
    expect(await cp.evaluate(key => localStorage.getItem(key), OLD_SYNC_KEY)).toBeNull();
    expect(errors).toEqual([]);
    await c.close();

    const webCalls = [];
    const w = await browser.newContext(); await w.route('https://api.github.com/**', route => { webCalls.push(route.request().url()); return route.abort(); });
    const wp = await w.newPage();
    await wp.addInitScript(withOldKey, [OLD_SYNC_KEY, JSON.stringify(oldCfg), false]);
    await wp.goto(PAGE); await wp.waitForTimeout(500);
    expect(webCalls).toEqual([]);
    expect(await wp.evaluate(key => localStorage.getItem(key), OLD_SYNC_KEY)).toBeNull();
    await w.close();
  });
});
