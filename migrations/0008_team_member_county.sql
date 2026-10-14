-- 計畫成員所屬縣市：雲林縣、嘉義縣（既有資料為空字串，編輯時補選）
ALTER TABLE team_members ADD COLUMN county TEXT NOT NULL DEFAULT '';
