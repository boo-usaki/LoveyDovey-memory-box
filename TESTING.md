# 伴侶記憶匣 · 自動測試

這是正式版 `index.html` 的檢查工具，**不是另一個網站或版本**。改動 `index.html` 後，跑一次確認舊功能沒有壞掉。

測試直接打開 repo 裡的 `index.html`。GitHub 同步用的是假的 GitHub 回應，不會連到真的 GitHub，也**不需要任何金鑰**。

## 需要的東西

- Node.js 18 以上

## 安裝（第一次）

在 repo 根目錄執行：

```bash
npm install
npx playwright install chromium
```

## 執行

```bash
npm test
```

全部通過會看到 `7 passed`。只想跑某一組，可以用名稱篩選，例如：

```bash
npx playwright test -g "Gist"
```

## 測了什麼

| 分組 | 內容 |
| --- | --- |
| 記憶 | agent 匯入、重複匯入會更新、貼上回覆、標記已轉移 |
| 事件 | 自動編號、日期進度、放不下時開新欄、單則太長時改短 |
| 備份 | 清除、還原、重新整理後資料還在 |
| Gist 同步 | 電腦連線、手機貼連線碼、手機版面複製與已轉移、兩台同時新增會合併、清除會同步 |
| 使用說明 | 只有一套流程 |
| 在 Claude Artifact 裡打開 | 只顯示正式網址提示、不呼叫 Claude db/user、不存資料、沒有 `window.memoryShelf`；即使留有同步金鑰也不讀寫 Gist |

## 不要提交

`node_modules/`、`test-results/`、`playwright-report/` 已列在 `.gitignore`。測試不產生截圖；也不要把任何金鑰寫進測試或設定檔。
