# CLAUDE.md — guide for AI coding assistants

This file orients an AI assistant (Claude Code, Cursor, etc.) working in this
repository. If you're a human, the [README](./README.md) is the better start.

## What this project is

A zero-dependency OSINT toolkit. Two primitives, three interfaces:

- **Pivot engine** (`src/pivot.ts`) — enriches one selector (username / email /
  domain / ip) into facts + traceable seeds by calling free public JSON APIs,
  BFS-expanding up to 2 hops. This is the only part that makes network calls.
- **Tool catalog** (`data/tools-catalog.json` + `src/tools-*.ts`) — ~660 URL
  templates across 22 categories. The runner fills `${param}` placeholders from
  the selectors a user supplies. It builds URLs; it never fetches them.

Interfaces: a library (`src/lib.ts`), a CLI (`src/cli.ts`), and a local HTTP
API (`src/server.ts`).

## Architecture

```
src/
  pivot.ts         live enrichment engine (the only network-calling module)
  catalog.ts       loads data/tools-catalog.json, resolves {{env:KEY}} markers
  tools-types.ts   Tool/Catalog types + category metadata
  tools-inputs.ts  selector schema + param→selector mapping + phone split
  tools-runner.ts  render tool URL templates against selector inputs
  lib.ts           public library entry: pivot(), runTools(), lookup(), seed mapping
  server.ts        node:http API: /health /catalog /pivot /tools /lookup
  cli.ts           argv parser + commands + pretty output
  env.ts           tiny .env loader (no dependency)
data/
  tools-catalog.json   the catalog (keys templated as {{env:NAME}}, none baked in)
```

## Conventions

- **Zero runtime dependencies.** Use only Node built-ins (`node:http`,
  `node:crypto`, `node:fs`, global `fetch`). Do not add runtime deps; devDeps
  are limited to TypeScript + `@types/node`.
- **Relative imports use the `.ts` extension** (e.g. `from "./pivot.ts"`). The
  build (`tsc` with `rewriteRelativeImportExtensions`) rewrites them to `.js`,
  and `node --experimental-strip-types` runs them directly in dev.
- **No secrets in the repo.** Any tool needing an API key uses a
  `{{env:NAME}}` marker in its template, resolved at load time from
  `process.env`. If the key is unset, the tool is dropped from the live set —
  never emit a URL containing a literal placeholder.
- Keep the seed object shape stable (see `Seed` in `src/lib.ts`); it's the
  public contract the CLI, server, and library all share.

## Build & test

```bash
npm install
npm run build          # tsc → dist/
node dist/cli.js catalog
node dist/cli.js pivot --username github      # live network call
node dist/cli.js serve --port 8787
```

There is no formal test suite yet; smoke-test via the CLI and the `/health`
endpoint. If you add tests, prefer the Node built-in test runner
(`node --test`) to keep the zero-dependency rule.

## When extending

- **New pivot source:** add a `Provider` in `src/pivot.ts` and register it in
  `providersFor()`. It must hit a free, no-auth, JSON endpoint with an 8s
  timeout, and fail silently to `no_data`.
- **New catalog tool:** add an entry to `data/tools-catalog.json` with
  `id`, `category`, `label`, `params`, `template`, `status`. Use `${param}`
  placeholders and map any new param name in `PARAM_TO_SELECTOR`
  (`src/tools-inputs.ts`).
- **New API key:** reference it as `{{env:NAME}}` in the template and document
  it in `.env.example`.
