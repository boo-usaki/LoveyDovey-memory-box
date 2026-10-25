# 事件功能驗收：`f4bb8b4`

驗收目標：`main` 的 `f4bb8b497700398268bfeaab454f363994ceac0a`，逐項對照 `docs/codex-review-events.md` 的第 1～16 點。第 17 點自動測試依洛夫人與 Claude 的決定，本次不列為未通過。

## 結論

- 通過：9 點（2、4、5、9、10、11、14、15、16）
- 需要修正：7 點（1、3、6、7、8、12、13）
- 不確定：0 點

這次確認多數核心修正已生效，但還有四個會造成資料消失、重現或漏整理的實質問題：Claude 初始化期間清除會失效、Claude 設定快照會丟掉本機獨有伴侶、刪除後批次重匯會產生重複 id、日期範圍外／日期矛盾仍會推進進度。建議先處理這四項。

## 逐項驗收

### 1. 備份沒有事件資料

**狀態：需要修正（備份內容通過，Claude 裡的「整份取代」仍不可靠）**

- **已通過的部分**：`backupJSON()`（`index.html:2582-2584`）已包含 `memories`、`events`、`companions`（含事件欄）、`settings` 與 `evp`。本機瀏覽器實測備份後清空狀態再還原，記憶／事件／伴侶／pending 都能回來。
- **仍會發生的事**：`restoreBackup()` 先排入 Claude 遠端刪除，再立刻回報「已還原」（`index.html:2594-2606`）；它沒有等待刪除完成，也沒有呼叫 `reportRemoteClear()`。模擬遠端 `delete()` 失敗時，函式仍回傳「已還原」，而 `remote.failed` 已累積失敗筆數。若在 Claude 同步初始化完成前還原，`deleteMemories()`／`deleteEvents()` 也會直接略過，舊遠端資料之後可能重新合併回來。
- **建議**：還原在 Claude 裡應等遠端初始化與刪除結果完成後才宣告成功；失敗時明確顯示「本機已還原，但 Claude 帳號尚未完全取代」。最好加入可同步的 clear/restore epoch，讓舊文件即使未刪成功也不會復活。

### 2. overflow pending 只存在本機

**狀態：通過**

- `evp` 已存入 localStorage（`index.html:1083,1110`）、Gist payload／merge（`index.html:2317-2318,2348-2349`）及 Claude settings document／snapshot（`index.html:2694,2732,2788`）。
- pending 的建立與清除都有時間戳（`setPending()`／`newerPending()`），API 也提供 `pendingEvent()`。靜態路徑與瀏覽器測試均符合原要求。

### 3. 事件與事件欄中繼資料分開同步，可能產生 orphan

**狀態：需要修正**

- **已通過的部分**：`mergeEvMeta()`（`index.html:1720-1740`）現在按 category＋slot 合併；`repairSlots()`（`index.html:1706-1717`）也能替有事件但缺 slot 的資料補欄。Gist 合併會保留兩端 category／slot。
- **仍會發生的事**：Claude 的 settings `onSnapshot` 會用遠端 `d.companions` 整份重建 `state.companions`（`index.html:2778-2786`），只合併「遠端也有同名 companion」的 `ev`。本機獨有 companion 不會被補回。模擬測試中，遠端只有 `Remote`、本機新增 `Local` 且 `Local` 只有事件；舊快照抵達後側欄只剩 `Remote`，`Local` 的 event document 還在 state 裡卻沒有入口。
- **建議**：Claude snapshot 應像 Gist 一樣做 companion 聯集，再逐 companion 呼叫 `mergeEvMeta()`；或把 slot metadata 正規化成獨立文件。合併後驗證每個 live event 的 companion 與 slot 都可從 UI 進入。

### 4. 刪除／改名類別會讓事件失去入口

**狀態：通過**

- `visibleCats()`（`index.html:1604-1610`）會從事件與 slot 找回已移出清單的代號，並顯示「已不在清單」。
- `eventPrompt()`、`setEventRange()` 與 `importEvents()` 的明確 target category 都會用 `knownCat()` 驗證，不會再靜默建立完全沒有入口的代號。

### 5. 刪除最後一則後重用編號

**狀態：通過**

- `nextIdx()`（`index.html:1694-1698`）同時計入 tombstone、`slot.hw` 與 `baseIdx`；刪除不會讓高水位倒退。
- 瀏覽器實測刪除 `[FIR-01-01]` 後新增不同事件，得到 `[FIR-01-02]`。

### 6. 空欄／API 可繞過字數上限

**狀態：需要修正（欄上限通過，每則上限未真正執行）**

- **已通過的部分**：空欄也會檢查 overflow；單則大於整欄時 `canOpenNew=false`；`resolveEventOverflow("fit")` 會重新計算格式化後字數，太長時保留 pending。這三條瀏覽器實測均正確。
- **仍會發生的事**：`itemLimit()` 只在已經把事件寫入後增加 `ctx.long`（`index.html:1800-1804`），最後僅顯示提示（`index.html:1824`），並不阻止或要求精簡。實測每則上限 50 字時，約 160 字的事件仍 `added: 1` 並保存在 state。
- **建議**：在 push event 前驗證 `need > itemLimit()`；超過時進入可修正的 pending／錯誤流程，不要先寫入。若產品決定只警告，也應把 README／prompt 的「不可超過」改成「會警告」，避免規格與行為不一致。

### 7. Claude 清除失敗沒有提示

**狀態：需要修正**

- **已通過的部分**：當 `remote.mem`／`remote.ev` 已就緒且 `.delete()` reject 時，`reportRemoteClear()` 會等待 queue，實測能顯示「Claude 帳號裡還有 1 筆沒刪成功」。
- **仍會發生的事**：若使用者在 Claude db 尚未初始化完成時按清除，`deleteMemories()`／`deleteEvents()` 因 collection 尚未設定而直接 return（`index.html:2670-2680`），`reportRemoteClear()` 也因兩者皆空而 return（`index.html:2683-2688`）。模擬慢 500ms 的初始化時，畫面先顯示清除成功、事件數為 0；初始化完成後舊事件 `old1` 重新出現，成功訊息仍留著。
- **建議**：Claude viewer 中，在遠端狀態確定前停用清除／還原，或記錄「待清除」意圖並在 collection 就緒後執行；完成前不要顯示成功。clear epoch／tombstone 仍是較穩健的方案。
- **真實 `window.claude` 相容性**：目前程式使用 Firestore 風格的 `doc().delete()`、`get()`、`onSnapshot()`。本次沒有取得 Anthropic 對這個 viewer db 的公開正式契約，因此無法保證真實環境的 `.delete()` 方法與錯誤時序永遠相同；這一小部分仍需 Claude Artifact 實機驗證。但上面的「初始化期間清除失效」是程式控制流程本身可確定的問題，不依賴真實 API 細節。

### 8. 重複判斷會覆蓋不同事件／跨裝置產生重複

**狀態：需要修正**

- **已通過的部分**：一般情況下，內容指紋會讓同一份回覆在同裝置或不同裝置使用相同 id；同日同關鍵字但內容不同會保留兩則並提示，不再直接覆蓋。
- **仍會發生的事**：如果同一指紋已有 deleted tombstone，`placeQueue()` 以 `fingerprint + Date.now()` 產生重加 id（`index.html:1789-1793`）。同一批輸入兩份相同事件時，迴圈會一直先找到原 tombstone，而且兩圈可能落在同一毫秒。實測新增兩則得到完全相同的 id（例如 `e1a3rhv4-mvnlg6x9`），回傳卻是 `added: 2`。Gist／Claude 之後按 id 合併時會只剩一筆。
- **建議**：批次內也要用「實際將寫入的 id／fingerprint」去重；重加已刪事件可直接復活並更新原 tombstone，或使用保證唯一的 nonce/UUID，且在 push 前檢查 id 唯一。

### 9. 接續 app 事件欄可建立重複欄號

**狀態：通過**

- `saveSlotSetup()`（`index.html:2161-2173`）若同號欄已有事件，會更新既有欄的 base／high-water mark，不再 push 第二個同號 slot。
- 實測既有第 5 欄再貼 app 內容後，仍只有一個 `no: 5`，`baseIdx`／`hw` 正確升到 2。

### 10. 匯入可靜默寫到另一位伴侶／類別

**狀態：通過**

- 預設會鎖定呼叫時指定的 companion/category（`index.html:1836-1868`）；回覆中的名字／類別不同時，資料仍進指定位置並回傳可讀的 notes。只有明確傳 `{ allowMixed: true }` 才允許混合。
- 實測回覆寫 `Wrong`／`EV`、target 指定 `A`／`FIR`，最後資料在 `A`／`FIR`，且 notes 同時指出兩個差異。

### 11. pending 鎖住流程但沒有全域入口

**狀態：通過**

- 全域 `pending-bar` 會在不位於原處時顯示 companion、category、column、keywords，並提供「回去處理」（`index.html:1152-1156,2562`）。
- 320px 瀏覽器實測切到另一位伴侶的記憶頁時 banner 可見，文字包含原 companion 與 `[FIR-01]`。

### 12. 日期範圍與 AI 日期沒有驗證

**狀態：需要修正**

- **已通過的部分**：UI／API 會阻止 `from > to`；範圍外或沒有日期會加入 notes。
- **仍會發生的事（確定重現）**：設定 `2026-03-01`～`2026-03-31`，只匯入一則 `2026-04-05` 的範圍外事件，結果雖提示範圍外，`placeQueue()` 結尾仍把進度改成 `from=2026-04-01, to=""`（`index.html:1811`），整個三月被視為完成。另一次測試中，JSON `date=2026-05-05`、`fields.時間=2026/06/05`，沒有任何提示，進度直接變成 `2026-06-01`。
- **建議**：只在本批所有事件日期有效、位於範圍內，且 `date` 與「時間」日期一致時才自動完成 `to` 範圍；否則保留原 range，列出需確認的項目。確認後再由使用者／agent 明確推進。

### 13. `buildEventPrompt` 防重資訊太弱

**狀態：需要修正（規則與 base 納入通過，摘要仍失效）**

- **已通過的部分**：已加入真實日期、不可猜測、同日可有多件事、固定 companion/category、禁止腦補等規則；索引也包含日期、關鍵字，並納入 slot.base。
- **仍會發生的事**：`snippet()` 取 `Object.values(fields)` 的第一個非空欄位（`index.html:1919`）。預設欄位順序通常先是「時間」，所以索引實際會變成 `2026/01/01｜target lock｜2026/01/01`；第三欄只是重複日期，沒有事件摘要。同日同關鍵字的兩件事仍難以分辨。
- **建議**：明確優先取「細節／經過／場景概要」的第一個非空項目，排除「時間」與純日期；或附穩定 fingerprint 的短碼。若沒有摘要欄，再退回地點或其他非時間欄位。

### 14. 不用代號時手機類別按鈕溢出

**狀態：通過**

- `.ev-cats` 已設 `flex-wrap: wrap; max-width: 100%`（`index.html:276`）。
- 320px headless Chrome 實測 `scrollWidth === clientWidth`，五個類別不會被水平裁掉。

### 15. 精簡結果解析過度寬鬆

**狀態：通過**

- `strictEventBlock()`（`index.html:1878-1884`）先 `stripFence()`，再要求能被代號格式或目前 head template 辨認的標題；`resolveEventOverflow()` 在解析與字數都通過前不改 pending 原資料。
- 實測沒有合法標題的精簡文字會回錯誤，pending 保持不變；太長也不會覆寫。

### 16. 事件頁顯示「查看／修改」但其實唯讀

**狀態：通過**

- 事件模式會把按鈕改為「查看指令」（`index.html:1982`）；指令視窗也說明應到事件格式或「其他給 AI 的提醒」調整（`index.html:1369-1375`）。

## 驗證方式與限制

- 靜態檢查 `f4bb8b4` 與其父 commit `dd63d48` 的差異；`index.html` 內兩段 script 均通過 JavaScript syntax check。
- 以本機 headless Chrome 逐項呼叫 `window.memoryShelf` 並檢查 DOM/state，覆蓋備份還原、編號、overflow、重複匯入、同欄號、target lock、日期範圍、pending banner 與 320px 類別排版。
- Claude db 使用符合目前程式呼叫形狀的 mock，測試 delete reject、慢初始化與 settings snapshot。這能驗證本程式的排程與錯誤處理，但不能取代真實 Claude Artifact 對私有 db API 的最終相容性測試。
- 沒有修改 `main`、`index.html` 或 README，也沒有建立 PR。
