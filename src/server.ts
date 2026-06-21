/**
 * Local HTTP API — zero dependencies (node:http).
 *
 * Endpoints (all JSON):
 *   GET  /health                         heartbeat + catalog/env summary
 *   GET  /catalog                        the full tool catalog (live set)
 *   POST /pivot    { kind, value }       enrich one selector (live fetch)
 *                  { seed: {...} }        ...or pass a seed; pivots each selector
 *   POST /tools    { inputs|seed, category? }   render catalog URLs
 *   POST /lookup   { seed: {...} }        combined pivot + tools
 *
 * The request body uses the same seed shape as the PRISM API, so a client
 * written against PRISM can point at this local server with minimal changes.
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { pivot, PIVOTABLE_KINDS, type PivotKind } from "./pivot.ts";
import { loadTools, envKeyStatus, loadRawCatalog } from "./catalog.ts";
import {
  lookup,
  runTools,
  seedToInputs,
  seedPivotTargets,
  type Seed,
} from "./lib.ts";
import type { RunnerInputs } from "./tools-runner.ts";

function json(res: ServerResponse, status: number, body: unknown) {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET,POST,OPTIONS",
  });
  res.end(payload);
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > 1_000_000) req.destroy(); // 1MB guard
    });
    req.on("end", () => {
      if (!data.trim()) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch {
        resolve({ __parse_error: true });
      }
    });
    req.on("error", () => resolve({}));
  });
}

async function handlePivot(body: Record<string, unknown>) {
  // Single selector: { kind, value }
  if (typeof body.kind === "string" && typeof body.value === "string") {
    const kind = body.kind as PivotKind;
    if (!PIVOTABLE_KINDS.includes(kind)) {
      return { status: 400, body: { error: "unsupported_kind", supported: PIVOTABLE_KINDS } };
    }
    const result = await pivot({ kind, value: body.value });
    return { status: 200, body: result };
  }
  // Seed object: pivot every pivot-able selector
  if (body.seed && typeof body.seed === "object") {
    const targets = seedPivotTargets(body.seed as Seed);
    if (!targets.length) {
      return { status: 400, body: { error: "no_pivotable_selector", supported: PIVOTABLE_KINDS } };
    }
    const settled = await Promise.allSettled(targets.map((t) => pivot(t)));
    const results = settled.filter((s) => s.status === "fulfilled").map((s) => (s as PromiseFulfilledResult<unknown>).value);
    return { status: 200, body: { pivot: results } };
  }
  return { status: 400, body: { error: "bad_request", hint: "send { kind, value } or { seed: {...} }" } };
}

function bodyToInputs(body: Record<string, unknown>): RunnerInputs {
  if (body.inputs && typeof body.inputs === "object") return body.inputs as RunnerInputs;
  if (body.seed && typeof body.seed === "object") return seedToInputs(body.seed as Seed);
  return {};
}

export function createApp() {
  return createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const path = url.pathname;
    const method = req.method ?? "GET";

    if (method === "OPTIONS") return json(res, 204, {});

    try {
      if (method === "GET" && path === "/health") {
        const tools = loadTools();
        return json(res, 200, {
          ok: true,
          service: "osint-toolkit",
          version: "1.0.0",
          catalog: { live_tools: tools.length, generated_at: loadRawCatalog().generatedAt },
          env_keys: envKeyStatus(),
        });
      }

      if (method === "GET" && path === "/catalog") {
        const tools = loadTools();
        return json(res, 200, { count: tools.length, tools });
      }

      if (method === "POST" && path === "/pivot") {
        const body = await readBody(req);
        if (body.__parse_error) return json(res, 400, { error: "invalid_json" });
        const r = await handlePivot(body);
        return json(res, r.status, r.body);
      }

      if (method === "POST" && path === "/tools") {
        const body = await readBody(req);
        if (body.__parse_error) return json(res, 400, { error: "invalid_json" });
        const inputs = bodyToInputs(body);
        if (!Object.keys(inputs).length) {
          return json(res, 400, { error: "no_inputs", hint: "send { seed: {...} } or { inputs: {...} }" });
        }
        const category = typeof body.category === "string" ? body.category : undefined;
        const results = runTools(inputs, { category, excludeDead: body.excludeDead !== false });
        const total = Object.values(results).reduce((n, arr) => n + arr.length, 0);
        return json(res, 200, { inputs, total, categories: results });
      }

      if (method === "POST" && path === "/lookup") {
        const body = await readBody(req);
        if (body.__parse_error) return json(res, 400, { error: "invalid_json" });
        const seed = (body.seed ?? body) as Seed;
        const result = await lookup(seed, {
          pivot: body.pivot !== false,
          tools: body.tools !== false,
        });
        return json(res, 200, result);
      }

      return json(res, 404, { error: "not_found", routes: ["/health", "/catalog", "/pivot", "/tools", "/lookup"] });
    } catch (e) {
      return json(res, 500, { error: "internal_error", message: e instanceof Error ? e.message : String(e) });
    }
  });
}

export function startServer(port = Number(process.env.PORT) || 8787): void {
  const app = createApp();
  app.listen(port, () => {
    console.log(`osint-toolkit API listening on http://localhost:${port}`);
    console.log(`  GET  /health   GET /catalog`);
    console.log(`  POST /pivot    POST /tools    POST /lookup`);
  });
}
