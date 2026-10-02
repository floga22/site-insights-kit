-- site-insights-kit: owner exclusion (REPORTING ONLY).
-- Your own visits are still collected, so demos and testing keep working. These views just hide them from reports.
-- Run once in the D1 console. Safe to re-run. Add your own rows at the bottom; do not commit real IPs or device IDs.

CREATE TABLE IF NOT EXISTS owner_devices (
  visitor_id TEXT PRIMARY KEY,
  label      TEXT NOT NULL,                       -- owner | family | test
  note       TEXT,
  added_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS owner_ips (
  ip       TEXT PRIMARY KEY,
  note     TEXT,
  added_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Every device that is yours: the ones you listed, plus any device ever seen on one of your IPs.
-- That is how a phone is still recognised on cellular or public WiFi: it was seen at home once.
CREATE VIEW IF NOT EXISTS owner_all_devices AS
  SELECT visitor_id FROM owner_devices
  UNION
  SELECT DISTINCT visitor_id FROM visits
  WHERE visitor_id IS NOT NULL AND ip IN (SELECT ip FROM owner_ips);

-- Browser sessions that are yours (a tab first opened at home stays hidden after you leave).
CREATE VIEW IF NOT EXISTS owner_sessions AS
  SELECT DISTINCT sid FROM visits
  WHERE sid IS NOT NULL
    AND (ip IN (SELECT ip FROM owner_ips) OR visitor_id IN (SELECT visitor_id FROM owner_all_devices));

-- Report from these instead of the raw tables.
CREATE VIEW IF NOT EXISTS visits_reporting AS
  SELECT * FROM visits
  WHERE COALESCE(ip, '')         NOT IN (SELECT ip FROM owner_ips)
    AND COALESCE(visitor_id, '') NOT IN (SELECT visitor_id FROM owner_all_devices)
    AND COALESCE(sid, '')        NOT IN (SELECT sid FROM owner_sessions);

CREATE VIEW IF NOT EXISTS events_reporting AS
  SELECT * FROM events
  WHERE COALESCE(visitor_id, '') NOT IN (SELECT visitor_id FROM owner_all_devices)
    AND COALESCE(sid, '')        NOT IN (SELECT sid FROM owner_sessions);

CREATE VIEW IF NOT EXISTS thumbmark_visits_reporting AS
  SELECT * FROM thumbmark_visits
  WHERE COALESCE(fp_visitor_id, '') NOT IN (SELECT visitor_id FROM owner_all_devices)
    AND COALESCE(sid, '')           NOT IN (SELECT sid FROM owner_sessions);

-- Audit: devices hidden only because they were seen on an owner IP (not listed by hand). Check this now and then.
CREATE VIEW IF NOT EXISTS owner_review AS
  SELECT v.visitor_id, v.ip, v.network_label, v.as_org, COUNT(*) AS visits, MAX(v.ts) AS last_seen
  FROM visits v
  WHERE v.visitor_id IN (SELECT visitor_id FROM owner_all_devices)
    AND v.visitor_id NOT IN (SELECT visitor_id FROM owner_devices)
  GROUP BY v.visitor_id, v.ip, v.network_label, v.as_org;

-- ---- Add your own rows (examples; replace the values) ----
-- Only add a network that is yours alone. Never add cellular or public-WiFi IPs: many strangers share them.
-- INSERT OR IGNORE INTO owner_ips (ip, note) VALUES ('203.0.113.10', 'home');
-- INSERT OR IGNORE INTO owner_devices (visitor_id, label, note) VALUES ('YOUR_VISITOR_ID', 'owner', 'my laptop');
