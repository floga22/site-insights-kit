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
