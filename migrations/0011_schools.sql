-- 學校與縣市設定：全站的學校選項（地點、參與學校、服務學校）都從這裡讀取
CREATE TABLE schools (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  county TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

-- 先放入目前使用中的三所學校（縣市依計畫成員資料），之後由管理者在網站上維護
INSERT INTO schools (name, county, sort_order, created_at) VALUES
  ('石榴國中', '雲林縣', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('東榮國中', '嘉義縣', 2, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('永慶高中', '嘉義縣', 3, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
