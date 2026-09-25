# Setup

Each account belongs to the site owner. Send only the **public** values to whoever maintains the site.

## 1. Google Analytics 4
1. Go to analytics.google.com → Admin → Create → Property. Add a **Web** data stream for your domain.
2. Copy the **Measurement ID** (`G-…`) → `ga4` in the config.
3. Admin → Data collection → turn **off** Google signals (prevents hidden data at low traffic).
4. Admin → Data retention → set to **14 months**.

## 2. Microsoft Clarity
1. Go to clarity.microsoft.com, sign in, and create a project for your site.
2. Settings → Overview → copy the **Project ID** → `clarity` in the config.
3. Settings → Setup → connect Google Analytics, if you use GA4. Replay links then appear in GA4.

## 3. Google Search Console
1. Go to search.google.com/search-console → Add property → Domain.
2. Verify by adding the TXT record it gives you at your domain registrar (or Cloudflare DNS).
3. In GA4: Admin → Product links → Search Console links → link it.

## 4. Fingerprint
The kit uses Fingerprint's JavaScript agent **v4**.
1. In dashboard.fingerprint.com → API keys, copy the **Public** key → `fingerprint.key`.
2. Note your region (US, EU, or Asia) → `fingerprint.region` (`us`, `eu`, `ap`).
3. Recommended: **Subdomains → Add** a custom subdomain on your own domain (e.g. `metrics.yourdomain.com`).
   Add the DNS records it shows (Cloudflare one-click works) and keep them **DNS only**.
   When it shows Active, set `fingerprint.endpoint` to `https://metrics.yourdomain.com`.
   This keeps ad blockers from blocking the agent.
4. Security → Request filtering: allow only your domain(s), so no one else can use your public key.
5. If using the Worker: create a **Secret** API key (Server API v4). Enter it only in Cloudflare (step 5).
   Bot, VPN, proxy, and other Smart Signals depend on your Fingerprint plan; on plans without them,
   those fields stay empty and everything else still works.

## 5. Cloudflare Worker
All in the Cloudflare dashboard, no command line needed.

**Database**
1. Storage & Databases → D1 → Create → name it `site-insights`.
2. Open it → Console → paste the contents of `worker/schema.sql` → Execute.

**Worker**
1. Workers & Pages → Create → Worker → name it `site-insights` → Deploy.
2. Edit code → replace everything with `worker/src/index.js` → Deploy.
3. Settings → Bindings → Add → D1 database → Variable name `DB` → select `site-insights`.
4. Settings → Variables and Secrets → add:
   - `ALLOWED_ORIGINS` (Text): `https://yourdomain.com,https://www.yourdomain.com`
   - `FP_REGION` (Text): `us`
   - `FP_SECRET` (**Secret**): your Fingerprint secret key
5. Copy the Worker's URL (`https://site-insights.<you>.workers.dev`) → `worker` in the config.

**Viewing data:** D1 → `site-insights` → Console. Ready-made queries are in `worker/queries.sql`.

## Network labels
| Label | Meaning |
|---|---|
| `home` | Residential ISP (Comcast, AT&T, Spectrum…) |
| `office` | Business ISP line or an unrecognized owner, often a company network. Check `as_org`. |
| `work-device (gateway)` | Corporate security gateway (Zscaler, Netskope…). Almost certainly a managed work machine. |
| `mobile` | Mobile carrier |
| `vpn/hosting` | Consumer VPN, proxy, Tor, or cloud/hosting provider (bots and scrapers usually land here) |
| `unknown` | No network owner available |

Labels are estimates. A work laptop on home Wi-Fi without a corporate gateway looks like `home`.
Large tech companies (e.g. Microsoft) share networks with their cloud services and may show as `vpn/hosting`.
`roaming = 1` means a device first seen on a work network later appeared on home or mobile.
