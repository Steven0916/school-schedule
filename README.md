# AI 導入示範學校｜期程統整

統整會議、工作、觀課計畫與重要行事的期程網站。需要 Node.js 18 以上；唯一套件是 `pg`（連接 PostgreSQL 用）。

## 啟動

```
npm install
node server.js
```

開啟 http://localhost:3000 。第一次啟動會在終端機顯示管理者帳號（`admin`）與隨機密碼，登入後請到「帳號與權限」修改。

## 公開上線（Render + Neon，免費）

1. 到 [Neon](https://neon.tech) 建立專案（Region 選 Singapore），複製 **Connection string**（`postgresql://...`）。
2. 到 [Render](https://render.com) → **New → Blueprint** → 選這個 GitHub 儲存庫，它會讀取 `render.yaml`。
3. 填入環境變數：`DATABASE_URL` = 步驟 1 的字串；`ADMIN_PASSWORD` = 自訂管理者密碼（至少 9 字元）。
4. 按 **Apply**，完成後網址為 `https://school-schedule-xxxx.onrender.com`。

之後每次 `git push`，Render 會自動重新部署；資料存在 Neon，不會因重新部署而消失。免費方案閒置 15 分鐘後會休眠，下次開啟需等約 30–50 秒。

## 環境變數

| 變數 | 說明 | 預設 |
| --- | --- | --- |
| `PORT` | 連接埠 | `3000` |
| `DATABASE_URL` | PostgreSQL 連線字串；有設定就改用資料庫儲存 | 未設定（用檔案） |
| `DATA_DIR` | 資料存放資料夾（未設 `DATABASE_URL` 時） | `./data` |
| `ADMIN_PASSWORD` | 第一次建立資料時的管理者密碼 | 隨機產生 |
| `COOKIE_SECURE` | 設為 `1` 時 Cookie 只走 HTTPS | 未設定 |

忘記管理者密碼：`node server.js --reset-admin 新密碼`

## 權限

- **公開瀏覽**：看期程清單與已完成工作。
- **學校端**：新增期程；只能刪除／復原自己新增的項目。
- **管理者**：新增、編輯、確認完成、刪除／復原所有期程，並管理學校端帳號。

## 檔案

- `server.js`：伺服器與 API（資料存在 `data/db.json`，請定期備份）
- `public/`：網頁（`index.html`、`app.js`、`login.html`、`login.js`、`style.css`）

地點選項與類別定義在 `server.js` 與 `public/app.js` 開頭的 `LOCATIONS`、`CATEGORIES`，兩邊需一致。
