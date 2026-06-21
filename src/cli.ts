#!/usr/bin/env node
/**
 * osint-toolkit CLI.
 *
 *   osint pivot   --username github
 *   osint pivot   --email ada@example.com
 *   osint tools   --category email --email ada@example.com
 *   osint tools   --all --name "Jane Doe" --email jane@example.com
 *   osint lookup  --email jane@example.com --username jane --domain example.com
 *   osint catalog [--category email]
 *   osint serve   [--port 8787]
 *
 * Flags map 1:1 to seed/selector fields. Add --json for raw JSON output.
 */

import { loadDotenv } from "./env.ts";
import { pivot, PIVOTABLE_KINDS, type PivotKind, type PivotResult } from "./pivot.ts";
import { loadTools, envKeyStatus } from "./catalog.ts";
import { CATEGORY_META } from "./tools-types.ts";
import { lookup, runTools, seedToInputs, type Seed, type LookupResult } from "./lib.ts";
import type { RunnerResult } from "./tools-runner.ts";
import { startServer } from "./server.ts";

loadDotenv();

/* ----------------------------------------------------------------- arg parse */

type Args = { _: string[]; flags: Record<string, string | boolean> };

function parseArgs(argv: string[]): Args {
  const out: Args = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) {
        out.flags[key] = true;
      } else {
        out.flags[key] = next;
        i++;
      }
    } else {
      out._.push(a);
    }
  }
  return out;
}

function str(flags: Args["flags"], key: string): string | undefined {
  const v = flags[key];
  return typeof v === "string" ? v : undefined;
}

/** Build a seed object from CLI flags. */
function seedFromFlags(flags: Args["flags"]): Seed {
  const keys = [
    "email", "phone", "name", "first_name", "last_name", "address",
    "city", "state", "zip", "username", "domain", "ip", "url", "query",
  ];
  const seed: Seed = {};
  for (const k of keys) {
    const v = str(flags, k);
    if (v) seed[k] = v;
  }
  return seed;
}

/* ------------------------------------------------------------------- output */

const C = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
};

function printPivot(r: PivotResult) {
  console.log(C.bold(`\n● pivot ${r.seed.kind}:${r.seed.value}`) + C.dim(`  (${r.duration_ms}ms)`));
  if (!r.facts.length) {
    console.log(C.dim("  no facts found"));
    return;
  }
  console.log(C.dim("  facts:"));
  for (const f of r.facts) {
    const conf = `${Math.round(f.confidence * 100)}%`;
    console.log(`    ${C.cyan(f.kind.padEnd(9))} ${f.value}  ${C.dim(`${f.source} · ${conf}`)}${f.detail ? C.dim(` · ${f.detail}`) : ""}`);
  }
  if (r.traceableSeeds.length) {
    console.log(C.green("  traceable seeds:"));
    for (const s of r.traceableSeeds) {
      console.log(`    ${C.green(s.kind.padEnd(9))} ${s.value}  ${C.dim(`${s.source} · ${Math.round(s.confidence * 100)}%`)}`);
    }
  }
}

function printTools(results: Record<string, RunnerResult[]>) {
  const cats = Object.keys(results).sort((a, b) => (CATEGORY_META[a]?.order ?? 99) - (CATEGORY_META[b]?.order ?? 99));
  let total = 0;
  for (const cat of cats) {
    const items = results[cat];
    total += items.length;
    console.log(C.bold(`\n● ${CATEGORY_META[cat]?.label ?? cat}`) + C.dim(`  (${items.length})`));
    for (const r of items) {
      console.log(`  ${C.dim(r.tool.label.padEnd(28).slice(0, 28))} ${r.url}`);
    }
  }
  console.log(C.dim(`\n${total} URLs across ${cats.length} categories`));
}

/* ------------------------------------------------------------------ commands */

async function cmdPivot(flags: Args["flags"]) {
  // Either an explicit pivot-able selector, or the first one found in the seed.
  let target: { kind: PivotKind; value: string } | null = null;
  for (const k of PIVOTABLE_KINDS) {
    const v = str(flags, k);
    if (v) { target = { kind: k, value: v }; break; }
  }
  if (!target) {
    console.error(`pivot needs one of: ${PIVOTABLE_KINDS.map((k) => `--${k}`).join(", ")}`);
    process.exit(1);
  }
  const r = await pivot(target);
  if (flags.json) return console.log(JSON.stringify(r, null, 2));
  printPivot(r);
}

async function cmdTools(flags: Args["flags"]) {
  const seed = seedFromFlags(flags);
  const inputs = seedToInputs(seed);
  if (!Object.keys(inputs).length) {
    console.error("tools needs at least one selector, e.g. --email, --name, --username, --domain …");
    process.exit(1);
  }
  const category = str(flags, "category");
  const results = runTools(inputs, { category });
  if (flags.json) return console.log(JSON.stringify({ inputs, categories: results }, null, 2));
  printTools(results);
}

async function cmdLookup(flags: Args["flags"]) {
  const seed = seedFromFlags(flags);
  if (!Object.keys(seed).length) {
    console.error("lookup needs at least one selector, e.g. --email, --username, --domain …");
    process.exit(1);
  }
  const r: LookupResult = await lookup(seed, {
    pivot: flags["no-pivot"] !== true,
    tools: flags["no-tools"] !== true,
  });
  if (flags.json) return console.log(JSON.stringify(r, null, 2));
  for (const p of r.pivot) printPivot(p);
  if (Object.keys(r.tools).length) printTools(r.tools);
  console.log(C.dim(`\ndone in ${r.duration_ms}ms`));
}

function cmdCatalog(flags: Args["flags"]) {
  const tools = loadTools();
  const category = str(flags, "category");
  const filtered = category ? tools.filter((t) => t.category === category) : tools;
  if (flags.json) return console.log(JSON.stringify(filtered, null, 2));
  const byCat = new Map<string, number>();
  for (const t of tools) byCat.set(t.category, (byCat.get(t.category) ?? 0) + 1);
  if (category) {
    for (const t of filtered) {
      console.log(`  ${C.cyan(t.id.padEnd(28))} ${C.dim(t.status ?? "")}  ${t.template}`);
    }
    console.log(C.dim(`\n${filtered.length} tools in "${category}"`));
  } else {
    const cats = [...byCat.keys()].sort((a, b) => (CATEGORY_META[a]?.order ?? 99) - (CATEGORY_META[b]?.order ?? 99));
    for (const c of cats) {
      console.log(`  ${C.cyan(c.padEnd(14))} ${C.dim(String(byCat.get(c)).padStart(3))}  ${CATEGORY_META[c]?.sub ?? ""}`);
    }
    console.log(C.dim(`\n${tools.length} live tools across ${cats.length} categories`));
    const keys = envKeyStatus();
    if (keys.length) {
      console.log(C.dim("\noptional API keys:"));
      for (const k of keys) {
        console.log(`  ${k.set ? C.green("✓") : C.yellow("·")} ${k.key.padEnd(22)} ${C.dim(`${k.tools} tool(s)${k.set ? "" : " — set in .env to unlock"}`)}`);
      }
    }
  }
}

function help() {
  console.log(`osint-toolkit — free OSINT enrichment + URL catalog

USAGE
  osint <command> [flags]

COMMANDS
  pivot     Enrich one selector via free public APIs (live fetch)
  tools     Render the URL catalog against the selectors you have
  lookup    Combined: pivot every pivot-able selector + render catalog URLs
  catalog   List catalog tools / categories / optional keys
  serve     Start the local HTTP API server

SELECTOR FLAGS (mix as needed)
  --email --phone --name --first_name --last_name
  --address --city --state --zip
  --username --domain --ip --url --query

OTHER FLAGS
  --category <name>   restrict tools/catalog to one category
  --json              raw JSON output
  --no-pivot          (lookup) skip the live pivot stage
  --no-tools          (lookup) skip the catalog stage
  --port <n>          (serve) port, default 8787

EXAMPLES
  osint pivot  --username github
  osint tools  --category email --email ada@example.com
  osint lookup --email jane@example.com --username jane --domain example.com
  osint serve  --port 8787

Pivot-able selectors: ${PIVOTABLE_KINDS.join(", ")}`);
}

/* --------------------------------------------------------------------- main */

async function main() {
  const { _, flags } = parseArgs(process.argv.slice(2));
  const cmd = _[0];
  switch (cmd) {
    case "pivot":   return cmdPivot(flags);
    case "tools":   return cmdTools(flags);
    case "lookup":  return cmdLookup(flags);
    case "catalog": return cmdCatalog(flags);
    case "serve":   return startServer(flags.port ? Number(flags.port) : undefined);
    case "help":
    case undefined: return help();
    default:
      console.error(`unknown command: ${cmd}\n`);
      help();
      process.exit(1);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
