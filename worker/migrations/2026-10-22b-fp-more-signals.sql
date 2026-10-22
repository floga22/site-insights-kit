-- Kit 1.5.1: more Fingerprint Server API fields (VPN/proxy/tampering detail, blocklist, velocity). Run once after the 1.5.0 migration.
-- Safe to run before deploying the new Worker: the old Worker ignores the new columns.
ALTER TABLE visits ADD COLUMN vpn_confidence TEXT;
ALTER TABLE visits ADD COLUMN vpn_ml REAL;
ALTER TABLE visits ADD COLUMN vpn_methods TEXT;
ALTER TABLE visits ADD COLUMN vpn_origin_country TEXT;
ALTER TABLE visits ADD COLUMN vpn_origin_tz TEXT;
ALTER TABLE visits ADD COLUMN proxy_confidence TEXT;
ALTER TABLE visits ADD COLUMN proxy_ml REAL;
ALTER TABLE visits ADD COLUMN tamper_ml REAL;
ALTER TABLE visits ADD COLUMN tamper_confidence TEXT;
ALTER TABLE visits ADD COLUMN attack_source INTEGER;
ALTER TABLE visits ADD COLUMN email_spam INTEGER;
ALTER TABLE visits ADD COLUMN asn_type TEXT;
ALTER TABLE visits ADD COLUMN fp_datacenter INTEGER;
ALTER TABLE visits ADD COLUMN velocity TEXT;
ALTER TABLE visits ADD COLUMN replayed INTEGER;
ALTER TABLE visits ADD COLUMN sdk_version TEXT;
