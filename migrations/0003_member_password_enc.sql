-- 學校端密碼加密副本（AES-GCM，金鑰為 Cloudflare 秘密變數 PASSWORD_KEY），讓管理者可查看
ALTER TABLE members ADD COLUMN password_enc TEXT;
