/* Shared types for the OSINT tools catalog. */

export type ToolStatus = "ok" | "blocked" | "broken" | "dead" | "skip" | "patched" | "untested";

export type ToolParam = {
  name: string;
  defaultValue?: string;
};

export type Tool = {
  id: string;
  category: string;
  label: string;
  hint?: string;
  params: ToolParam[];
  /**
   * URL template with `${param}` placeholders, e.g.
   *   "https://www.google.com/search?q=${query}"
   * A few tools also carry `{{env:NAME}}` markers for an optional API key —
   * these are filled from process.env at load time (see catalog.ts).
   */
  template: string;
  status?: ToolStatus;
  tested_at?: string;
  note?: string;
};

export type Catalog = {
  generatedAt: string;
  counts: Record<string, number>;
  tools: Tool[];
};

export const CATEGORY_META: Record<
  string,
  { label: string; sub: string; order: number }
> = {
  search:      { label: "Search Engines",         sub: "general + dark-web search",  order: 1 },
  facebook:    { label: "Facebook",               sub: "profiles, search, friends",  order: 2 },
  twitter:     { label: "X / Twitter",            sub: "profiles, posts, mirrors",   order: 3 },
  instagram:   { label: "Instagram",              sub: "profiles, mirrors, hashtags",order: 4 },
  linkedin:    { label: "LinkedIn",               sub: "people + content search",    order: 5 },
  communities: { label: "Communities",            sub: "reddit, hn, tiktok, ebay…",  order: 6 },
  email:       { label: "Email Addresses",        sub: "search, breach, gravatar",   order: 7 },
  username:    { label: "Usernames",              sub: "cross-platform sweep",       order: 8 },
  names:       { label: "Names",                  sub: "people-search aggregators",  order: 9 },
  addresses:   { label: "Addresses",              sub: "people-by-address",          order: 10 },
  telephone:   { label: "Telephone Numbers",      sub: "phone-search aggregators",   order: 11 },
  maps:        { label: "Maps & Location",        sub: "satellite + street view",    order: 12 },
  documents:   { label: "Documents",              sub: "doc, ppt, archive search",   order: 13 },
  images:      { label: "Images",                 sub: "reverse + keyword search",   order: 14 },
  videos:      { label: "Videos",                 sub: "youtube + multi-platform",   order: 15 },
  domains:     { label: "Domains",                sub: "whois, dns, recon",          order: 16 },
  ip:          { label: "IP Addresses",           sub: "geo, asn, shodan",           order: 17 },
  business:    { label: "Business + Government",  sub: "courts, registries, FOIA",   order: 18 },
  vehicles:    { label: "Vehicles",               sub: "vin + license plate",        order: 19 },
  currencies:  { label: "Virtual Currencies",     sub: "btc + multi-chain",          order: 20 },
  breaches:    { label: "Breaches & Leaks",       sub: "credential + paste search",  order: 21 },
  audio:       { label: "Live Audio Streams",     sub: "radio browser + news",       order: 22 },
};

export function statusLabel(status?: ToolStatus): string {
  switch (status) {
    case "ok": return "live";
    case "blocked": return "auth";
    case "broken": return "warn";
    case "dead": return "dead";
    case "skip": return "skip";
    case "patched": return "fixed";
    default: return "—";
  }
}
