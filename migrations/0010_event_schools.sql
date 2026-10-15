-- 期程的參與學校（JSON 陣列，可複選：石榴國中、東榮國中、永慶高中）
ALTER TABLE events ADD COLUMN schools TEXT NOT NULL DEFAULT '[]';
