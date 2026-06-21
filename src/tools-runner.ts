/**
 * Render every tool in a category (or the whole catalog) against a set of
 * user-supplied selectors. Returns a flat list of { tool, url } pairs you can
 * show / copy / open / export.
 */

import type { Tool } from "./tools-types.ts";
import {
  CATEGORY_INPUTS,
  PARAM_TO_SELECTOR,
  splitPhone,
  type SelectorKind,
} from "./tools-inputs.ts";

export type RunnerInputs = Partial<Record<SelectorKind, string>>;

export type RunnerResult = {
  tool: Tool;
  url: string;
  /** Set when the tool has placeholders that no selector value satisfies. */
  missing?: string[];
};

/** Encode a value into URL-safe form for path/query insertion. */
function safe(v: string): string {
  return encodeURIComponent(v);
}

/** Build the URL for one tool by mapping its params to the given selectors. */
export function renderTool(tool: Tool, inputs: RunnerInputs): RunnerResult {
  let url = tool.template;
  const missing: string[] = [];

  // Handle the phone 3/3/4 split — if the tool wants a, b, c and the user
  // supplied a single "phone", split it.
  const wantsPhoneParts = tool.params.some((p) => p.name === "a" || p.name === "b" || p.name === "c");
  let phoneSplit: { a: string; b: string; c: string } | null = null;
  if (wantsPhoneParts && inputs.phone) {
    phoneSplit = splitPhone(inputs.phone);
  }

  for (const p of tool.params) {
    let val: string | undefined;
    if (phoneSplit && (p.name === "a" || p.name === "b" || p.name === "c")) {
      val = phoneSplit[p.name];
    } else {
      const sel = PARAM_TO_SELECTOR[p.name];
      if (sel) val = inputs[sel];
    }
    if (!val) {
      val = p.defaultValue;
    }
    if (!val) {
      missing.push(p.name);
      // Leave placeholder so the caller can see what's missing.
      continue;
    }
    url = url.replace(new RegExp("\\$\\{" + p.name + "\\}", "g"), safe(val));
  }

  return { tool, url, missing: missing.length ? missing : undefined };
}

/** Render every tool in a category (filtered by status if requested). */
export function renderCategory(
  tools: Tool[],
  category: string,
  inputs: RunnerInputs,
  opts: { excludeDead?: boolean } = {},
): RunnerResult[] {
  const cat = tools.filter((t) => t.category === category);
  return cat
    .filter((t) => !opts.excludeDead || (t.status !== "dead" && t.status !== "broken"))
    .map((t) => renderTool(t, inputs))
    .filter((r) => !r.missing); // only include tools whose params we satisfied
}

/** Render every tool across the whole catalog that we can satisfy. */
export function renderAll(
  tools: Tool[],
  inputs: RunnerInputs,
  opts: { excludeDead?: boolean } = {},
): Record<string, RunnerResult[]> {
  const out: Record<string, RunnerResult[]> = {};
  for (const c of Object.keys(CATEGORY_INPUTS)) {
    const r = renderCategory(tools, c, inputs, opts);
    if (r.length > 0) out[c] = r;
  }
  return out;
}

/** Build a JSON export payload from a run. */
export function buildExport(
  inputs: RunnerInputs,
  results: Record<string, RunnerResult[]>,
  meta: { startedAt: string; finishedAt: string; total: number },
): unknown {
  return {
    toolkit: { version: "1.0" },
    inputs,
    meta,
    categories: Object.entries(results).map(([cat, items]) => ({
      category: cat,
      count: items.length,
      tools: items.map((r) => ({
        id: r.tool.id,
        label: r.tool.label,
        status: r.tool.status,
        url: r.url,
      })),
    })),
  };
}
