/**
 * Catalog loader.
 *
 * Reads data/tools-catalog.json, then resolves any `{{env:NAME}}` markers in a
 * tool's template against process.env. Tools whose required env key is missing
 * are dropped from the live set (so a sweep never emits a broken URL with a
 * literal placeholder in it).
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { Catalog, Tool } from "./tools-types.ts";

const ENV_MARKER = /\{\{env:([A-Z0-9_]+)\}\}/g;

let cached: Catalog | null = null;

function catalogPath(): string {
  // dist/catalog.js → ../data/tools-catalog.json
  // src/catalog.ts (strip-types dev) → ../data/tools-catalog.json
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "..", "data", "tools-catalog.json");
}

/** Load the raw catalog (all tools, placeholders unresolved). Cached. */
export function loadRawCatalog(): Catalog {
  if (cached) return cached;
  const raw = readFileSync(catalogPath(), "utf8");
  cached = JSON.parse(raw) as Catalog;
  return cached;
}

/**
 * Resolve a tool's `{{env:NAME}}` markers. Returns the resolved tool, or null
 * if any required env key is unset.
 */
function resolveTool(tool: Tool, env: NodeJS.ProcessEnv): Tool | null {
  if (!tool.template.includes("{{env:")) return tool;
  let missing = false;
  const template = tool.template.replace(ENV_MARKER, (_, name: string) => {
    const v = env[name];
    if (!v) {
      missing = true;
      return "";
    }
    return v;
  });
  if (missing) return null;
  return { ...tool, template };
}

/**
 * Return the live tool set: env-key markers resolved, key-less tools dropped.
 * Pass an explicit env for testing; defaults to process.env.
 */
export function loadTools(env: NodeJS.ProcessEnv = process.env): Tool[] {
  const cat = loadRawCatalog();
  const out: Tool[] = [];
  for (const t of cat.tools) {
    const r = resolveTool(t, env);
    if (r) out.push(r);
  }
  return out;
}

/** List of env keys referenced by the catalog and whether each is set. */
export function envKeyStatus(env: NodeJS.ProcessEnv = process.env): { key: string; set: boolean; tools: number }[] {
  const cat = loadRawCatalog();
  const counts = new Map<string, number>();
  for (const t of cat.tools) {
    const seen = new Set<string>();
    for (const m of t.template.matchAll(ENV_MARKER)) {
      const key = m[1];
      if (!seen.has(key)) {
        seen.add(key);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
  }
  return [...counts.entries()].map(([key, tools]) => ({ key, set: !!env[key], tools }));
}
