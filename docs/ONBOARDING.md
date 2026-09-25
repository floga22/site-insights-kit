# Onboarding a new site

Send this to the site owner. They create their own accounts, so their visitor data stays theirs.

## Pick your modules
- [ ] **Google Analytics**: traffic sources and trends (recommended)
- [ ] **Microsoft Clarity**: session replays and heatmaps (recommended)
- [ ] **Fingerprint**: returning-device recognition and bot/VPN detection
- [ ] **Network and clickstream log** (Cloudflare): home vs. office vs. mobile, full click history. Requires Fingerprint for best results.

## Send back only these
| Item | Where to find it | Safe to share? |
|---|---|---|
| GA4 Measurement ID (`G-…`) | GA4 → Admin → Data streams | Yes, public |
| Clarity Project ID | Clarity → Settings → Overview | Yes, public |
| Fingerprint public key + region | Fingerprint → API keys | Yes, public |
| Worker URL | Cloudflare → Workers | Yes, public |
| Contact email for the privacy notice | — | Yes |
| Audience: mostly US, or EU/UK too? | — | Decides the `consent` setting |

**Never send:** passwords, the Fingerprint **secret** key, or any Cloudflare API token.
The secret key is entered directly into Cloudflare (see SETUP.md, step 5). If you need help,
add the maintainer as a member of your Cloudflare account instead of sharing keys.

## Consent setting
- `"none"`: mostly US audience, no banner, privacy link in footer.
- `"eu-only"`: banner shown to visitors in European time zones.
- `"all"`: banner shown to everyone.
Not legal advice. Businesses with meaningful EU traffic should check with counsel.
