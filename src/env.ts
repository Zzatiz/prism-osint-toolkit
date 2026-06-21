/**
 * Minimal .env loader — zero dependencies.
 *
 * Reads a .env file from the current working directory (if present) and copies
 * any keys that aren't already set into process.env. Intentionally tiny: no
 * interpolation, no quotes-stripping beyond a single surrounding pair.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

export function loadDotenv(cwd: string = process.cwd()): void {
  let text: string;
  try {
    text = readFileSync(join(cwd, ".env"), "utf8");
  } catch {
    return; // no .env — fine, everything has sensible defaults
  }
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (key && !(key in process.env)) process.env[key] = val;
  }
}
