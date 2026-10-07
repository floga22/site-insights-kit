-- Richer WAF events: user agent, network, method and response status.
-- Run once in the D1 console BEFORE deploying the matching Worker. Skip any line that errors with "duplicate column".
ALTER TABLE waf_events ADD COLUMN user_agent TEXT;
ALTER TABLE waf_events ADD COLUMN asn INTEGER;
ALTER TABLE waf_events ADD COLUMN asn_desc TEXT;
ALTER TABLE waf_events ADD COLUMN method TEXT;
ALTER TABLE waf_events ADD COLUMN status INTEGER;
