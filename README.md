# AI 導入示範學校｜期程統整

統整會議、工作、觀課計畫與重要行事的期程網站，並提供公開觀課填報頁面，架設在 Cloudflare（免費方案）。

網站：https://school-schedule.ydlo-school.workers.dev
公開觀課填報：https://school-schedule.ydlo-school.workers.dev/observations
計畫成員：https://school-schedule.ydlo-school.workers.dev/team

## 架構

- **Cloudflare Workers**：`src/worker.js`（API 與頁面）
- **Cloudflare D1**：資料庫（期程、學校帳號、登入狀態、操作紀錄），資料表定義在 `migrations/`
- **靜態網頁**：`public/`（`common.js` 為各頁共用的工具與左側選單；`app.js` 期程頁、`observations.js` 公開觀課頁、`team.js` 計畫成員頁）

## 修改與上線

```
npm install          # 第一次需要
npm run dev          # 本機測試：http://localhost:8787（本機資料庫，與正式站分開）
npm run deploy       # 發佈到 Cloudflare
git add . && git commit -m "說明" && git push   # 程式碼存到 GitHub
```

本機測試的秘密變數放在 `.dev.vars`（`ADMIN_PASSWORD=...`、`PASSWORD_KEY=...`，不會上傳）。

## 管理者密碼

- 第一次登入時，會用 Cloudflare 秘密變數 `ADMIN_PASSWORD` 建立 `admin` 帳號；之後請在網站「帳號與權限」修改。
- 忘記密碼：清除管理者資料後重新以 `ADMIN_PASSWORD` 登入
  ```
  npx wrangler secret put ADMIN_PASSWORD
  npx wrangler d1 execute school-schedule --remote --command "DELETE FROM admin; DELETE FROM sessions WHERE role='owner'"
  ```

## 計畫成員

- 計畫主持人、協同主持人兩份名單，登入後按「新增名單」選擇身分（校長、主任、組長、教師、職員）並輸入姓名；按「編輯」可修改身分、姓名或改放另一份名單。
- 未登入者看到的姓名中間字打碼；學校端只能刪除自己新增的名單，管理者可刪除全部。

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

## 常見修改

地點選項與類別定義在 `src/worker.js` 與 `public/app.js` 開頭的 `LOCATIONS`、`CATEGORIES`，兩邊需一致。
