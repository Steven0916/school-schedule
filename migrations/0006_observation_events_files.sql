-- 觀課填報自動建立的期程（events.observation_id 指回觀課紀錄）
ALTER TABLE events ADD COLUMN observation_id INTEGER;

-- 觀課附件：檔案內容存在 Workers KV（binding FILES），這裡只存資訊
CREATE TABLE observation_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  observation_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  kv_key TEXT NOT NULL,
  created_by_school TEXT,
  created_by_member_id INTEGER,
  created_at TEXT NOT NULL
);
CREATE INDEX observation_files_obs ON observation_files (observation_id, id);
