-- Kit 1.4.0: link IDs. Run once in the D1 console on an install created before 1.4.0.
-- Safe to run before deploying the new Worker: the old Worker ignores the new columns.
ALTER TABLE visits ADD COLUMN link_id TEXT;
ALTER TABLE visits ADD COLUMN ga_client_id TEXT;
ALTER TABLE visits ADD COLUMN clarity_user_id TEXT;
ALTER TABLE visits ADD COLUMN clarity_session_id TEXT;
ALTER TABLE thumbmark_visits ADD COLUMN event_id TEXT;
ALTER TABLE thumbmark_visits ADD COLUMN link_id TEXT;
ALTER TABLE events ADD COLUMN event_id TEXT;
ALTER TABLE events ADD COLUMN link_id TEXT;

CREATE INDEX IF NOT EXISTS idx_visits_sid ON visits(sid);
CREATE INDEX IF NOT EXISTS idx_visits_link ON visits(link_id);
CREATE INDEX IF NOT EXISTS idx_tm_link ON thumbmark_visits(link_id);
CREATE INDEX IF NOT EXISTS idx_tm_event ON thumbmark_visits(event_id);
CREATE INDEX IF NOT EXISTS idx_events_link ON events(link_id);
CREATE INDEX IF NOT EXISTS idx_events_event ON events(event_id);

-- Optional backfill: attach existing Thumbmark rows to the page view they belong to (same session and page, within 30 seconds).
UPDATE thumbmark_visits SET event_id = (
  SELECT v.event_id FROM visits v
  WHERE v.sid = thumbmark_visits.sid AND v.path = thumbmark_visits.path
    AND ABS(strftime('%s', v.ts) - strftime('%s', thumbmark_visits.ts)) <= 30
  ORDER BY ABS(strftime('%s', v.ts) - strftime('%s', thumbmark_visits.ts)), v.ts LIMIT 1)
WHERE event_id IS NULL;

-- Then create the two views: copy the "CREATE VIEW IF NOT EXISTS visit_links" and "identity_links" statements from schema.sql.


-- Cloudflare WAF events (blocks, challenges, bypasses, AI Labyrinth), filled by the Worker cron job
CREATE TABLE IF NOT EXISTS waf_events (id INTEGER PRIMARY KEY AUTOINCREMENT, event_key TEXT UNIQUE, ts TEXT NOT NULL, country TEXT, action TEXT, rule TEXT, service TEXT, ip TEXT, host TEXT, path TEXT, source TEXT);
CREATE INDEX IF NOT EXISTS idx_waf_ts ON waf_events(ts);
CREATE INDEX IF NOT EXISTS idx_waf_country ON waf_events(country, action);
