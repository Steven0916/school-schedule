-- 計畫成員身分：校長、主任、教師、職員（既有資料為空字串，編輯時補選）
ALTER TABLE team_members ADD COLUMN title TEXT NOT NULL DEFAULT '';
