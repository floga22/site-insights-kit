-- Kit 1.5.0: newer Fingerprint v4 fields plus the AI-crawler log. Run once in the D1 console on an install created before 1.5.0.
-- Safe to run before deploying the new Worker: the old Worker ignores the new columns and table.
ALTER TABLE visits ADD COLUMN bot_category TEXT;
ALTER TABLE visits ADD COLUMN bot_provider TEXT;
ALTER TABLE visits ADD COLUMN bot_name TEXT;
ALTER TABLE visits ADD COLUMN bot_identity TEXT;
ALTER TABLE visits ADD COLUMN proxy_type TEXT;
ALTER TABLE visits ADD COLUMN proxy_provider TEXT;
ALTER TABLE visits ADD COLUMN tamper_score REAL;
ALTER TABLE visits ADD COLUMN anti_detect INTEGER;
ALTER TABLE visits ADD COLUMN rare_device INTEGER;
ALTER TABLE visits ADD COLUMN dev_tools INTEGER;
ALTER TABLE visits ADD COLUMN privacy_settings INTEGER;
ALTER TABLE visits ADD COLUMN high_activity INTEGER;

CREATE TABLE IF NOT EXISTS crawler_hits (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, site TEXT, ua_family TEXT, category TEXT, ua TEXT, ip TEXT, asn INTEGER, as_org TEXT, country TEXT, path TEXT, status INTEGER, source TEXT);
CREATE INDEX IF NOT EXISTS idx_crawler_ts ON crawler_hits(ts);
CREATE INDEX IF NOT EXISTS idx_crawler_family ON crawler_hits(ua_family, category);
