-- 計畫成員的服務學校（既有資料為空字串，編輯時補填）
ALTER TABLE team_members ADD COLUMN school TEXT NOT NULL DEFAULT '';
