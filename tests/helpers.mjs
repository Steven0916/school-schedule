// 測試共用設定：只會連到本機測試伺服器，絕不連正式網站。
import fs from 'node:fs';

export const B = process.env.TEST_BASE || 'http://localhost:8787';
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(B)) {
  throw new Error(`測試只能連到本機伺服器，收到：${B}`);
}

// 本機管理者密碼放在專案根目錄的 .dev.vars（不會上傳到 GitHub）
const devVars = fs.readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8');
export const pw = devVars.match(/^ADMIN_PASSWORD=(.*)$/m)?.[1].trim();
if (!pw) throw new Error('.dev.vars 裡找不到 ADMIN_PASSWORD');
