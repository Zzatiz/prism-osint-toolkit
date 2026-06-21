# Changelog

All notable changes to this project are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning: [SemVer](https://semver.org/).

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
