-- 計畫成員：計畫主持人、協同主持人

CREATE TABLE team_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role TEXT NOT NULL,
  name TEXT NOT NULL,
  created_by_school TEXT,
  created_by_member_id INTEGER,
  created_at TEXT NOT NULL
);
