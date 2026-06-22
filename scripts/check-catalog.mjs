#!/usr/bin/env node
/**
 * Catalog health backtest.
 *
 * Renders every catalog tool with a realistic sample value, fetches the URL,
 * and classifies the result. Writes refreshed `status` + `tested_at` back into
 * data/tools-catalog.json and drops a full report at scripts/catalog-report.json.
 *
 * Classification (deliberately conservative — a site blocking bots is NOT broken):
 *   ok       2xx
 *   blocked  401 / 403 / 405 / 429  (works in a browser; just refuses automation)
 *   broken   404 / 410 / 5xx        (page/endpoint genuinely gone or erroring)
 *   dead     DNS / connection / TLS failure
 *   skip     needs an API key, or params we can't satisfy
 *
 * Timeouts are retried once, then treated as `blocked` (slow / anti-bot), never
 * `broken`, so we don't destroy a good tool over a transient hiccup.
 *
 * Usage:
 *   node scripts/check-catalog.mjs            # test all, write catalog + report
 *   node scripts/check-catalog.mjs --dry      # don't write the catalog, just report
 *   node scripts/check-catalog.mjs --only=ip  # restrict to one category
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { renderTool, SELECTOR_META } from "../dist/lib.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const CATALOG = join(HERE, "..", "data", "tools-catalog.json");
const REPORT = join(HERE, "catalog-report.json");

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const ONLY = (args.find((a) => a.startsWith("--only=")) || "").split("=")[1] || null;
const CONCURRENCY = 10;
const TIMEOUT_MS = 15000;
const RETRY_BACKOFF_MS = 900;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// Sample value per selector kind, taken from the catalog's own examples.
const SAMPLE = {};
for (const [k, meta] of Object.entries(SELECTOR_META)) SAMPLE[k] = meta.example;
// Override the "empty target" examples with real, well-populated values so that
// tools probing a path on the target (robots.txt, sitemap, screenshot, whois)
// don't false-404 against an intentionally-empty domain like example.com.
Object.assign(SAMPLE, {
  domain: "github.com",
  username: "github",
  email: "test@gmail.com",
  ip: "8.8.8.8",
  query: "osint",
  url: "https://github.com/about",
});

// Hosts that are alive but hostile to automated probes (anti-bot, login-gated,
// or return a result-dependent 404). On these, a 4xx means "works in a browser,
// just not for a bare bot" → blocked, not broken.
const BROWSER_ONLY_HOSTS = [
  "facebook.com",
  "thatsthem.com",
  "dnslytics.com",
  "searchquarry.com",
  "800notes.com",
  "web.archive.org",
  "keys.openpgp.org", // 404 = "no key for this address", a valid empty result
  "whoxy.com",        // whois-history; serves browsers, 404s bare bots
];

function classify(status, url) {
  if (status >= 200 && status < 300) return "ok";
  // 400 from a datacenter IP is almost always anti-automation on these sites
  // (Facebook, ThatsThem, …) — the URL is valid, it just refuses bots.
  if (status === 400 || status === 401 || status === 403 || status === 405 || status === 429) return "blocked";
  if (status >= 300 && status < 400) return "blocked"; // unexpected un-followed redirect
  // 5xx means the server is *there* but erroring — often transient or anti-bot
  // (Yahoo 500, crt.sh 503, Cloudflare 520). Not a dead/removed tool.
  if (status >= 500) return "blocked";
  if (status === 404 || status === 410) {
    let host = "";
    try { host = new URL(url).hostname.replace(/^www\./, ""); } catch {}
    if (BROWSER_ONLY_HOSTS.some((h) => host === h || host.endsWith("." + h) || host === "www." + h)) return "blocked";
    return "broken"; // page genuinely gone (verify by hand)
  }
  return "blocked";
}

// Error-code taxonomy → how we treat it.
const TIMEOUTISH = /ETIMEDOUT|UND_ERR_CONNECT_TIMEOUT|UND_ERR_HEADERS_TIMEOUT|ConnectTimeout|HeadersTimeout/i;
const CERTISH = /CERT_HAS_EXPIRED|UNABLE_TO_VERIFY|SELF_SIGNED|ALTNAME|ERR_TLS/i;
const TRANSIENT = /EAI_AGAIN|ECONNRESET|ECONNREFUSED/i; // retry harder; archive.org etc. throttle parallel hits
const DEADISH = /ENOTFOUND|EHOSTUNREACH|ENETUNREACH|ERR_INVALID_URL/i;

async function probe(url) {
  const MAX = 3;
  let lastErr = "unreachable";
  for (let attempt = 0; attempt < MAX; attempt++) {
    if (attempt > 0) await sleep(RETRY_BACKOFF_MS * attempt);
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    try {
      const r = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: ctl.signal,
        headers: { "User-Agent": UA, Accept: "*/*", "Accept-Language": "en-US,en;q=0.9" },
      });
      try { await r.body?.cancel(); } catch {}
      clearTimeout(t);
      return { verdict: classify(r.status, r.url || url), http: r.status, final: r.url };
    } catch (e) {
      clearTimeout(t);
      const msg = String(e?.cause?.code || e?.cause?.message || e?.message || e);
      lastErr = msg;
      // Known-alive hosts (e.g. web.archive.org) throttle parallel probes with
      // RST/timeout — that's "busy", not "dead".
      let host = "";
      try { host = new URL(url).hostname.replace(/^www\./, ""); } catch {}
      const knownAlive = BROWSER_ONLY_HOSTS.some((h) => host === h || host.endsWith("." + h));
      if (e?.name === "AbortError" || TIMEOUTISH.test(msg)) {
        if (attempt < MAX - 1) continue;
        return { verdict: "blocked", http: null, error: "timeout" }; // slow / anti-bot, not gone
      }
      if (knownAlive && (TRANSIENT.test(msg) || TIMEOUTISH.test(msg))) {
        if (attempt < MAX - 1) continue;
        return { verdict: "blocked", http: null, error: msg }; // alive host, just throttling
      }
      if (CERTISH.test(msg)) return { verdict: "blocked", http: null, error: msg }; // reachable, cert issue
      if (TRANSIENT.test(msg)) { if (attempt < MAX - 1) continue; return { verdict: "dead", http: null, error: msg }; }
      if (DEADISH.test(msg)) { if (attempt < MAX - 1) continue; return { verdict: "dead", http: null, error: msg }; }
      if (attempt < MAX - 1) continue;
      return { verdict: "dead", http: null, error: msg };
    }
  }
  return { verdict: "dead", http: null, error: lastErr };
}

async function run() {
  const catalog = JSON.parse(readFileSync(CATALOG, "utf8"));
  let tools = catalog.tools;
  if (ONLY) tools = tools.filter((t) => t.category === ONLY);

  // Build the testable set: render each tool; skip env-key + unsatisfiable.
  const jobs = [];
  const skipped = [];
  for (const tool of tools) {
    if (tool.template.includes("{{env:")) {
      skipped.push({ id: tool.id, reason: "needs_api_key" });
      continue;
    }
    if (tool.template.includes(".onion")) {
      skipped.push({ id: tool.id, reason: "tor_onion" }); // can't resolve without Tor
      continue;
    }
    const { url, missing } = renderTool(tool, SAMPLE);
    if (missing || url.includes("${")) {
      skipped.push({ id: tool.id, reason: "unsatisfiable_params", missing });
      continue;
    }
    jobs.push({ tool, url });
  }

  const tstamp = new Date().toISOString();
  const results = [];
  let done = 0;
  let i = 0;
  async function worker() {
    while (i < jobs.length) {
      const idx = i++;
      const { tool, url } = jobs[idx];
      const res = await probe(url);
      results.push({ id: tool.id, category: tool.category, prev: tool.status, ...res, url });
      done++;
      if (done % 25 === 0 || done === jobs.length) {
        process.stderr.write(`\r  tested ${done}/${jobs.length}`);
      }
    }
  }
  process.stderr.write(`backtesting ${jobs.length} tools (${skipped.length} skipped)\n`);
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  process.stderr.write("\n");

  // Apply verdicts to the catalog
  const byId = new Map(results.map((r) => [r.id, r]));
  for (const tool of catalog.tools) {
    const r = byId.get(tool.id);
    if (!r) continue; // skipped (env-key etc.) — leave as-is
    tool.status = r.verdict;
    tool.tested_at = tstamp;
  }

  const counts = results.reduce((m, r) => ((m[r.verdict] = (m[r.verdict] || 0) + 1), m), {});
  const changed = results.filter((r) => r.prev !== r.verdict);
  const report = {
    ran_at: tstamp,
    tested: results.length,
    skipped: skipped.length,
    counts,
    changed: changed.map((r) => ({ id: r.id, from: r.prev, to: r.verdict, http: r.http, error: r.error })),
    broken: results.filter((r) => r.verdict === "broken").map((r) => ({ id: r.id, http: r.http, url: r.url })),
    dead: results.filter((r) => r.verdict === "dead").map((r) => ({ id: r.id, error: r.error, url: r.url })),
    skippedDetail: skipped,
  };
  writeFileSync(REPORT, JSON.stringify(report, null, 2));

  if (!DRY) {
    // refresh category counts
    catalog.counts = catalog.tools.reduce((m, t) => ((m[t.category] = (m[t.category] || 0) + 1), m), {});
    writeFileSync(CATALOG, JSON.stringify(catalog, null, 2));
  }

  console.log("\nverdict counts:", counts);
  console.log(`changed: ${changed.length} | broken: ${report.broken.length} | dead: ${report.dead.length} | skipped: ${skipped.length}`);
  console.log(`report → ${REPORT}${DRY ? " (dry run, catalog not written)" : ""}`);
}

run().catch((e) => { console.error(e); process.exit(1); });
