-- 計畫成員刪除改為移至回收區（可復原）
ALTER TABLE team_members ADD COLUMN deleted_at TEXT;
