# Changelog

All notable changes to this project are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning: [SemVer](https://semver.org/).

## [1.1.0] — 2026-06-21

### Added — catalog health backtest (`scripts/check-catalog.mjs`, `npm run check`)

- Renders every catalog tool with a realistic sample value, fetches the URL, and
  refreshes each tool's `status` + `tested_at`. Re-runnable so the catalog can be
  kept honest over time.
- Conservative classifier that does **not** punish anti-bot behavior: a site that
  returns 400/401/403/405/429/5xx to a bare bot (Facebook, ThatsThem, crt.sh,
  Yahoo, …) is marked `blocked` (works in a browser), not `broken`. Connect
  timeouts and TLS/cert errors are `blocked`, not `dead`. Tor `.onion` services
  and key-gated tools are skipped (untestable without Tor / a key). Known-alive
  hosts that throttle parallel probes (e.g. web.archive.org) are not mis-marked.

### Fixed — broken/moved tools (verified live)

- **psbdmp** (8 tools): endpoint moved `psbdmp.ws` → `psbdmp.com`.
- **email_protonmail_key**: Proton's old HKP endpoint is gone → repointed to
  `keys.openpgp.org`.
- **discord_discordme**: search path changed → `discord.me/servers?keyword=`.
- **domain_history_whois**: who.is dropped free whois-history → repointed to
  `whoxy.com` (and fixed the template placeholder to match its param).

### Changed — refreshed statuses across the catalog

- Backtested 607 of 662 tools live (remaining: 14 Tor `.onion` untestable without
  Tor, 7 need an API key, 34 use niche per-tool params).
- Net result: **437 ok · 194 blocked · 14 dead · 3 broken · 14 skip**. The big
  swing vs. the imported data is correctly reclassifying ~140 anti-bot tools from
  `broken`/`dead` to `blocked` (they work fine in a browser).
- **9 tools confirmed genuinely dead** (service shut down or DNS gone on both
  Cloudflare and Google resolvers): ThreatCrowd (domain + ip), Descartes Labs
  viewer, Columbus/elmasy, MementoWeb timetravel, PoliticalMoneyLine,
  illicit.services, ClustrMaps, usa-official. Left as `dead` (excluded from
  sweeps; a future `npm run check` will revive any that come back).
- Latest run snapshot committed at `scripts/catalog-report.json`.

## [1.0.0] — 2026-06-21

First public release. The free OSINT toolkit behind
[PRISM](https://prism-tools.vip), extracted into a standalone, zero-dependency
package anyone can run.

### Added — pivot engine (`src/pivot.ts`)

- Live selector enrichment over **free, no-auth public APIs**:
  - **GitHub** (username) → name, email, blog, location, linked Twitter, company
  - **Gravatar** (email) → name, location, linked social accounts
  - **RDAP** (domain) → registrant name/email/phone/address (redaction-filtered)
  - **Google DNS** (domain) → A records (IPs)
  - **ip-api** (ip) → approximate geolocation, reverse DNS, org/ISP
  - **EmailRep** (email) → platforms the address is known on
- **BFS expansion** up to 2 hops with a 14-step ceiling, so one selector can
  chain into many (e.g. `username → blog domain → DNS → IP → geolocation`).
- Per-fetch hard timeout (8s); failures degrade silently to `no_data`.
- Confidence scoring per fact (0–1) + a deduped union and a ranked list of
  **traceable seeds** (email/phone/name/address ≥ 0.6 confidence).

### Added — tool catalog (`data/tools-catalog.json` + `src/tools-*.ts`)

- **660+ OSINT URL templates** across 22 categories: search, facebook, twitter,
  instagram, linkedin, communities, email, username, names, addresses,
  telephone, maps, documents, images, videos, domains, ip, business, vehicles,
  currencies, breaches, audio.
- **Runner** (`tools-runner.ts`) maps the selectors you supply onto each tool's
  `${param}` placeholders, including the US-phone 3/3/4 split, and renders
  ready-to-open URLs. Sweep one category or the whole catalog.
- **Input schema** (`tools-inputs.ts`) — per-category selector requirements,
  selector metadata (labels/placeholders/examples), and the param→selector map.
- Each tool carries a `status` (`ok`/`broken`/`blocked`/`dead`); sweeps exclude
  `dead`/`broken` by default.

### Added — three interfaces

- **Library** (`src/lib.ts`) — `pivot()`, `runTools()`, `lookup()` over a shared
  PRISM-style `seed` object, plus `loadTools()`, `seedToInputs()`,
  `seedPivotTargets()` and re-exported types.
- **CLI** (`src/cli.ts`) — `prism pivot | tools | lookup | catalog | serve`,
  with selector flags that map 1:1 to seed fields, colorized output, and
  `--json` for machine-readable results.
- **Local HTTP API** (`src/server.ts`, `node:http`) — `GET /health`,
  `GET /catalog`, `POST /pivot`, `POST /tools`, `POST /lookup`. The request body
  uses the **same `seed` shape as the PRISM API**, so a client written against
  PRISM can point at this local server with minimal changes.

### Added — packaging & docs

- **Zero runtime dependencies** — only Node built-ins (`node:http`,
  `node:crypto`, `node:fs`, global `fetch`). Node 18+.
- Built with `tsc` using `rewriteRelativeImportExtensions`, so source uses
  `.ts` import specifiers (runnable directly via
  `node --experimental-strip-types`) and emits correct `.js` imports.
- Tiny zero-dep `.env` loader (`src/env.ts`).
- `README.md` (animated hero, hook, simply-explained features, full CLI/API/
  library reference), `CLAUDE.md` (guide for AI assistants working in the repo),
  `.env.example`, MIT `LICENSE`.

### Optional API keys

- A handful of catalog tools call an API that wants a free key. Keys are
  referenced in templates as `{{env:NAME}}` markers and resolved at load time
  from `process.env`; tools whose key is unset are dropped from the live set
  (never emitting a URL with a literal placeholder).
  - `FLICKR_API_KEY` (3 image tools)
  - `YOUTUBE_API_KEY` (3 video tools)
  - `SHAREDCOUNT_API_KEY` (1 domain tool)

### Security / privacy

- Ships **no secrets**. The three API keys that were embedded in the upstream
  catalog were replaced with `{{env:NAME}}` placeholders before release.
- Contains no database, billing, auth, AI/LLM, headless-browser, or hosted-
  platform code — only the free enrichment + URL-catalog surface.
