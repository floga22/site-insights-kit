-- Handy queries for the D1 console.

-- Recent visits with network context
SELECT ts, visitor_id, network_label, as_org, city, country, vpn, bot, prior_visits, path
FROM visits ORDER BY ts DESC LIMIT 50;

-- Each device: how often, from which kinds of networks
SELECT visitor_id, COUNT(*) AS visits, GROUP_CONCAT(DISTINCT network_label) AS networks,
       GROUP_CONCAT(DISTINCT as_org) AS owners, MIN(ts) AS first_seen, MAX(ts) AS last_seen
FROM visits GROUP BY visitor_id ORDER BY last_seen DESC;

-- Organizations (non-residential networks) that visited
SELECT as_org, COUNT(DISTINCT visitor_id) AS devices, COUNT(*) AS visits, MAX(ts) AS last_seen
FROM visits WHERE network_label IN ('office','work-device (gateway)')
GROUP BY as_org ORDER BY last_seen DESC;

-- Full clickstream for one device (replace the id)
SELECT ts, type, path, target, meta FROM events
WHERE visitor_id = 'PASTE_VISITOR_ID' ORDER BY ts;

-- Suspicious traffic
SELECT ts, visitor_id, as_org, bot, vpn, tor, tampering, id_mismatch FROM visits
WHERE bot = 'bad' OR tor = 1 OR tampering = 1 OR id_mismatch = 1 ORDER BY ts DESC;

-- Fingerprint vs Thumbmark verdicts, same page load
SELECT v.ts, v.path, v.visitor_id AS fp_id, t.tm_visitor_id AS tm_id,
       v.bot AS fp_bot, t.bot AS tm_bot, v.vpn AS fp_vpn, t.vpn AS tm_vpn, t.datacenter AS tm_datacenter, t.danger_level
FROM visits v JOIN thumbmark_visits t ON t.sid = v.sid AND t.path = v.path
ORDER BY v.ts DESC LIMIT 50;

-- Do the two vendors agree on device identity? A Fingerprint ID mapping to several Thumbmark IDs (or the reverse) is a split.
SELECT fp_visitor_id, COUNT(DISTINCT tm_visitor_id) AS thumbmark_ids, COUNT(*) AS visits
FROM thumbmark_visits WHERE fp_visitor_id IS NOT NULL GROUP BY fp_visitor_id ORDER BY thumbmark_ids DESC;
SELECT tm_visitor_id, COUNT(DISTINCT fp_visitor_id) AS fingerprint_ids, COUNT(*) AS visits
FROM thumbmark_visits WHERE fp_visitor_id IS NOT NULL GROUP BY tm_visitor_id ORDER BY fingerprint_ids DESC;

-- Where the vendors disagree on bot or VPN
SELECT v.ts, v.visitor_id, v.as_org, v.bot AS fp_bot, t.bot AS tm_bot, v.vpn AS fp_vpn, t.vpn AS tm_vpn
FROM visits v JOIN thumbmark_visits t ON t.sid = v.sid AND t.path = v.path
WHERE (v.bot = 'bad') <> (t.bot = 1) OR v.vpn IS NOT t.vpn ORDER BY v.ts DESC;

-- Linked IDs (kit 1.4.0)
-- Every device with all the other IDs seen alongside it
SELECT * FROM identity_links ORDER BY last_seen DESC LIMIT 50;
-- One page view with its Thumbmark result, GA4 client and Clarity IDs
SELECT ts, path, link_id, event_id, visitor_id, tm_visitor_id, tm_hash, ga_client_id, clarity_user_id, clarity_session_id, tm_link
FROM visit_links ORDER BY ts DESC LIMIT 50;
-- Fingerprint and Thumbmark disagreeing about bots or VPNs on the same page view
SELECT ts, path, visitor_id, bot AS fp_bot, tm_bot, vpn AS fp_vpn, tm_vpn FROM visit_links
WHERE tm_row_id IS NOT NULL AND ((bot = 'bad') <> (tm_bot = 1) OR (vpn = 1) <> (tm_vpn = 1)) ORDER BY ts DESC LIMIT 50;
