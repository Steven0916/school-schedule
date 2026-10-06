-- 公開觀課填報

CREATE TABLE observations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  subject TEXT NOT NULL,
  designer TEXT NOT NULL,
  grade INTEGER NOT NULL,
  class_name TEXT NOT NULL,
  students INTEGER NOT NULL,
  periods INTEGER NOT NULL,
  minutes INTEGER NOT NULL,
  unit TEXT NOT NULL,
  modes TEXT NOT NULL DEFAULT '[]', -- JSON 陣列，六大 AI 教學應用模式
  created_by_school TEXT,
  created_by_member_id INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT,
  deleted_at TEXT
);
CREATE INDEX observations_date ON observations (date, id);
