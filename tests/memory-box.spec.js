// 伴侶記憶匣自動測試：直接開啟 repo 裡的 index.html，模擬使用者與 agent 的操作。
// 執行方式見 TESTING.md。GitHub API 一律用假的回應，不會連到真的 GitHub、也不需要金鑰。
const { test, expect } = require('@playwright/test');
const path = require('path');
const { pathToFileURL } = require('url');

const PAGE = pathToFileURL(path.resolve(__dirname, '..', 'index.html')).href;
const OFFICIAL = 'https://boo-usaki.github.io/memory-box/';
const SYNC_KEY = 'companion-memory-shelf.sync';
const FAKE_TOKEN = 'ghp_fake_token_for_tests';

const MEM = (from, title) => ({
  companion: '王小明', rounds: `${from}-${from + 9}`, title,
  fields: { '地點': '家', '場景概要': '概要' + title, '關鍵詞': ['詞'], '關鍵對話': '王小明：「嗨」', '情感變化及影響': '平穩', '{伴侶}覺得重要的事': '記得' },
});
const EV = (kw, date, len = 2) => ({
  category: 'FIR', date, keywords: kw,
  fields: { '時間': date.replace(/-/g, '/') + ' 晚上', '地點': '家裡', '細節': ['細節句子。'.repeat(len)] },
});
const realMemories = page => page.evaluate(() => state.memories.filter(m => !m.example).length);

/* 假的 GitHub Gist：同一個 store 給多台「裝置」共用 */
function fakeGist() { return { id: null, content: null, calls: [] }; }
async function routeGitHub(context, store) {
  await context.route('https://api.github.com/**', async route => {
    const req = route.request(), u = new URL(req.url()), m = req.method();
    store.calls.push(`${m} ${u.pathname}`);
    if ((req.headers()['authorization'] || '') !== 'Bearer ' + FAKE_TOKEN) return route.fulfill({ status: 401, body: '{}' });
    const body = () => ({ id: store.id, description: '伴侶記憶匣 sync', files: { 'memory-shelf.json': { content: store.content, truncated: false } } });
    const json = (status, data) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
    if (u.pathname === '/gists' && m === 'GET') return json(200, store.id ? [body()] : []);
    if (u.pathname === '/gists' && m === 'POST') { store.id = 'g123'; store.content = JSON.parse(req.postData()).files['memory-shelf.json'].content; return json(201, body()); }
    if (u.pathname === '/gists/g123' && m === 'GET') return json(200, body());
    if (u.pathname === '/gists/g123' && m === 'PATCH') { store.content = JSON.parse(req.postData()).files['memory-shelf.json'].content; return json(200, body()); }
    return route.fulfill({ status: 404, body: '{}' });
  });
}

/* 開一台「裝置」：獨立的瀏覽器資料、剪貼簿權限、收集頁面錯誤 */
async function openDevice(browser, { store, viewport = { width: 1280, height: 1000 }, mobile = false, init } = {}) {
  const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile });
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  if (store) await routeGitHub(context, store);
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

    await page.evaluate(() => { closeSheets(); state.current = '王小明'; state.tab = 'mem'; state.view = 'todo'; render(); });
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
    r = await page.evaluate(() => memoryShelf.resolveEventOverflow('new'));
    expect(r.ok).toBe(true);
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
  test('清除、還原，重新整理後資料還在', async ({ browser }) => {
    const { context, page } = await openDevice(browser);
    await page.evaluate(([mems, evs]) => {
      memoryShelf.addCompanion('王小明', '張小美');
      memoryShelf.importMemories(JSON.stringify(mems), '王小明');
      memoryShelf.importEvents(JSON.stringify(evs), '王小明', 'FIR');
    }, [[MEM(1, '雨夜'), MEM(11, '晴天')], [EV('一', '2026-02-01'), EV('二', '2026-02-02')]]);
    const backup = await page.evaluate(() => backupJSON());
    const count = () => page.evaluate(() => ({ m: state.memories.filter(m => !m.example).length, e: liveEvents().length }));
    const before = await count();

    await page.evaluate(() => openSheet('backupSheet'));
    await page.click('#clearAll'); await page.click('#clearAll');
    await expect(page.locator('#backupResult')).toContainText('已清除');
    expect(await count()).toEqual({ m: 0, e: 0 });

    await page.click('#openRestore');
    await page.fill('#restoreText', backup);
    await page.click('#doRestore'); await page.click('#doRestore');
    await expect(page.locator('#backupResult')).toContainText('已還原');
    expect(await count()).toEqual(before);

    await page.reload(); await page.waitForTimeout(300);
    expect(await count()).toEqual(before);
    expect(page.errors).toEqual([]);
    await context.close();
  });
});

test.describe('Gist 同步', () => {
  test('電腦連線、手機貼連線碼、手機複製與已轉移、雙邊合併、清除同步', async ({ browser }) => {
    const store = fakeGist();
    const pc = await openDevice(browser, { store });
    const A = pc.page;
    await A.evaluate(list => { memoryShelf.addCompanion('王小明', '張小美'); memoryShelf.importMemories(JSON.stringify(list), '王小明'); }, [MEM(1, '雨夜'), MEM(11, '晴天')]);

    await A.evaluate(() => openSheet('backupSheet'));
    await A.fill('#ghToken', FAKE_TOKEN);
    await A.click('#ghConnect');
    await expect(A.locator('#syncBadge')).toHaveText('已同步到 GitHub');
    expect(JSON.parse(store.content).memories.filter(m => !m.example)).toHaveLength(2);
    const code = await A.evaluate(() => linkCode());

    const phone = await openDevice(browser, { store, viewport: { width: 375, height: 812 }, mobile: true });
    const P = phone.page;
    await P.evaluate(() => openSheet('backupSheet'));
    await P.fill('#ghToken', code);
    await P.click('#ghConnect');
    await expect(P.locator('#syncBadge')).toHaveText('已同步到 GitHub');
    await expect.poll(() => realMemories(P)).toBe(2);   // 連線後會在背景把雲端內容讀進來

    // 手機版面：沒有左右溢出，可以複製整則、標記已轉移
    await P.evaluate(() => { closeSheets(); state.current = '王小明'; state.tab = 'mem'; state.view = 'todo'; render(); });
    expect(await P.evaluate(() => document.scrollingElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    const copyBtn = P.locator('#cards button', { hasText: '複製整則' }).first();
    await copyBtn.scrollIntoViewIfNeeded(); await copyBtn.click();
    expect(await P.evaluate(() => navigator.clipboard.readText())).toContain('地點');
    await P.locator('#cards button', { hasText: '已轉移' }).first().click();
    await P.waitForTimeout(2200);   // 等自動同步
    await A.evaluate(() => gistSync());
    expect(await A.evaluate(() => state.memories.filter(m => m.transferred).length)).toBe(1);

    // 兩邊各自新增，同步後都保留
    await A.evaluate(m => memoryShelf.importMemories(JSON.stringify([m]), '王小明'), MEM(21, '電腦新增'));
    await P.evaluate(() => { state.memories.push({ id: 'mphone1', companion: '王小明', seq: 99, rounds: '991-1000', title: '手機新增', fields: {}, transferred: false, updatedAt: Date.now() }); save(); });
    await A.evaluate(() => gistSync()); await P.evaluate(() => gistSync()); await A.evaluate(() => gistSync());
    for (const d of [A, P]) {
      const t = await d.evaluate(() => state.memories.map(m => m.title));
      expect(t).toEqual(expect.arrayContaining(['電腦新增', '手機新增']));
    }

    // 電腦清除，手機同步後也清空
    await A.evaluate(() => openSheet('backupSheet'));
    await A.click('#clearAll'); await A.click('#clearAll');
    await A.evaluate(() => gistSync()); await P.evaluate(() => gistSync());
    expect(await P.evaluate(() => state.memories.filter(m => !m.example).length + liveEvents().length)).toBe(0);

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

  test('即使留有同步金鑰也不讀寫 Gist；一般網頁模式則會同步', async ({ browser }) => {
    const cfg = { token: FAKE_TOKEN, id: 'g123', lastSeen: 0, lastPushed: 0, lastSyncAt: 0 };
    const withKey = ([key, value, claude]) => {
      if (claude) window.claude = { use: () => Promise.resolve(null) };
      if (!localStorage.getItem(key)) localStorage.setItem(key, value);
    };

    const claudeStore = fakeGist(); claudeStore.id = 'g123'; claudeStore.content = '{}';
    const c = await browser.newContext(); await routeGitHub(c, claudeStore);
    const cp = await c.newPage(); const errors = []; cp.on('pageerror', e => errors.push(e.message));
    await cp.addInitScript(withKey, [SYNC_KEY, JSON.stringify(cfg), true]);
    await cp.goto(PAGE); await cp.waitForTimeout(800);
    await cp.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await cp.waitForTimeout(2000);
    expect(claudeStore.calls).toEqual([]);
    expect(await cp.evaluate(() => gistOn())).toBe(false);
    expect(errors).toEqual([]);
    await c.close();

    const webStore = fakeGist(); webStore.id = 'g123'; webStore.content = '{}';
    const w = await browser.newContext(); await routeGitHub(w, webStore);
    const wp = await w.newPage();
    await wp.addInitScript(withKey, [SYNC_KEY, JSON.stringify(cfg), false]);
    await wp.goto(PAGE);
    await expect.poll(() => webStore.calls.length).toBeGreaterThan(0);
    await w.close();
  });
});
