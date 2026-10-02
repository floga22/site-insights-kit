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
  roaming       INTEGER             -- 1 = device previously seen on a work network, now on home/mobile
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
  meta       TEXT                   -- JSON
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
  lib_version   TEXT
);
CREATE INDEX IF NOT EXISTS idx_tm_sid ON thumbmark_visits(sid);
CREATE INDEX IF NOT EXISTS idx_tm_tm ON thumbmark_visits(tm_visitor_id);
CREATE INDEX IF NOT EXISTS idx_tm_fp ON thumbmark_visits(fp_visitor_id);
