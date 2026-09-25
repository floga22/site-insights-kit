/*!
 * site-insights-kit — insights.js
 * One reusable engine. Each site supplies window.INSIGHTS_CONFIG; any module
 * whose ID is missing is skipped. No IDs or keys live in this file.
 * MIT License.
 */
(function () {
  "use strict";

  var VERSION = "1.1.0";
  var cfg = window.INSIGHTS_CONFIG || {};
  var CONSENT_KEY = "insights_consent";
  var started = false;

  // ---------- small helpers ----------
  function log() {
    if (cfg.debug && window.console) console.log.apply(console, ["[insights]"].concat([].slice.call(arguments)));
  }
  function loadScript(src, attrs) {
    var s = document.createElement("script");
    s.async = true;
    s.src = src;
    if (attrs) for (var k in attrs) s.setAttribute(k, attrs[k]);
    document.head.appendChild(s);
    return s;
  }
  function clarity() {
    if (cfg.clarity && typeof window.clarity === "function") window.clarity.apply(null, arguments);
  }
  function gtag() {
    if (cfg.ga4 && typeof window.gtag === "function") window.gtag.apply(null, arguments);
  }
  function tag(key, value) {
    if (value === undefined || value === null || value === "") return;
    clarity("set", key, String(value));
  }
  function workerUrl(path) {
    return cfg.worker ? cfg.worker.replace(/\/+$/, "") + path : null;
  }
  function sessionId() {
    try {
      var id = sessionStorage.getItem("insights_sid");
      if (!id) {
        id = Math.random().toString(36).slice(2) + Date.now().toString(36);
        sessionStorage.setItem("insights_sid", id);
      }
      return id;
    } catch (e) {
      return "nostorage";
    }
  }

  // ---------- consent ----------
  // cfg.consent: "none" (load immediately), "eu-only" (ask EU/UK visitors), "all" (ask everyone)
  function inConsentRegion() {
    var mode = cfg.consent || "none";
    if (mode === "all") return true;
    if (mode !== "eu-only") return false;
    try {
      var tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
      return /^Europe\/|^Atlantic\/(Reykjavik|Canary|Madeira|Azores)/.test(tz);
    } catch (e) {
      return false;
    }
  }
  function storedConsent() {
    try { return localStorage.getItem(CONSENT_KEY); } catch (e) { return null; }
  }
  function saveConsent(v) {
    try { localStorage.setItem(CONSENT_KEY, v); } catch (e) {}
  }

  // ---------- owner switch ----------
  // Visit any page with ?insights=owner to exclude this browser from all tracking;
  // ?insights=reset turns tracking back on.
  var OWNER_KEY = "insights_owner";
  function ownerCheck() {
    var q = new URLSearchParams(location.search).get("insights");
    try {
      if (q === "owner") { localStorage.setItem(OWNER_KEY, "1"); toast("Tracking is off for this browser."); }
      if (q === "reset") { localStorage.removeItem(OWNER_KEY); toast("Tracking is back on for this browser."); }
      return localStorage.getItem(OWNER_KEY) === "1";
    } catch (e) { return false; }
  }
  function toast(msg) {
    injectStyles();
    var t = document.createElement("div");
    t.className = "ins-banner";
    t.setAttribute("role", "status");
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 4000);
  }

  // ---------- module: GA4 ----------
  function startGA4() {
    if (!cfg.ga4) return;
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
    window.gtag("consent", "default", {
      analytics_storage: "granted",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied"
    });
    window.gtag("js", new Date());
    window.gtag("config", cfg.ga4, { allow_google_signals: false });
    loadScript("https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(cfg.ga4));
    log("GA4 started");
  }

  // ---------- module: Microsoft Clarity ----------
  function startClarity() {
    if (!cfg.clarity) return;
    (function (c, a) {
      c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments); };
    })(window, "clarity");
    loadScript("https://www.clarity.ms/tag/" + encodeURIComponent(cfg.clarity));
    window.clarity("consentv2", { ad_Storage: "denied", analytics_Storage: "granted" });

    // Acquisition tags so replays can be filtered by source
    var p = new URLSearchParams(location.search);
    ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"].forEach(function (k) {
      tag(k, p.get(k));
    });
    var ref = "direct";
    try { if (document.referrer) ref = new URL(document.referrer).hostname; } catch (e) {}
    tag("referrer_domain", ref);
    tag("kit_version", VERSION);
    log("Clarity started");
  }

  // ---------- module: Fingerprint + Worker enrichment ----------
  function startFingerprint() {
    var fp = cfg.fingerprint;
    if (!fp || !fp.key) return;
    // JS agent v4. With a custom subdomain, the agent and its requests go through your own domain.
    var base = fp.endpoint ? fp.endpoint.replace(/\/+$/, "") : null;
    var src = fp.scriptUrl || (base ? base + "/web/v4/" : "https://fpjscdn.net/v4/") + encodeURIComponent(fp.key);
    var opts = {};
    if (base) opts.endpoints = [base];
    if (fp.region) opts.region = fp.region;

    import(src)
      .then(function (FP) { return FP.start(opts); })
      .then(function (agent) { return agent.get(); })
      .then(function (r) {
        var visitorId = r.visitor_id || r.visitorId;
        var eventId = r.event_id || r.requestId;
        window.INSIGHTS_VISITOR = { visitorId: visitorId, eventId: eventId };
        clarity("identify", visitorId, null, null, "FP-" + String(visitorId).slice(0, 6));
        tag("Fingerprint_ID", visitorId);
        tag("FP_Event_ID", eventId);
        if (r.suspect_score !== undefined) tag("FP_Suspect_Score", r.suspect_score);
        stream.visitorId = visitorId;
        log("Fingerprint", visitorId, eventId);
        return enrich({ visitorId: visitorId, eventId: eventId });
      })
      .catch(function (e) {
        tag("Fingerprint_ID", "error");
        tag("FP_Error", (e && (e.code || e.message)) || e);
        log("Fingerprint error", e);
      });
  }

  function enrich(r) {
    var url = workerUrl("/enrich");
    if (!url) return;
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        site: cfg.site || location.hostname,
        eventId: r.eventId,
        visitorId: r.visitorId,
        sid: sessionId(),
        path: location.pathname
      })
    })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (d) {
        if (!d) return;
        tag("network_label", d.label);
        tag("network_owner", d.asOrg);
        tag("country", d.country);
        tag("local_time", d.workHours ? "work-hours" : "off-hours");
        tag("vpn", d.vpn);
        tag("proxy", d.proxy);
        tag("tor", d.tor);
        tag("bot", d.bot);
        tag("incognito", d.incognito);
        tag("tampering", d.tampering);
        tag("prior_visits", d.priorVisits);
        if (d.roaming) tag("roaming", "work-device-seen-on-other-network");
        if (d.bot === "bad" || d.tampering === true) clarity("upgrade", "suspicious");
        window.INSIGHTS_PROFILE = d;
        log("Enriched", d);
      })
      .catch(function (e) { log("Enrich failed", e); });
  }

  // ---------- module: clickstream ----------
  var stream = { queue: [], visitorId: null, scrolls: {}, t0: Date.now() };

  function push(type, target, meta) {
    if (!cfg.clickstream || !cfg.worker) return;
    stream.queue.push({
      t: Date.now(),
      type: type,
      path: location.pathname,
      target: target || null,
      meta: meta || null
    });
    if (stream.queue.length >= 20) flush();
  }

  function flush() {
    var url = workerUrl("/collect");
    if (!url || !stream.queue.length) return;
    var body = JSON.stringify({
      site: cfg.site || location.hostname,
      sid: sessionId(),
      visitorId: stream.visitorId,
      events: stream.queue.splice(0, 100)
    });
    // text/plain avoids a CORS preflight, so the beacon survives page unload
    var blob = new Blob([body], { type: "text/plain" });
    if (!(navigator.sendBeacon && navigator.sendBeacon(url, blob))) {
      fetch(url, { method: "POST", body: body, keepalive: true }).catch(function () {});
    }
  }

  function describe(el) {
    var txt = (el.getAttribute("aria-label") || el.innerText || el.value || "").replace(/\s+/g, " ").trim();
    if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") txt = ""; // never capture typed text
    return {
      tag: el.tagName.toLowerCase(),
      id: el.id || null,
      text: txt.slice(0, 60) || null,
      href: el.getAttribute("href") || null,
      track: el.getAttribute("data-track") || null
    };
  }

  function startClickstream() {
    var p = new URLSearchParams(location.search);
    push("pageview", null, {
      title: document.title,
      referrer: document.referrer || null,
      utm_source: p.get("utm_source"),
      utm_medium: p.get("utm_medium"),
      utm_campaign: p.get("utm_campaign"),
      viewport: window.innerWidth + "x" + window.innerHeight
    });

    window.addEventListener("scroll", function () {
      var h = document.documentElement;
      var pct = Math.round(((h.scrollTop + window.innerHeight) / h.scrollHeight) * 100);
      [25, 50, 75, 100].forEach(function (m) {
        if (pct >= m && !stream.scrolls[m]) {
          stream.scrolls[m] = true;
          push("scroll", null, { depth: m });
        }
      });
    }, { passive: true });

    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") {
        push("leave", null, { seconds_on_page: Math.round((Date.now() - stream.t0) / 1000) });
        flush();
      }
    });
    window.addEventListener("pagehide", flush);
    setInterval(flush, 15000);
  }

  // ---------- conversions ----------
  // Fire from anywhere: Insights.convert("name"). GA4 also gets its standard generate_lead event.
  function convert(name, params) {
    if (!started) return; // no consent, or owner browser
    gtag("event", name, params || {});
    if (/submit|lead/.test(name)) gtag("event", "generate_lead", { method: name });
    clarity("event", name);
    clarity("upgrade", name);
    push("conversion", name, params || null);
    flush();
  }
  // Typeform embeds: add data-tf-on-submit="insightsTypeformSubmit" to the embed div.
  window.insightsTypeformSubmit = function (ev) {
    convert("typeform_submitted", { form_id: ev && ev.formId });
  };

  // ---------- conversion + click tracking (all modules) ----------
  function startClickTracking() {
    document.addEventListener("click", function (ev) {
      var el = ev.target.closest ? ev.target.closest("a,button,[data-track],input[type=submit]") : null;
      if (!el) return;
      var d = describe(el);
      var name = d.track;
      if (name) {
        gtag("event", name, { link_text: d.text, link_url: d.href });
        clarity("event", name);
      } else if (d.href && /^https?:/.test(d.href) && d.href.indexOf(location.hostname) === -1) {
        clarity("event", "outbound_click");
      }
      push("click", d.track || d.id || d.text, d);
    }, true);
  }

  // ---------- privacy footer + overlay ----------
  function privacyText() {
    var owner = cfg.ownerName || "the site owner";
    var items = [];
    if (cfg.ga4) items.push("<strong>Google Analytics</strong> records pages viewed, how you arrived (referring site or campaign link), approximate location, and device type. It uses cookies.");
    if (cfg.clarity) items.push("<strong>Microsoft Clarity</strong> records clicks, scrolling, and mouse movement as session replays and heatmaps. Text you type is masked. It uses cookies.");
    if (cfg.fingerprint && cfg.fingerprint.key) items.push("<strong>Fingerprint</strong> creates a device identifier from browser and device characteristics to recognize returning devices and detect bots, VPNs, and automated traffic.");
    if (cfg.worker) items.push("<strong>Network and activity log</strong> stores your IP address, network provider, approximate location" + (cfg.clickstream ? ", and the pages and links you click" : "") + " in a private database controlled by " + owner + ".");
    var contact = cfg.contactEmail
      ? ' To ask a question or request deletion of data about your visit, email <a href="mailto:' + cfg.contactEmail + '">' + cfg.contactEmail + "</a>."
      : "";
    return (
      "<h2 id='insights-privacy-title'>Privacy</h2>" +
      "<p>This site uses the following tools to understand how visitors find and use it:</p>" +
      "<ul>" + items.map(function (i) { return "<li>" + i + "</li>"; }).join("") + "</ul>" +
      "<p>This information is not sold or used for advertising." + contact + "</p>"
    );
  }

  function injectStyles() {
    if (document.getElementById("insights-style")) return;
    var css =
      ".ins-overlay{position:fixed;inset:0;background:rgba(20,24,31,.55);display:flex;align-items:center;justify-content:center;padding:1rem;z-index:2147483000}" +
      ".ins-panel{font:inherit;color:var(--insights-text,#1d232b);background:var(--insights-bg,#fff);max-width:36rem;width:100%;max-height:85vh;overflow:auto;border-radius:10px;padding:1.5rem 1.75rem;box-shadow:0 12px 40px rgba(0,0,0,.25);line-height:1.55}" +
      ".ins-panel h2{margin:0 0 .75rem;font-size:1.25rem}.ins-panel li{margin:.5rem 0}.ins-panel a{color:var(--insights-accent,#1f5fa8)}" +
      ".ins-actions{display:flex;gap:.5rem;justify-content:flex-end;margin-top:1rem;flex-wrap:wrap}" +
      ".ins-btn{font:inherit;border:1px solid var(--insights-accent,#1f5fa8);background:transparent;color:var(--insights-accent,#1f5fa8);padding:.5rem 1rem;border-radius:6px;cursor:pointer}" +
      ".ins-btn.primary{background:var(--insights-accent,#1f5fa8);color:#fff}" +
      ".ins-btn:focus-visible,.ins-link:focus-visible{outline:2px solid var(--insights-accent,#1f5fa8);outline-offset:2px}" +
      ".ins-banner{position:fixed;left:1rem;right:1rem;bottom:1rem;max-width:40rem;margin:0 auto;font:inherit;background:var(--insights-bg,#fff);color:var(--insights-text,#1d232b);border-radius:10px;padding:1rem 1.25rem;box-shadow:0 8px 30px rgba(0,0,0,.2);z-index:2147483000;line-height:1.5}" +
      ".ins-link{font:inherit;background:none;border:0;padding:0;color:inherit;text-decoration:underline;cursor:pointer}";
    var s = document.createElement("style");
    s.id = "insights-style";
    s.textContent = css;
    document.head.appendChild(s);
  }

  function openPrivacy() {
    injectStyles();
    var prev = document.activeElement;
    var o = document.createElement("div");
    o.className = "ins-overlay";
    o.innerHTML =
      "<div class='ins-panel' role='dialog' aria-modal='true' aria-labelledby='insights-privacy-title'>" +
      privacyText() +
      "<div class='ins-actions'><button type='button' class='ins-btn primary' data-close>Close</button></div></div>";
    function close() { o.remove(); document.removeEventListener("keydown", onKey); if (prev) prev.focus(); }
    function onKey(e) { if (e.key === "Escape") close(); }
    o.addEventListener("click", function (e) { if (e.target === o || e.target.hasAttribute("data-close")) close(); });
    document.addEventListener("keydown", onKey);
    document.body.appendChild(o);
    o.querySelector("[data-close]").focus();
  }

  function mountPrivacyLink() {
    // Put <span id="insights-privacy"></span> in your footer to control placement;
    // otherwise the link is appended to the first <footer>.
    var host = document.getElementById("insights-privacy") || document.querySelector("footer");
    if (!host || host.querySelector(".ins-link")) return;
    injectStyles();
    var b = document.createElement("button");
    b.type = "button";
    b.className = "ins-link";
    b.textContent = cfg.privacyLabel || "Privacy";
    b.addEventListener("click", openPrivacy);
    host.appendChild(b);
  }

  function showBanner() {
    injectStyles();
    var b = document.createElement("div");
    b.className = "ins-banner";
    b.setAttribute("role", "region");
    b.setAttribute("aria-label", "Privacy choices");
    b.innerHTML =
      "<p style='margin:0'>This site uses analytics, session recording, and device recognition to understand visits. " +
      "<button type='button' class='ins-link' data-more>See details</button></p>" +
      "<div class='ins-actions'><button type='button' class='ins-btn' data-no>Decline</button>" +
      "<button type='button' class='ins-btn primary' data-yes>Accept</button></div>";
    b.querySelector("[data-more]").addEventListener("click", openPrivacy);
    b.querySelector("[data-no]").addEventListener("click", function () { saveConsent("denied"); b.remove(); });
    b.querySelector("[data-yes]").addEventListener("click", function () { saveConsent("granted"); b.remove(); start(); });
    document.body.appendChild(b);
  }

  // ---------- boot ----------
  function start() {
    if (started) return;
    started = true;
    startGA4();
    startClarity();
    startClickTracking();
    if (cfg.clickstream) startClickstream();
    startFingerprint();
  }

  function boot() {
    mountPrivacyLink();
    if (ownerCheck()) { window.insightsTypeformSubmit = function () {}; return log("Owner browser: tracking off"); }
    var choice = storedConsent();
    if (!inConsentRegion() || choice === "granted") return start();
    if (choice === "denied") return;
    showBanner();
  }

  window.Insights = { version: VERSION, openPrivacy: openPrivacy, start: start, convert: convert };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
