# osint-toolkit

A zero-dependency OSINT toolkit with two primitives:

- **Pivot engine** — turn a single selector (a username, email, domain, or IP)
  into a set of facts and traceable seeds, by querying **free, no-auth public
  APIs** (GitHub, Gravatar, RDAP, Google DNS, ip-api, EmailRep). It actually
  fetches and parses; it BFS-expands discovered facts one or two hops further.
- **Tool catalog** — ~660 OSINT URL templates across 22 categories (search,
  social, email, username, names, addresses, phone, domains, IP, breaches,
  vehicles, crypto, and more). Give it the selectors you have and it renders
  ready-to-open URLs. It builds links; it does not scrape.

Ships as a **library**, a **CLI**, and a **local HTTP API** — pick whichever
fits. No database, no API keys required, no paid services. Everything runs
locally on Node 18+ with **no runtime dependencies**.

> The request/response shape mirrors a typical async OSINT API's `seed` object,
> so wiring this in next to an existing pipeline is mostly a base-URL change.

---

## Install

```bash
git clone https://github.com/<you>/osint-toolkit.git
cd osint-toolkit
npm install
npm run build
```

Optionally link the CLI globally:

```bash
npm link        # now `osint` is on your PATH
```

Or run it without building, straight from TypeScript (Node 22.6+):

```bash
node --experimental-strip-types src/cli.ts catalog
```

---

## CLI

```bash
# Enrich one selector (live fetch)
osint pivot  --username github
osint pivot  --email ada@example.com
osint pivot  --domain example.com
osint pivot  --ip 8.8.8.8

# Render the URL catalog against the selectors you have
osint tools  --category email --email ada@example.com
osint tools  --name "Jane Doe" --city Seattle --state WA      # sweeps all categories

# Combined: pivot every pivot-able selector + render catalog URLs
osint lookup --email jane@example.com --username jane --domain example.com

# Browse the catalog
osint catalog                       # category summary + optional-key status
osint catalog --category breaches   # list tools in one category

# Start the local API server
osint serve --port 8787
```

Add `--json` to any command for machine-readable output.

**Selector flags:** `--email --phone --name --first_name --last_name
--address --city --state --zip --username --domain --ip --url --query`

Pivot-able selectors (the ones that hit live APIs): `username`, `email`,
`domain`, `ip`. Everything else is used to render catalog URLs.

---

## Local HTTP API

```bash
osint serve            # http://localhost:8787
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
`email · phone · name · first_name · last_name · address · city · state · zip
· username · domain · ip · url · query`. Unknown keys are ignored; more
selectors = a richer result.

---

## Library

```ts
import { pivot, lookup, runTools, loadTools } from "osint-toolkit";

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

The engine chains these: e.g. `username → (github) → blog domain → (dns) → IP
→ (ip-api) → geolocation`.

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

`osint catalog` shows which keys are set and how many tools each unlocks.

---

## Notes & ethics

- Catalog entries are **URL templates** — they open a search in your browser or
  return public JSON. Some destinations (e.g. Shodan) have their own paid tiers
  for the data behind the link; the link itself is free to generate.
- Tool liveness drifts as third-party sites change. Each tool carries a
  `status` field (`ok`/`broken`/`blocked`/`dead`); sweeps exclude `dead`/`broken`
  by default.
- Use this for lawful research, security work, and investigations you're
  authorized to perform. You are responsible for how you use it.

## License

MIT — see [LICENSE](./LICENSE).
