/**
 * Pivot engine — selector enrichment via free, no-auth public APIs.
 *
 * Many useful starting points (a handle, a domain, an IP) aren't directly
 * "traceable" on their own. This module turns those into richer facts by
 * querying free public JSON APIs, then BFS-expands the discovered facts one
 * or two hops further (e.g. username → email → name).
 *
 * Hard rules:
 *   - Only endpoints that return JSON we can parse server-side.
 *   - Never anything that needs a paid key.
 *   - Never anything that requires a real browser (JS render).
 *   - Hard timeout per fetch (8s). Failures are silent → step.status = no_data.
 *   - Total chain capped (max steps + max BFS depth) to avoid unbounded fan-out.
 */

import { createHash } from "node:crypto";

export type PivotKind =
  | "email"
  | "phone"
  | "name"
  | "address"
  | "username"
  | "domain"
  | "ip"
  | "url";

export type PivotFact = {
  kind: PivotKind;
  value: string;
  source: string; // provider id, optionally with → arrow for derived
  confidence: number; // 0..1
  detail?: string;
};

export type PivotStep = {
  provider: string;
  input: { kind: PivotKind; value: string };
  status: "ok" | "no_data" | "error" | "skipped";
  facts: PivotFact[];
  duration_ms: number;
  error?: string;
  raw_keys?: string[]; // top-level keys we saw, for transparency
};

export type TraceableKind = "email" | "phone" | "name" | "address";

export type PivotResult = {
  seed: { kind: PivotKind; value: string };
  chain: PivotStep[];
  facts: PivotFact[]; // deduped union
  traceableSeeds: { kind: TraceableKind; value: string; source: string; confidence: number }[];
  duration_ms: number;
};

const FETCH_TIMEOUT = 8000;
const MAX_STEPS = 14;
const MAX_DEPTH = 2;
const MIN_TRACEABLE_CONFIDENCE = 0.6;

const USER_AGENT = "osint-toolkit/1.0 (+https://github.com)";

/* ------------------------------------------------------------------ helpers */

async function fetchJson(url: string, init: RequestInit = {}): Promise<unknown | null> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), FETCH_TIMEOUT);
  try {
    const r = await fetch(url, {
      ...init,
      signal: ctl.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json, */*",
        ...(init.headers as Record<string, string> | undefined),
      },
    });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function md5(s: string) {
  return createHash("md5").update(s.trim().toLowerCase()).digest("hex");
}

function asObj<T>(x: unknown): T | undefined {
  return x && typeof x === "object" ? (x as T) : undefined;
}

function asStr(x: unknown): string | undefined {
  return typeof x === "string" && x.trim() ? x.trim() : undefined;
}

/* --------------------------------------------------------------- providers */

type Provider = (value: string) => Promise<PivotStep>;

/** GitHub user → email/name/blog/location/twitter handle. */
const githubUser: Provider = async (username) => {
  const start = Date.now();
  const data = (await fetchJson(`https://api.github.com/users/${encodeURIComponent(username)}`)) as
    | Record<string, unknown>
    | null;
  if (!data) return step("github", "username", username, "no_data", [], Date.now() - start);
  const facts: PivotFact[] = [];
  const email = asStr(data.email);
  if (email) facts.push({ kind: "email", value: email, source: "github", confidence: 0.95 });
  const name = asStr(data.name);
  if (name) facts.push({ kind: "name", value: name, source: "github", confidence: 0.85 });
  const blog = asStr(data.blog);
  if (blog) {
    facts.push({ kind: "url", value: blog, source: "github", confidence: 0.8 });
    const dom = extractHost(blog);
    if (dom) facts.push({ kind: "domain", value: dom, source: "github→blog", confidence: 0.75 });
  }
  const loc = asStr(data.location);
  if (loc) facts.push({ kind: "address", value: loc, source: "github", confidence: 0.65, detail: "location string (city/region)" });
  const twitter = asStr(data.twitter_username);
  if (twitter) facts.push({ kind: "username", value: twitter, source: "github→twitter", confidence: 0.85, detail: "linked Twitter" });
  const company = asStr(data.company);
  if (company) facts.push({ kind: "name", value: company.replace(/^@/, ""), source: "github", confidence: 0.5, detail: "company / org" });
  return step("github", "username", username, facts.length ? "ok" : "no_data", facts, Date.now() - start, Object.keys(data));
};

/** Gravatar by email md5 → name, location, accounts on other platforms. */
const gravatarEmail: Provider = async (email) => {
  const start = Date.now();
  const data = (await fetchJson(`https://en.gravatar.com/${md5(email)}.json`)) as
    | { entry?: Record<string, unknown>[] }
    | null;
  const entry = data?.entry?.[0];
  if (!entry) return step("gravatar", "email", email, "no_data", [], Date.now() - start);
  const facts: PivotFact[] = [];
  const display = asStr(entry.displayName);
  if (display) facts.push({ kind: "name", value: display, source: "gravatar", confidence: 0.85 });
  const nameObj = asObj<{ formatted?: string; givenName?: string; familyName?: string }>(entry.name);
  const fmt = asStr(nameObj?.formatted) || [nameObj?.givenName, nameObj?.familyName].filter(Boolean).join(" ").trim();
  if (fmt) facts.push({ kind: "name", value: fmt, source: "gravatar", confidence: 0.9 });
  const loc = asStr(entry.currentLocation);
  if (loc) facts.push({ kind: "address", value: loc, source: "gravatar", confidence: 0.7 });
  const accounts = (entry.accounts as { username?: string; shortname?: string; domain?: string; url?: string }[] | undefined) ?? [];
  for (const a of accounts) {
    const u = asStr(a.username);
    if (u) facts.push({ kind: "username", value: u, source: `gravatar→${a.shortname || a.domain || "social"}`, confidence: 0.85 });
    const url = asStr(a.url);
    if (url) facts.push({ kind: "url", value: url, source: "gravatar", confidence: 0.7 });
  }
  const urls = (entry.urls as { value?: string }[] | undefined) ?? [];
  for (const u of urls) {
    const v = asStr(u.value);
    if (v) facts.push({ kind: "url", value: v, source: "gravatar", confidence: 0.65 });
  }
  return step("gravatar", "email", email, facts.length ? "ok" : "no_data", facts, Date.now() - start);
};

/** RDAP — open whois replacement that returns JSON. */
const rdapDomain: Provider = async (domain) => {
  const start = Date.now();
  const data = (await fetchJson(`https://rdap.org/domain/${encodeURIComponent(domain)}`)) as
    | { entities?: Array<{ vcardArray?: unknown[] }> }
    | null;
  if (!data) return step("rdap", "domain", domain, "no_data", [], Date.now() - start);
  const facts: PivotFact[] = [];
  for (const ent of data.entities ?? []) {
    const vcard = (ent.vcardArray?.[1] as unknown[] | undefined) ?? [];
    for (const item of vcard) {
      if (!Array.isArray(item)) continue;
      const [fieldName, , , value] = item as [string, unknown, unknown, unknown];
      if (fieldName === "fn") {
        const v = asStr(value);
        if (v && !/redacted|gdpr|privacy|withheld/i.test(v)) {
          facts.push({ kind: "name", value: v, source: "rdap", confidence: 0.7 });
        }
      } else if (fieldName === "email") {
        const v = asStr(value);
        if (v && !/redacted|gdpr|privacy|abuse@|hostmaster@/i.test(v)) {
          facts.push({ kind: "email", value: v, source: "rdap", confidence: 0.85 });
        }
      } else if (fieldName === "tel") {
        const v = asStr(value);
        if (v) facts.push({ kind: "phone", value: v, source: "rdap", confidence: 0.7 });
      } else if (fieldName === "adr" && Array.isArray(value)) {
        const flat = (value as unknown[]).flat().filter((x): x is string => typeof x === "string" && x.trim().length > 0);
        const addr = flat.join(", ");
        if (addr && !/redacted/i.test(addr)) facts.push({ kind: "address", value: addr, source: "rdap", confidence: 0.7 });
      }
    }
  }
  return step("rdap", "domain", domain, facts.length ? "ok" : "no_data", facts, Date.now() - start);
};

/** DNS A-record lookup → IPs. Useful for pivoting domain → ip → geo. */
const dnsResolve: Provider = async (domain) => {
  const start = Date.now();
  const data = (await fetchJson(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=A`)) as
    | { Answer?: { type?: number; data?: string }[] }
    | null;
  const facts: PivotFact[] = [];
  for (const a of data?.Answer ?? []) {
    if (a.type === 1 && a.data) facts.push({ kind: "ip", value: a.data, source: "dns.google", confidence: 1.0 });
  }
  return step("dns", "domain", domain, facts.length ? "ok" : "no_data", facts, Date.now() - start);
};

/** ip-api free JSON — geo + reverse DNS + ASN/ISP. */
const ipGeo: Provider = async (ip) => {
  const start = Date.now();
  const data = (await fetchJson(
    `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,regionName,city,zip,lat,lon,org,isp,as,reverse`,
  )) as { status?: string; country?: string; regionName?: string; city?: string; zip?: string; org?: string; isp?: string; reverse?: string } | null;
  const facts: PivotFact[] = [];
  if (data?.status === "success") {
    const addr = [data.city, data.regionName, data.country, data.zip].filter(Boolean).join(", ");
    if (addr) facts.push({ kind: "address", value: addr, source: "ip-api", confidence: 0.45, detail: "geolocation approximation" });
    if (data.reverse) {
      facts.push({ kind: "domain", value: data.reverse, source: "ip-api", confidence: 0.7, detail: "reverse DNS" });
    }
    if (data.org) facts.push({ kind: "name", value: data.org, source: "ip-api", confidence: 0.4, detail: "org / ISP" });
    else if (data.isp) facts.push({ kind: "name", value: data.isp, source: "ip-api", confidence: 0.35, detail: "ISP" });
  }
  return step("ip-api", "ip", ip, facts.length ? "ok" : "no_data", facts, Date.now() - start);
};

/** EmailRep free unauthenticated lookup — flags whether email is on social platforms. */
const emailrep: Provider = async (email) => {
  const start = Date.now();
  const data = (await fetchJson(`https://emailrep.io/${encodeURIComponent(email)}`, {
    headers: { "User-Agent": USER_AGENT },
  })) as { email?: string; details?: { profiles?: string[] } } | null;
  const facts: PivotFact[] = [];
  const local = email.split("@")[0];
  for (const p of data?.details?.profiles ?? []) {
    facts.push({ kind: "username", value: local, source: `emailrep→${p}`, confidence: 0.55, detail: `account on ${p}` });
  }
  return step("emailrep", "email", email, facts.length ? "ok" : "no_data", facts, Date.now() - start);
};

/* ------------------------------------------------------------- orchestrator */

function providersFor(kind: PivotKind): Provider[] {
  switch (kind) {
    case "username": return [githubUser];
    case "email":    return [gravatarEmail, emailrep];
    case "domain":   return [rdapDomain, dnsResolve];
    case "ip":       return [ipGeo];
    default:         return [];
  }
}

function step(
  provider: string,
  inputKind: PivotKind,
  inputValue: string,
  status: PivotStep["status"],
  facts: PivotFact[],
  duration_ms: number,
  raw_keys?: string[],
  error?: string,
): PivotStep {
  return { provider, input: { kind: inputKind, value: inputValue }, status, facts, duration_ms, raw_keys, error };
}

function extractHost(url: string): string | null {
  try {
    return new URL(url.includes("://") ? url : `https://${url}`).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** Dedup facts by kind+value (lowercased value for non-phone). */
function dedupFacts(facts: PivotFact[]): PivotFact[] {
  const map = new Map<string, PivotFact>();
  for (const f of facts) {
    const key = `${f.kind}:${f.value.toLowerCase().trim()}`;
    const existing = map.get(key);
    if (!existing || f.confidence > existing.confidence) {
      map.set(key, f);
    }
  }
  return [...map.values()];
}

const PIVOTABLE: PivotKind[] = ["username", "email", "domain", "ip"];

/** The selector kinds the pivot engine can take as a starting point. */
export const PIVOTABLE_KINDS: PivotKind[] = PIVOTABLE;

export async function pivot(seed: { kind: PivotKind; value: string }): Promise<PivotResult> {
  const t0 = Date.now();
  const visited = new Set<string>();
  const allSteps: PivotStep[] = [];
  const allFacts: PivotFact[] = [];

  type QItem = { kind: PivotKind; value: string; depth: number };
  const queue: QItem[] = [{ kind: seed.kind, value: seed.value, depth: 0 }];

  while (queue.length && allSteps.length < MAX_STEPS) {
    const cur = queue.shift()!;
    const key = `${cur.kind}:${cur.value.toLowerCase().trim()}`;
    if (visited.has(key)) continue;
    visited.add(key);

    const provs = providersFor(cur.kind);
    if (provs.length === 0) continue;

    const results = await Promise.allSettled(provs.map((p) => p(cur.value)));
    for (const r of results) {
      if (r.status === "fulfilled") {
        allSteps.push(r.value);
        for (const f of r.value.facts) {
          allFacts.push(f);
          if (cur.depth < MAX_DEPTH && PIVOTABLE.includes(f.kind)) {
            queue.push({ kind: f.kind, value: f.value, depth: cur.depth + 1 });
          }
        }
      } else {
        allSteps.push(step(provs[0].name || "?", cur.kind, cur.value, "error", [], 0, undefined, String(r.reason)));
      }
    }
  }

  const dedup = dedupFacts(allFacts);

  const traceableSeeds: PivotResult["traceableSeeds"] = [];
  const seenSeed = new Set<string>();
  for (const f of dedup) {
    if (f.kind === "email" || f.kind === "phone" || f.kind === "name" || f.kind === "address") {
      if (f.confidence >= MIN_TRACEABLE_CONFIDENCE) {
        const sk = `${f.kind}:${f.value.toLowerCase()}`;
        if (!seenSeed.has(sk)) {
          seenSeed.add(sk);
          traceableSeeds.push({ kind: f.kind, value: f.value, source: f.source, confidence: f.confidence });
        }
      }
    }
  }

  // Order: highest confidence first.
  traceableSeeds.sort((a, b) => b.confidence - a.confidence);

  return {
    seed,
    chain: allSteps,
    facts: dedup,
    traceableSeeds,
    duration_ms: Date.now() - t0,
  };
}
