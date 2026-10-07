-- site-insights-kit D1 schema. Paste into the D1 console and run once.

CREATE TABLE IF NOT EXISTS visits (
  event_id      TEXT PRIMARY KEY,   -- Fingerprint event_id (one per page load)
  ts            TEXT NOT NULL,      -- UTC ISO timestamp
  site          TEXT,
  sid           TEXT,               -- browser-tab session id (joins to events.sid)
  visitor_id    TEXT,               -- Fingerprint visitorId (stable per device)
  path          TEXT,
  ip            TEXT,
  asn           INTEGER,
  as_org        TEXT,               -- network owner, e.g. "Comcast Cable", "Zscaler"
  network_label TEXT,               -- home | office | work-device (gateway) | mobile | vpn/hosting | unknown
  country       TEXT, region TEXT, city TEXT, timezone TEXT,
  work_hours    INTEGER,            -- 1 = weekday 8am-6pm in visitor's timezone
  vpn INTEGER, proxy INTEGER, tor INTEGER, incognito INTEGER, tampering INTEGER,
  bot           TEXT,               -- notDetected | good | bad
  vm            INTEGER,
  suspect_score REAL,               -- Fingerprint Suspect Score, if your plan includes it
  id_mismatch   INTEGER,            -- 1 = page-sent visitorId didn't match Fingerprint's server record
  prior_visits  INTEGER,
  roaming       INTEGER,             -- 1 = device previously seen on a work network, now on home/mobile
  link_id            TEXT,           -- random per-page-view code, shared with Fingerprint, Thumbmark, GA4 and Clarity
  ga_client_id       TEXT,           -- GA4 client ID at the time of the visit
  clarity_user_id    TEXT,
  clarity_session_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_visits_visitor ON visits(visitor_id);
CREATE INDEX IF NOT EXISTS idx_visits_ts ON visits(ts);

CREATE TABLE IF NOT EXISTS events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ts         TEXT NOT NULL,
  site       TEXT,
  sid        TEXT,
  visitor_id TEXT,
  type       TEXT,                  -- pageview | click | scroll | leave
  path       TEXT,
  target     TEXT,
  meta       TEXT,                   -- JSON
  event_id   TEXT,                  -- Fingerprint event_id of the page view
  link_id    TEXT                   -- per-page-view link code
);
CREATE INDEX IF NOT EXISTS idx_events_sid ON events(sid);
CREATE INDEX IF NOT EXISTS idx_events_visitor ON events(visitor_id);

-- Thumbmark (optional second device ID). Values are reported by the visitor's browser: use for comparison, not enforcement.
-- Existing installs: run just this block in the D1 console. NULL = Thumbmark did not report that signal.
CREATE TABLE IF NOT EXISTS thumbmark_visits (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  ts            TEXT NOT NULL,
  site          TEXT,
  sid           TEXT,               -- joins to visits.sid and events.sid
  path          TEXT,
  fp_visitor_id TEXT,               -- Fingerprint visitorId for the same page load, if it resolved
  tm_visitor_id TEXT,               -- Thumbmark visitorId
  thumbmark     TEXT,               -- 32-char device hash
  bot INTEGER, vpn INTEGER, tor INTEGER, datacenter INTEGER,
  danger_level  REAL,               -- Thumbmark 0-5 threat level
  uniqueness    REAL,               -- how distinctive the device looks (not a re-identification accuracy)
  country       TEXT,
  asn           INTEGER,
  is_new        INTEGER,
  first_seen    TEXT,
  last_seen     TEXT,
  tz_mismatch   INTEGER,            -- 1 = browser timezone doesn't match IP country
  lib_version   TEXT,
  event_id      TEXT,               -- Fingerprint event_id of the same page view (joins to visits.event_id)
  link_id       TEXT                -- per-page-view link code (joins to visits.link_id)
);
CREATE INDEX IF NOT EXISTS idx_tm_sid ON thumbmark_visits(sid);
CREATE INDEX IF NOT EXISTS idx_tm_tm ON thumbmark_visits(tm_visitor_id);
CREATE INDEX IF NOT EXISTS idx_tm_fp ON thumbmark_visits(fp_visitor_id);

-- Link IDs (kit 1.4.0)
CREATE INDEX IF NOT EXISTS idx_visits_sid ON visits(sid);
CREATE INDEX IF NOT EXISTS idx_visits_link ON visits(link_id);
CREATE INDEX IF NOT EXISTS idx_tm_link ON thumbmark_visits(link_id);
CREATE INDEX IF NOT EXISTS idx_tm_event ON thumbmark_visits(event_id);
CREATE INDEX IF NOT EXISTS idx_events_link ON events(link_id);
CREATE INDEX IF NOT EXISTS idx_events_event ON events(event_id);

-- One row per page view with its Thumbmark result attached (matched by link_id, else Fingerprint event_id).
CREATE VIEW IF NOT EXISTS visit_links AS
SELECT v.*, t.id AS tm_row_id, t.tm_visitor_id, t.thumbmark AS tm_hash, t.bot AS tm_bot, t.vpn AS tm_vpn, t.tor AS tm_tor,
  t.datacenter AS tm_datacenter, t.danger_level AS tm_danger, t.uniqueness AS tm_uniqueness, t.is_new AS tm_is_new,
  t.country AS tm_country, t.tz_mismatch AS tm_tz_mismatch, t.lib_version AS tm_lib_version,
  CASE WHEN t.id IS NULL THEN NULL WHEN t.link_id IS NOT NULL AND t.link_id = v.link_id THEN 'link_id' ELSE 'event_id' END AS tm_link
FROM visits v
LEFT JOIN thumbmark_visits t ON t.id = (
  SELECT MIN(t2.id) FROM thumbmark_visits t2
  WHERE (v.link_id IS NOT NULL AND t2.link_id = v.link_id) OR (v.event_id IS NOT NULL AND t2.event_id = v.event_id));

-- One row per Fingerprint device with every other ID seen alongside it.
CREATE VIEW IF NOT EXISTS identity_links AS
SELECT visitor_id AS fp_visitor_id, GROUP_CONCAT(DISTINCT tm_visitor_id) AS tm_visitor_ids, GROUP_CONCAT(DISTINCT tm_hash) AS tm_hashes,
  GROUP_CONCAT(DISTINCT ga_client_id) AS ga_client_ids, GROUP_CONCAT(DISTINCT clarity_user_id) AS clarity_user_ids,
  COUNT(DISTINCT sid) AS sessions, COUNT(*) AS page_views, SUM(tm_row_id IS NOT NULL) AS page_views_with_tm,
  MIN(ts) AS first_seen, MAX(ts) AS last_seen
FROM visit_links WHERE visitor_id IS NOT NULL GROUP BY visitor_id;


-- Cloudflare WAF events (blocks, challenges, bypasses, AI Labyrinth), filled by the Worker cron job
CREATE TABLE IF NOT EXISTS waf_events (id INTEGER PRIMARY KEY AUTOINCREMENT, event_key TEXT UNIQUE, ts TEXT NOT NULL, country TEXT, action TEXT, rule TEXT, service TEXT, ip TEXT, host TEXT, path TEXT, source TEXT);
CREATE INDEX IF NOT EXISTS idx_waf_ts ON waf_events(ts);
CREATE INDEX IF NOT EXISTS idx_waf_country ON waf_events(country, action);
