<div align="center">

![prism-osint-toolkit](./assets/prism-hero.gif)

# prism-osint-toolkit

**Free OSINT enrichment that turns one identifier into a spectrum of intel.**

Username, email, domain, or IP → names, locations, linked accounts, traceable
leads, and 660+ search tools. The free toolset behind
[PRISM](https://prism-tools.vip), packaged as a zero-dependency library, CLI,
and local API.

**No keys. No database. No signup.**

</div>

---

## What it does

Two primitives, plain and simple:

- **Pivot** — give it a *username, email, domain, or IP*. It queries free public
  APIs and hands back real names, locations, linked social accounts, and
  traceable leads. It actually fetches and parses, and chains discoveries one or
  two hops further (e.g. `username → blog domain → DNS → IP → geolocation`).
- **Catalog** — give it *whatever you have* (name, phone, address, email…). It
  renders **660+ ready-to-open OSINT search URLs** across 22 categories. It
  builds links; it doesn't scrape.

Run it however suits you:

| Interface | Use it when |
|-----------|-------------|
| **Library** | wiring OSINT into your own Node/TS app |
| **CLI** | quick lookups from the terminal |
| **Local API** | a local HTTP server that speaks the same `seed` format as the PRISM API |

No API keys, no database, no signup, **zero runtime dependencies**. Node 18+.

---

## Quick start

```bash
git clone https://github.com/Zzatiz/prism-osint-toolkit.git
cd prism-osint-toolkit
npm install
npm run build

# enrich one selector (live)
node dist/cli.js pivot --username github

# or run the local API
node dist/cli.js serve            # http://localhost:8787
```

Optionally `npm link` to put `prism` on your PATH, or run straight from
TypeScript with `node --experimental-strip-types src/cli.ts <command>`.

---

## CLI

```bash
# Enrich one selector (live fetch)
prism pivot  --username github
prism pivot  --email ada@example.com
prism pivot  --domain example.com
prism pivot  --ip 8.8.8.8

# Render the URL catalog against the selectors you have
prism tools  --category email --email ada@example.com
prism tools  --name "Jane Doe" --city Seattle --state WA      # sweeps all categories

# Combined: pivot every pivot-able selector + render catalog URLs
prism lookup --email jane@example.com --username jane --domain example.com

# Browse the catalog
prism catalog                       # category summary + optional-key status
prism catalog --category breaches   # list tools in one category

# Start the local API server
prism serve --port 8787
```

Add `--json` to any command for machine-readable output.

**Selector flags:** `--email --phone --name --first_name --last_name
--address --city --state --zip --username --domain --ip --url --query`

Pivot-able selectors (the ones that hit live APIs): `username`, `email`,
`domain`, `ip`. Everything else feeds the catalog URL builder.

---

## Local HTTP API

```bash
prism serve            # http://localhost:8787
```

| Method | Path       | Body                                   | Returns |
|--------|------------|----------------------------------------|---------|
| GET    | `/health`  | —                                      | status + catalog/env summary |
| GET    | `/catalog` | —                                      | the live tool set |
| POST   | `/pivot`   | `{ "kind", "value" }` or `{ "seed" }`  | pivot facts + traceable seeds |
| POST   | `/tools`   | `{ "seed"\|"inputs", "category"? }`    | rendered catalog URLs |
| POST   | `/lookup`  | `{ "seed": { … } }`                    | combined pivot + tools |

```bash
# Combined dossier from a seed object
curl -sS -X POST http://localhost:8787/lookup \
  -H 'content-type: application/json' \
  -d '{ "seed": { "email": "jane@example.com", "username": "jane", "domain": "example.com" } }'

# A single pivot
curl -sS -X POST http://localhost:8787/pivot \
  -H 'content-type: application/json' \
  -d '{ "kind": "username", "value": "github" }'
```

The `seed` object accepts any combination of:
`email · phone · name · first_name · last_name · address · city · state · zip ·
username · domain · ip · url · query`. Unknown keys are ignored; more selectors
= a richer result.

---

## Library

```ts
import { pivot, lookup, runTools, loadTools } from "prism-osint-toolkit";

// Live enrichment of one selector
const r = await pivot({ kind: "username", value: "github" });
console.log(r.facts, r.traceableSeeds);

// Combined: pivot + catalog URLs from a seed
const dossier = await lookup({ email: "jane@example.com", username: "jane" });

// Just render catalog URLs (no fetching)
const urls = runTools({ email: "jane@example.com" }, { category: "email" });

// Inspect the catalog
const tools = loadTools(); // env-key markers resolved; key-less tools dropped
```

---

## Pivot data sources (all free, no key)

| Source     | Input    | Yields |
|------------|----------|--------|
| GitHub API | username | name, email, blog, location, linked Twitter, company |
| Gravatar   | email    | name, location, linked social accounts |
| RDAP       | domain   | registrant name/email/phone/address (when not redacted) |
| Google DNS | domain   | A records (IPs) |
| ip-api     | ip       | approx geolocation, reverse DNS, org/ISP |
| EmailRep   | email    | platforms the address is known on |

---

## Catalog categories

660+ URL templates across: **search · facebook · twitter · instagram · linkedin
· communities · email · username · names · addresses · telephone · maps ·
documents · images · videos · domains · ip · business · vehicles · currencies ·
breaches · audio.**

Each tool carries a `status` (`ok`/`broken`/`blocked`/`dead`); sweeps exclude
`dead`/`broken` by default. Statuses are kept current with a re-runnable health
backtest — `npm run check` re-probes every tool and refreshes its status
(`blocked` = alive but anti-bot/login-gated, i.e. works in a browser).

---

## Optional API keys

Everything works with **no keys**. A handful of catalog tools call an API that
wants a free key; set them to unlock those specific tools, otherwise they're
simply skipped.

```bash
cp .env.example .env
# then fill in any you have:
#   FLICKR_API_KEY        (3 image tools)
#   YOUTUBE_API_KEY       (3 video tools)
#   SHAREDCOUNT_API_KEY   (1 domain tool)
```

`prism catalog` shows which keys are set and how many tools each unlocks.

---

## Notes & ethics

- Catalog entries are **URL templates** — they open a search in your browser or
  return public JSON. Some destinations (e.g. Shodan) have their own paid tiers
  for the data behind the link; generating the link is free.
- Tool liveness drifts as third-party sites change; statuses reflect the last
  check, not a guarantee.
- Use this for lawful research, security work, and investigations you're
  authorized to perform. You are responsible for how you use it.

## License

MIT — see [LICENSE](./LICENSE).
