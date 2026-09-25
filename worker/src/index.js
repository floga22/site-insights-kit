/**
 * site-insights-kit — Cloudflare Worker
 *
 * POST /enrich   { site, eventId, visitorId, sid, path }
 *   Looks up Fingerprint Smart Signals server-side (secret key never reaches the browser),
 *   classifies the visitor's network (home / office / work-device gateway / mobile / vpn-hosting),
 *   stores the visit in D1, and returns a small profile for tagging in Clarity.
 *
 * POST /collect  { site, sid, visitorId, events: [...] }
 *   Stores clickstream events in D1.
 *
 * Required settings (Cloudflare dashboard → Worker → Settings):
 *   Binding   DB               D1 database created from schema.sql
 *   Secret    FP_SECRET        Fingerprint secret API key (optional; without it, network data only)
 *   Variable  FP_REGION        us | eu | ap   (default us)
 *   Variable  ALLOWED_ORIGINS  comma-separated, e.g. https://example.com,https://www.example.com
 */

const FP_HOSTS = { us: "https://api.fpjs.io", eu: "https://eu.api.fpjs.io", ap: "https://ap.api.fpjs.io" };

// Fingerprint Server API v4 returns flat fields; older shapes nest them as { data: { result } }.
const pick = (v) => (v && typeof v === "object" ? v.result ?? v.data?.result ?? null : v ?? null);

// Network-owner patterns. Order matters: gateway is checked before hosting.
const GATEWAY = /zscaler|netskope|cisco umbrella|opendns|palo alto|prisma|forcepoint|iboss|menlo security|cato networks|skyhigh|mcafee|symantec|broadcom|versa networks|checkpoint|check point/i;
const MOBILE = /t-mobile|verizon wireless|cellco|at&t mobility|mobility|sprint|us cellular|cricket|boost|vodafone|telcel|movistar|claro|orange mobile|ee limited|wireless/i;
const RESIDENTIAL = /comcast|charter|spectrum|cox commun|at&t|att-internet|verizon|frontier|centurylink|lumen|windstream|brightspeed|altice|optimum|suddenlink|mediacom|google fiber|rcn|wideopenwest|astound|sonic|ziply|consolidated|tds telecom|hughes|viasat|starlink|space exploration|rogers|bell canada|shaw|telus|videotron|virgin media|sky uk|british telecom|bt public|talktalk|deutsche telekom|telefonica|telmex|izzi|totalplay|cantv|intercable|netuno/i;
const HOSTING = /amazon|aws|google cloud|google llc|microsoft|azure|digitalocean|linode|akamai|ovh|hetzner|oracle|vultr|choopa|m247|datacamp|leaseweb|contabo|scaleway|alibaba|tencent|hostinger|ionos|godaddy|namecheap|packethub|cdn77|quadranet|colocrossing|psychz|servers\.com|cloudflare|hurricane electric/i;
const BUSINESS_ISP = /business|enterprise|corporate/i;

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
    const originOk = allowed.includes(origin);
    const cors = {
      "Access-Control-Allow-Origin": originOk ? origin : "null",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
      Vary: "Origin",
    };

    if (request.method === "OPTIONS") return new Response(null, { status: originOk ? 204 : 403, headers: cors });
    if (!originOk) return json({ error: "origin not allowed" }, 403, cors);
    if (request.method !== "POST") return json({ error: "method not allowed" }, 405, cors);

    const path = new URL(request.url).pathname;
    let body;
    try {
      body = JSON.parse(await request.text());
    } catch {
      return json({ error: "bad json" }, 400, cors);
    }

    try {
      if (path === "/enrich") return json(await enrich(body, request, env), 200, cors);
      if (path === "/collect") return json(await collect(body, env), 200, cors);
      return json({ error: "not found" }, 404, cors);
    } catch (e) {
      return json({ error: "server error", detail: String(e && e.message) }, 500, cors);
    }
  },
};

function json(data, status, headers) {
  return new Response(JSON.stringify(data), { status, headers: { ...headers, "Content-Type": "application/json" } });
}

const clip = (v, n = 200) => (v == null ? null : String(v).slice(0, n));

// ---------------- /enrich ----------------
async function enrich(b, request, env) {
  const cf = request.cf || {};
  const ip = request.headers.get("CF-Connecting-IP");
  const asOrg = cf.asOrganization || null;

  // 1) Fingerprint Smart Signals via Server API v4 (optional; some signals depend on your plan)
  const eventId = b.eventId || b.requestId;
  let ev = null;
  if (env.FP_SECRET && eventId) {
    const host = FP_HOSTS[(env.FP_REGION || "us").toLowerCase()] || FP_HOSTS.us;
    const r = await fetch(`${host}/v4/events/${encodeURIComponent(eventId)}`, {
      headers: { Authorization: `Bearer ${env.FP_SECRET}` },
    });
    if (r.ok) ev = await r.json();
  }
  const botRaw = pick(ev?.bot);
  const sig = {
    fpVisitorId: ev?.identification?.visitor_id ?? null,
    vpn: pick(ev?.vpn),
    proxy: pick(ev?.proxy),
    tor: pick(ev?.tor),
    incognito: pick(ev?.incognito),
    tampering: pick(ev?.tampering),
    bot: botRaw == null ? null : String(botRaw).replace("not_detected", "notDetected"),
    vm: pick(ev?.virtual_machine),
    suspectScore: typeof ev?.suspect_score === "number" ? ev.suspect_score : null,
  };
  // Guard against spoofed requests: the server-confirmed visitorId must match what the page sent
  const idMismatch = sig.fpVisitorId && b.visitorId && sig.fpVisitorId !== b.visitorId;

  // 2) Network classification
  const label = classify(asOrg, sig);

  // 3) Local time in the visitor's timezone
  const workHours = isWorkHours(cf.timezone);

  // 4) History for this device
  let priorVisits = 0;
  let roaming = false;
  if (env.DB && b.visitorId) {
    const prior = await env.DB.prepare(
      "SELECT network_label, COUNT(*) AS n FROM visits WHERE visitor_id = ? GROUP BY network_label"
    ).bind(b.visitorId).all();
    const rows = prior.results || [];
    priorVisits = rows.reduce((s, r) => s + r.n, 0);
    const seenWork = rows.some((r) => r.network_label === "office" || r.network_label === "work-device (gateway)");
    roaming = seenWork && (label === "home" || label === "mobile");
  }

  const profile = {
    label,
    asOrg,
    asn: cf.asn || null,
    country: cf.country || null,
    region: cf.region || null,
    city: cf.city || null,
    timezone: cf.timezone || null,
    workHours,
    ...sig,
    idMismatch: !!idMismatch,
    priorVisits,
    roaming,
  };

  if (env.DB) {
    await env.DB.prepare(
      `INSERT OR REPLACE INTO visits
       (event_id, ts, site, sid, visitor_id, path, ip, asn, as_org, network_label, country, region, city, timezone,
        work_hours, vpn, proxy, tor, incognito, tampering, bot, vm, suspect_score, id_mismatch, prior_visits, roaming)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(
      clip(eventId || crypto.randomUUID(), 80), new Date().toISOString(), clip(b.site, 100), clip(b.sid, 80),
      clip(b.visitorId, 80), clip(b.path), ip, profile.asn, asOrg, label, profile.country, profile.region,
      profile.city, profile.timezone, b01(workHours), b01(sig.vpn), b01(sig.proxy), b01(sig.tor),
      b01(sig.incognito), b01(sig.tampering), sig.bot, b01(sig.vm), sig.suspectScore, b01(idMismatch), priorVisits, b01(roaming)
    ).run();
  }

  return profile;
}

const b01 = (v) => (v === true ? 1 : v === false ? 0 : null);

function classify(org, sig) {
  const o = org || "";
  if (GATEWAY.test(o)) return "work-device (gateway)";
  if (sig.tor) return "vpn/hosting";
  if (HOSTING.test(o)) return "vpn/hosting";
  if (sig.vpn || sig.proxy) return "vpn/hosting";
  if (MOBILE.test(o)) return "mobile";
  if (BUSINESS_ISP.test(o)) return "office"; // e.g. "Comcast Business", "Verizon Business"
  if (RESIDENTIAL.test(o)) return "home";
  if (o) return "office"; // unrecognized owner: often a company network, sometimes a small ISP — check the owner name
  return "unknown";
}

function isWorkHours(tz) {
  if (!tz) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "numeric", hour12: false })
      .formatToParts(new Date());
    const wd = parts.find((p) => p.type === "weekday").value;
    const hr = parseInt(parts.find((p) => p.type === "hour").value, 10);
    return !["Sat", "Sun"].includes(wd) && hr >= 8 && hr < 18;
  } catch {
    return null;
  }
}

// ---------------- /collect ----------------
async function collect(b, env) {
  if (!env.DB) return { stored: 0 };
  const events = Array.isArray(b.events) ? b.events.slice(0, 100) : [];
  if (!events.length) return { stored: 0 };
  const stmt = env.DB.prepare(
    "INSERT INTO events (ts, site, sid, visitor_id, type, path, target, meta) VALUES (?,?,?,?,?,?,?,?)"
  );
  await env.DB.batch(
    events.map((e) =>
      stmt.bind(
        new Date(Number(e.t) || Date.now()).toISOString(),
        clip(b.site, 100), clip(b.sid, 80), clip(b.visitorId, 80),
        clip(e.type, 30), clip(e.path), clip(e.target), clip(e.meta ? JSON.stringify(e.meta) : null, 2000)
      )
    )
  );
  return { stored: events.length };
}
