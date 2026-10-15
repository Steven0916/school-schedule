# AI 導入示範學校｜期程統整

統整會議、工作、觀課計畫與重要行事的期程網站，並提供公開觀課填報頁面，架設在 Cloudflare（免費方案）。

網站：https://school-schedule.ydlo-school.workers.dev
公開觀課填報：https://school-schedule.ydlo-school.workers.dev/observations
計畫成員：https://school-schedule.ydlo-school.workers.dev/team
已完成工作：https://school-schedule.ydlo-school.workers.dev/completed

## 架構

- **Cloudflare Workers**：`src/worker.js`（API 與頁面）
- **Cloudflare D1**：資料庫（期程、學校帳號、登入狀態、操作紀錄），資料表定義在 `migrations/`
- **Workers KV**（binding `FILES`）：觀課附件的檔案內容
- **靜態網頁**：`public/`（`common.js` 為各頁共用的工具與左側選單；`app.js` 期程頁與已完成工作頁（以 body 的 data-page 區分）、`observations.js` 公開觀課頁、`team.js` 計畫成員頁）

## 修改與上線

```
npm install          # 第一次需要
npm run dev          # 本機測試：http://localhost:8787（本機資料庫，與正式站分開）
npm run deploy       # 發佈到 Cloudflare
git add . && git commit -m "說明" && git push   # 程式碼存到 GitHub
```

本機測試的秘密變數放在 `.dev.vars`（`ADMIN_PASSWORD=...`、`PASSWORD_KEY=...`，不會上傳）。

## 自動測試

```
npm test
```

會自動：套用本機資料庫變更 → 在 port 8790 啟動本機測試伺服器 → 執行 `tests/*.test.mjs` → 關閉伺服器，最後顯示每個測試檔的結果（全部通過時結束代碼為 0）。

- 只使用本機資料庫（`.wrangler` 資料夾），**不會動到正式網站**；`tests/helpers.mjs` 會拒絕連到非本機的網址。
- 需要專案根目錄有 `.dev.vars`（`ADMIN_PASSWORD`、`PASSWORD_KEY`）。
- 建議每次發布前先執行一次；新增功能時，在 `tests/` 加一個 `名稱.test.mjs`，結尾用 `process.exitCode` 回報成敗。
- 測試伺服器的紀錄在 `.wrangler/test-server.log`。

## 管理者密碼

- 第一次登入時，會用 Cloudflare 秘密變數 `ADMIN_PASSWORD` 建立 `admin` 帳號；之後請在網站「帳號與權限」修改。
- 忘記密碼：清除管理者資料後重新以 `ADMIN_PASSWORD` 登入
  ```
  npx wrangler secret put ADMIN_PASSWORD
  npx wrangler d1 execute school-schedule --remote --command "DELETE FROM admin; DELETE FROM sessions WHERE role='owner'"
  ```

## 觀課與期程、附件、匯出

- 填報公開觀課時，會自動在期程清單建立一筆「觀課計畫」（不含設計者姓名）；編輯觀課會同步更新，刪除觀課則把該期程移到回收區。使用者自行刪除的期程不會再被建回。
- 觀課附件：PDF、圖片、Office 文件，每個最多 10 MB、每筆最多 10 個；**只有登入者可下載**，只有填報者與管理者可上傳／刪除。
- 觀課紀錄、計畫成員頁登入後有「下載 Excel」（.xlsx，由瀏覽器產生）。
- 期程清單可切換「清單／月曆」。
- 已完成工作頁（/completed）依活動月份分組、可依類別篩選，登入後可「下載 Excel」（依目前篩選）。
- 期程可勾選「參與學校」（來自學校與縣市設定，可複選、選填）；觀課自動建立的期程會勾選填報學校。

## 計畫成員

- 總召、副總召、計畫主持人、協同主持人四份名單，登入後按「新增名單」選擇縣市（雲林縣、嘉義縣）與身分（校長、主任、組長、教師、職員）、輸入姓名與服務學校，名單內依縣市分組；按「編輯」可修改縣市、身分、姓名、服務學校或改放另一份名單。
- 未登入者看到的姓名中間字打碼；學校端只能刪除自己新增的名單，管理者可刪除全部。
- 名單內依身分排序（校長、主任、組長、教師、職員），同身分依服務學校。
- 刪除的名單會移至頁面下方的回收區，可復原（學校端只看得到自己刪除的）。
- 防止重複：同一份名單內同名同校會被擋下；同名不同校需再按一次確認（比對時忽略空白）。

## 學校端密碼查看

- 管理者可在「帳號與權限」查看、修改學校端的學校名稱、帳號與密碼；每次查看密碼都會寫入操作紀錄。
- 學校端密碼除了雜湊外，另存一份以 AES-GCM 加密的副本，金鑰為 Cloudflare 秘密變數 `PASSWORD_KEY`（32 bytes，base64）。**金鑰遺失或更換後，既有密碼將無法顯示**（仍可登入，重設後即可再查看）。
- 加入此功能前建立的帳號沒有加密副本，需重設一次密碼才能查看。

## 資料備份

```
npx wrangler d1 export school-schedule --remote --output backup.sql
```

D1 也內建 30 天時間回溯（Time Travel）。

## 權限

- **公開瀏覽**：看期程清單與已完成工作。
- **學校端**：新增期程；只能刪除／復原自己新增的項目。
- **管理者**：新增、編輯、確認完成、刪除／復原所有期程，查看與管理學校端帳號密碼，查看操作紀錄。

## 公開觀課填報

- 欄位：日期、領域/科目、設計者、班級（年級限七、八、九年級／班級／人數）、總節數與每節分鐘數、單元名稱、六大 AI 教學應用模式（可複選）。
- 任何人可瀏覽，但未登入者看到的設計者姓名中間字會打碼（王小明 → 王○明，由伺服器處理）；學校端與管理者登入後可看完整姓名並填報。學校端只能編輯／刪除自己填報的資料，管理者可處理全部。
- 六大模式定義在 `src/worker.js` 與 `public/observations.js` 的 `AI_MODES`，兩邊需一致。

## 學校與縣市

- 管理者在首頁「帳號與權限 → 學校與縣市」新增、編輯、刪除學校（名稱＋縣市）。
- 全站的學校選項都從這裡讀取：期程的地點（另有「線上會議」）、參與學校、計畫成員服務學校的建議。
- 計畫成員選了清單中的學校，縣市自動帶入且以學校設定為準；清單外的單位（例如教育處）才自行選縣市。
- 期程清單（含月曆、統計）、已完成工作、公開觀課都可依「全部縣市／雲林縣／嘉義縣」篩選：期程的縣市來自參與學校、地點與建立學校，都沒有則視為「共同」（兩縣都顯示）；觀課的縣市來自填報學校。選擇記在瀏覽器，學校帳號第一次使用時預設為本校所在縣市。匯出的 Excel 多一欄縣市。
- 學校改名時，期程地點、參與學校、計畫成員服務學校、學校帳號名稱會一併更新；刪除學校只是移出清單，既有資料保留原名稱。

## 常見修改

期程類別定義在 `src/worker.js` 與 `public/app.js` 開頭的 `CATEGORIES`，兩邊需一致。
