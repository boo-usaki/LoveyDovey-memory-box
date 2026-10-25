# 伴侶記憶匣 · 整理指令

> 給 AI agent：使用者請你讀這份檔案時，照下面的指令整理使用者提供的對話檔，
> 把結果存成一個 `.json` 檔（或直接回覆 JSON），讓使用者匯入「伴侶記憶匣」頁面。
> 這份是預設格式；使用者若在頁面上自訂了格式，會另外給你自己的版本，以那份為準。

請幫我把附件中我和伴侶的對話，整理成一則一則的記憶。

【規則】
1. 伴侶的一則回覆加上我的一則回覆，算作一輪。
2. 每 10 輪整理成一則記憶，照時間順序編排。最後不足 10 輪的部分，照實際剩下的輪數整理成一則，不要硬湊。
3. 伴侶的名字請看檔名或對話內容。
4. 只根據對話內容整理，不要自己補充或編造沒發生的事。
5. 每則記憶整則（包含標題、欄位名稱、標點符號）不可超過 500 字；超過就精簡內容，不要拆成兩則。
6. 標籤類欄位（例如關鍵詞）要挑對話裡真的出現、之後能觸發這段記憶的字詞，用陣列列出。
7. 對話類欄位要保留說話者的名字，格式是「名字：「內容」」，一句一行（用 \n 換行）。

【每則記憶的欄位】
- 標題
- 地點
- 場景概要
- 關鍵詞
- 關鍵對話
- 情感變化及影響
- {伴侶}覺得重要的事
（欄位名稱裡的 {伴侶} 是伴侶名字、{我} 是我的名字的位置；JSON 的欄位名稱請照抄。）

【輸出格式】
請只輸出一個 JSON 陣列，不要加任何說明文字，格式如下：
[
  {
    "companion": "伴侶名字",
    "rounds": "1-10",
    "title": "這段記憶的標題",
    "fields": {
      "地點": "……",
      "場景概要": "……",
      "關鍵詞": [
        "詞語1",
        "詞語2"
      ],
      "關鍵對話": "名字：「……」\n名字：「……」",
      "情感變化及影響": "……",
      "{伴侶}覺得重要的事": "……"
    }
  }
]

---

## 在瀏覽器裡操作頁面（給能操作網頁的 agent）

如果使用者在瀏覽器開著「伴侶記憶匣」頁面，頁面提供 `window.memoryShelf`，整個流程可以由你完成：

1. `memoryShelf.help()` 看用法，`memoryShelf.list()` 看有哪些伴侶、進度和對話檔
2. `memoryShelf.prompt("伴侶名字")` 取得這位伴侶的整理指令（已寫好名字、格式與從第幾輪接續）—— 以這份為準
3. `await memoryShelf.readFile("伴侶名字")` 讀取最新上傳的對話檔
4. 照指令整理成 JSON 陣列
5. `memoryShelf.importMemories(JSON, "伴侶名字")` 寫入，回傳新增筆數與最新進度

不能執行程式的話：在伴侶頁面按「貼上回覆」，把 JSON 貼進輸入框按「匯入」。

### 整理事件

使用者請你整理「事件」（例如 FIR、EV、DIA）時：

1. `memoryShelf.setEventRange("伴侶名字", "FIR", "2026-02-01", "2026-02-20")` 設定日期範圍（「到」可以留空）
2. `memoryShelf.eventPrompt("伴侶名字", "FIR")` 取得事件指令 —— 以這份為準
3. `await memoryShelf.readFile("伴侶名字")` 讀對話檔，照指令整理成 JSON 陣列
4. `memoryShelf.importEvents(JSON, "伴侶名字", "FIR")` 寫入。編號（[FIR-05-03] 這種）頁面會自動接續。事件一律放進你指定的伴侶和類別；真的要一次寫多位伴侶或多種類別，才傳第四個參數 `{ allowMixed: true }`。類別不在清單裡會回錯誤
5. 回傳裡有 `pending`，代表下一則超過每則上限，或放不下這一欄。**先問使用者**要怎麼處理（`pending.ask` 有寫好的問句），不要自己決定：
   - 改短一點擠進這欄：照 `pending.room` 的字數把那一則精簡，呼叫 `memoryShelf.resolveEventOverflow("fit", 精簡後的文字)`（第一行保留標題行）
   - 開新的一欄：呼叫 `memoryShelf.resolveEventOverflow("new")`（`pending.canOpenNew` 是 false 時，代表超過每則上限或比一整欄還長，開新欄也沒用，只能改短）
   回傳如果又有 `pending`，就再問一次
6. `memoryShelf.events("伴侶名字", "FIR")` 查看結果；`memoryShelf.pendingEvent()` 可以查目前有沒有在等使用者決定的事件

事件 JSON 的格式：

```json
[
  {
    "companion": "伴侶名字",
    "category": "FIR",
    "date": "2026-02-13",
    "keywords": "關鍵字1、關鍵字2",
    "fields": {
      "時間": "2026/02/13 晚上",
      "地點": "……",
      "細節": ["……", "名字：「……」"]
    }
  }
]
```

---

## 在 Claude 一般對話裡直接寫事件

這一段只給能使用這份 Artifact 的 ArtifactData 的 Claude。能操作瀏覽器頁面的 agent，請繼續使用上面的 `window.memoryShelf`，不要繞收件匣。

使用者先在電腦打開 Claude 側邊欄裡的記憶匣，選好伴侶、事件類別和日期範圍。頁面會把**目前這一份**事件指令鏡像到 document：

`data/users/me/agent`

1. 讀取 `currentEvent`。`ready` 必須是 `true`；整理時完整遵守 `currentEvent.prompt`，不要自己從 settings 拼另一份指令。
2. 用 `currentEvent.promptKey`、`companion`、`category` 原樣建立一筆工作。不要自己編 `[FIR-05-03]`，也不要直接寫 `shelf/events`。
3. 在 collection `data/users/me/agent/eventInbox` 建立一份 id 唯一的新文件：

```json
{
  "kind": "events",
  "status": "queued",
  "promptKey": "照 currentEvent.promptKey 原樣填入",
  "companion": "照 currentEvent.companion 原樣填入",
  "category": "照 currentEvent.category 原樣填入",
  "payload": [
    {
      "companion": "伴侶名字",
      "category": "FIR",
      "date": "2026-02-13",
      "keywords": "關鍵字1、關鍵字2",
      "fields": {
        "時間": "2026/02/13 晚上",
        "地點": "……",
        "細節": ["……", "名字：「……」"]
      }
    }
  ],
  "createdAt": "2026-10-25T10:00:00.000Z"
}
```

4. 頁面開著時會接手編號、判斷重複、推進日期範圍，再更新同一份工作文件：
   - `done`：已完成；把 `result.added`、`result.skipped` 和 `result.notes` 告訴使用者。
   - `error`：沒有匯入；照 `result.error` 說明，重新讀取 `data/users/me/agent` 後再決定是否重送。
   - `waiting_user`：下一則放不下。照 `result.pending.ask` 問使用者，不可自行決定。
5. 使用者選「開新欄」後，把同一份工作更新為：

```json
{ "status": "resolving", "resolution": { "choice": "new" }, "updatedAt": "RFC 3339 時間" }
```

使用者選「改短」後，先照 `result.pending.room` 精簡，再更新為：

```json
{
  "status": "resolving",
  "resolution": {
    "choice": "fit",
    "text": "改短後的完整事件文字；第一行保留標題行"
  },
  "updatedAt": "RFC 3339 時間"
}
```

更新一份已經讀過的工作文件時，帶上 ArtifactData 回傳的 `if_version`。若版本衝突，重新讀取後再處理，不要覆蓋頁面剛寫入的結果。
