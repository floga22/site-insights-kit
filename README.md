# site-insights-kit

A small, reusable kit for deep, per-visit insight on low-traffic websites, built on free tiers.
One script (`insights.js`) plus a per-site config block. Any tool whose ID you leave out stays off.

| Module | What it answers | Where data lives |
|---|---|---|
| Google Analytics 4 | How visitors arrived: referrers, campaigns, search, conversions over time | Google |
| Microsoft Clarity | What they did: session replays, heatmaps, scroll depth, rage clicks | Microsoft |
| Fingerprint | Is this a returning device? Bot, VPN, incognito, tampering | Fingerprint |
| Thumbmark | A second device ID to compare with Fingerprint; bot, VPN, datacenter, threat level | Thumbmark |
| Cloudflare Worker + D1 | Home, office, work device, mobile, or VPN; full clickstream per device | Your Cloudflare account |

The Fingerprint `visitorId` and the Worker's network label are tagged into Clarity, so you can
filter replays by device, network type, or threat signal, and jump from a suspicious visit to its replay.

## Quick start
1. Create the accounts you want and collect the IDs. See [docs/SETUP.md](docs/SETUP.md).
2. Paste [templates/config-snippet.html](templates/config-snippet.html) into each page's `<head>` and fill in your IDs.
3. (Optional) Deploy the Worker. See [docs/SETUP.md](docs/SETUP.md#cloudflare-worker).
4. Mark conversion links with `data-track="name"`, e.g. `<a data-track="book_call">`.
   Typeform embeds: add `data-tf-on-submit="insightsTypeformSubmit"`.
5. Exclude yourself: open the site once per browser with `?insights=owner` (`?insights=reset` to undo).

Setting it up for someone else? See [docs/ONBOARDING.md](docs/ONBOARDING.md).

## Security
- This repo contains no IDs, keys, or passwords.
- Public IDs (GA4, Clarity, Fingerprint public key, Thumbmark key) go in each site's HTML. Lock the Thumbmark and Fingerprint keys to your domains in their consoles. They're visible in page source by design.
- The Fingerprint **secret** key lives only as an encrypted Cloudflare Worker secret.
- The Worker only accepts requests from domains listed in `ALLOWED_ORIGINS`.
- Visitor data is stored in each site owner's own accounts, never in this repo.

## Privacy
A "Privacy" link is added to the site footer. It opens a notice written automatically from the
modules that are switched on. Set `consent` to `"eu-only"` or `"all"` to require opt-in before anything loads.

## Versions
Sites load a pinned version from jsDelivr (for example `@v1.4.0`), so updates here never change a live site
until its version number is changed.

## License
No license is granted. Copyright (c) 2026 floga22. All rights reserved. Contact the author for permission to use, copy, modify or distribute this code.

## Changelog
- **1.4.0**: One random link ID per page view, sent to Fingerprint (`linkedId` and `tags`), Thumbmark (`metadata`), GA4 and Clarity, and stored in D1 on `visits`, `thumbmark_visits` and `events`. GA4 client ID and Clarity user and session IDs are stored with each visit. Thumbmark rows now carry the Fingerprint event ID, so each page view has one Thumbmark record. New `visit_links` and `identity_links` views. Existing installs: run `worker/migrations/2026-10-07-link-id.sql`, then redeploy the Worker.
- **1.3.0**: Optional Thumbmark module (`thumbmark.key`): second device ID, bot/VPN/datacenter/threat verdicts, tagged into
  Clarity and GA4 (`thumbmark_id`, `tm_identified`) and stored in a new `thumbmark_visits` D1 table through a new Worker
  `/thumbmark` route. Library pinned with an SRI hash; its telemetry is off by default. **Existing installs:** run the new
  table block from `worker/schema.sql` and redeploy the Worker before enabling the module.
- **1.2.0**: With Fingerprint enabled, GA4 now receives the visitor ID as the `fingerprint_id` user property
  and an `fp_identified` event (`fingerprint_id`, `fp_event_id`).
- **1.1.0**: Fingerprint JS agent v4 and Server API v4, custom subdomain support (`fingerprint.endpoint`),
  owner exclusion switch, Typeform submit conversions, Suspect Score.
- **1.0.0**: Initial release.
