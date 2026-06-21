/**
 * osint-toolkit — public library entry.
 *
 * Two primitives:
 *   pivot()    — enrich a single selector (username/email/domain/ip) into facts
 *                + traceable seeds, via free public APIs (it actually fetches).
 *   runTools() — render the 660-tool URL catalog against the selectors you have
 *                (it builds URLs; it does not fetch them).
 *
 * And one convenience that combines both:
 *   lookup()   — take a PRISM-style seed object and return { pivot, tools }.
 */

import { pivot, PIVOTABLE_KINDS, type PivotKind, type PivotResult } from "./pivot.ts";
import { loadTools } from "./catalog.ts";
import {
  renderAll,
  renderCategory,
  type RunnerInputs,
  type RunnerResult,
} from "./tools-runner.ts";
import type { SelectorKind } from "./tools-inputs.ts";

export { pivot, PIVOTABLE_KINDS } from "./pivot.ts";
export type { PivotKind, PivotFact, PivotStep, PivotResult, TraceableKind } from "./pivot.ts";
export { loadTools, loadRawCatalog, envKeyStatus } from "./catalog.ts";
export { renderTool, renderCategory, renderAll, buildExport } from "./tools-runner.ts";
export type { RunnerInputs, RunnerResult } from "./tools-runner.ts";
export { CATEGORY_INPUTS, SELECTOR_META, type SelectorKind } from "./tools-inputs.ts";
export { CATEGORY_META, statusLabel, type Tool, type Catalog } from "./tools-types.ts";

/**
 * A seed mirrors PRISM's API seed object. Any combination of these is accepted;
 * more selectors = a richer result. Unknown keys are ignored.
 */
export type Seed = {
  email?: string;
  phone?: string;
  name?: string;
  first_name?: string;
  last_name?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  username?: string;
  domain?: string;
  ip?: string;
  url?: string;
  query?: string;
  [k: string]: string | undefined;
};

/** Map a PRISM-style seed onto the catalog runner's selector inputs. */
export function seedToInputs(seed: Seed): RunnerInputs {
  const i: RunnerInputs = {};
  const set = (k: SelectorKind, v?: string) => {
    if (v && v.trim()) i[k] = v.trim();
  };
  set("email", seed.email);
  set("phone", seed.phone);
  set("name", seed.name ?? ([seed.first_name, seed.last_name].filter(Boolean).join(" ") || undefined));
  set("fn", seed.first_name);
  set("ln", seed.last_name);
  set("addr_city", seed.city);
  set("addr_state", seed.state);
  set("addr_zip", seed.zip);
  set("addr_street", seed.address);
  set("username", seed.username);
  set("domain", seed.domain);
  set("ip", seed.ip);
  set("url", seed.url);
  set("query", seed.query ?? seed.name);
  return i;
}

/** Which pivot-able selectors does this seed contain? (in priority order) */
export function seedPivotTargets(seed: Seed): { kind: PivotKind; value: string }[] {
  const out: { kind: PivotKind; value: string }[] = [];
  const push = (kind: PivotKind, v?: string) => {
    if (v && v.trim() && PIVOTABLE_KINDS.includes(kind)) out.push({ kind, value: v.trim() });
  };
  push("username", seed.username);
  push("email", seed.email);
  push("domain", seed.domain);
  push("ip", seed.ip);
  return out;
}

export type RunToolsOptions = {
  /** Restrict to one category. Omit to sweep every category. */
  category?: string;
  /** Exclude tools marked dead/broken in the catalog. Default true. */
  excludeDead?: boolean;
};

/** Render catalog URLs for a set of selector inputs. */
export function runTools(inputs: RunnerInputs, opts: RunToolsOptions = {}): Record<string, RunnerResult[]> {
  const tools = loadTools();
  const excludeDead = opts.excludeDead !== false;
  if (opts.category) {
    const r = renderCategory(tools, opts.category, inputs, { excludeDead });
    return r.length ? { [opts.category]: r } : {};
  }
  return renderAll(tools, inputs, { excludeDead });
}

export type LookupResult = {
  seed: Seed;
  pivot: PivotResult[];
  tools: Record<string, RunnerResult[]>;
  duration_ms: number;
};

export type LookupOptions = {
  /** Run the pivot engine (live fetches). Default true. */
  pivot?: boolean;
  /** Render catalog URLs. Default true. */
  tools?: boolean;
  /** Passed through to the tools runner. */
  excludeDead?: boolean;
};

/**
 * One call that takes a PRISM-style seed and returns a combined dossier:
 * pivot enrichment for each pivot-able selector, plus rendered catalog URLs.
 */
export async function lookup(seed: Seed, opts: LookupOptions = {}): Promise<LookupResult> {
  const t0 = Date.now();
  const wantPivot = opts.pivot !== false;
  const wantTools = opts.tools !== false;

  const pivotResults: PivotResult[] = [];
  if (wantPivot) {
    const targets = seedPivotTargets(seed);
    const settled = await Promise.allSettled(targets.map((t) => pivot(t)));
    for (const s of settled) if (s.status === "fulfilled") pivotResults.push(s.value);
  }

  const tools = wantTools ? runTools(seedToInputs(seed), { excludeDead: opts.excludeDead }) : {};

  return { seed, pivot: pivotResults, tools, duration_ms: Date.now() - t0 };
}
