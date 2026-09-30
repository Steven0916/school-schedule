# AI 導入示範學校｜期程統整

統整會議、工作、觀課計畫與重要行事的期程網站。沒有任何外部套件，只需 Node.js 18 以上。

## 啟動

```
node server.js
```

開啟 http://localhost:3000 。第一次啟動會在終端機顯示管理者帳號（`admin`）與隨機密碼，登入後請到「帳號與權限」修改。

## 環境變數

| 變數 | 說明 | 預設 |
| --- | --- | --- |
| `PORT` | 連接埠 | `3000` |
| `DATA_DIR` | 資料存放資料夾 | `./data` |
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
