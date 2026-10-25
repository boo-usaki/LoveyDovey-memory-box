# 伴侶記憶匣 · 自動測試

這是正式版 `index.html` 的檢查工具，**不是另一個網站或版本**。改動 `index.html` 後，跑一次確認舊功能沒有壞掉。

測試直接打開 repo 裡的 `index.html`，不會連到任何外部服務，也**不需要帳號或金鑰**。

## 需要的東西

- Node.js 20 以上

## 安裝（第一次）

在 repo 根目錄執行：

```bash
npm ci
npx playwright install chromium
```

## 執行

```bash
npm test
```

全部通過會看到 `7 passed`。只想跑某一組，可以用名稱篩選，例如：

```bash
npx playwright test -g "加密手機備份"
```

## 測了什麼

| 分組 | 內容 |
| --- | --- |
| 記憶 | agent 匯入、重複匯入會更新、貼上回覆、標記已轉移 |
| 事件 | 自動編號、日期進度、放不下時開新欄、單則太長時改短 |
| 備份 | 清除、復原、重新整理後資料還在 |
| 加密手機備份 | 電腦加密、明文不外露、錯誤密碼擋下、原始對話檔不進備份、手機復原與操作 |
| 使用說明 | 只有一套流程 |
| 在 Claude Artifact 裡打開 | 只顯示正式網址提示、不呼叫 Claude db/user、不存資料、沒有 `window.memoryShelf`；舊同步金鑰會被清掉，且不會連 GitHub |

## 不要提交

`node_modules/`、`test-results/`、`playwright-report/` 已列在 `.gitignore`。測試不產生截圖，也不要把真實資料或密碼寫進測試或設定檔。
