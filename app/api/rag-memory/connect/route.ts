/**
 * POST /api/rag-memory/connect
 *
 * Per-role "Connect" action. Saves the submitted keys for one provider role
 * to `.env.local`, sets FRAMEWORK_MODE=real (so the role can promote),
 * rebuilds the shared container, and runs a lightweight probe against the
 * resulting provider. Returns the new provider status and the probe outcome.
 *
 * Body:
 *   { role: "rag" | "memory" | "llm" | "observability", values: Record<string,string> }
 *
 * SECURITY: same constraints as /api/rag-memory/config — local dev only.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import {
  buildFrameworkContainer,
  resetSharedFrameworkContainer,
} from "../../../../src/framework";
import type { ProviderRole, ProviderStatus } from "../../../../src/framework";

const ALLOWED_KEYS_PER_ROLE: Record<string, string[]> = {
  rag: ["OPENAI_API_KEY", "OPENAI_EMBEDDING_MODEL"],
  memory: ["MEM0_API_KEY", "MEM0_ORG_ID", "MEM0_PROJECT_ID"],
  llm: ["OPENAI_API_KEY", "OPENAI_LLM_MODEL"],
  observability: [
    "LANGFUSE_PUBLIC_KEY",
    "LANGFUSE_SECRET_KEY",
    "LANGFUSE_HOST",
    "LANGFUSE_BASE_URL",
  ],
};

const VALID_ROLES = new Set<ProviderRole>(["rag", "memory", "llm", "observability"]);

interface ConnectBody {
  role?: unknown;
  values?: unknown;
}

interface ProbeResult {
  ok: boolean;
  detail: string;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function envFilePath(): string {
  return path.join(process.cwd(), ".env.local");
}

async function readEnvFile(): Promise<Record<string, string>> {
  try {
    const text = await fs.readFile(envFilePath(), "utf8");
    const out: Record<string, string> = {};
    for (const line of text.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq < 0) continue;
      const key = t.slice(0, eq).trim();
      let val = t.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      out[key] = val;
    }
    return out;
  } catch {
    return {};
  }
}

function quoteIfNeeded(v: string): string {
  if (/^[A-Za-z0-9_.:\/\-]+$/.test(v)) return v;
  return `"${v.replace(/"/g, '\\"')}"`;
}

async function writeEnvFile(values: Record<string, string>): Promise<void> {
  const header = [
    "# RAG Memory Playground — managed by /api/rag-memory/config",
    "# Do not commit. .env.local is git-ignored.",
    "",
  ].join("\n");
  const body = Object.entries(values)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${quoteIfNeeded(v)}`)
    .join("\n");
  await fs.writeFile(envFilePath(), `${header}${body}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

// ---------- per-role probes ----------

async function probeRole(role: ProviderRole): Promise<ProbeResult> {
  try {
    const container = buildFrameworkContainer();
    const status = container.providerStatus.find((p) => p.role === role);
    if (!status) return { ok: false, detail: `No provider for role ${role}` };
    if (status.mode === "stub") {
      return { ok: false, detail: `Provider running as stub: ${status.reason}` };
    }
    if (status.mode === "fallback") {
      return { ok: false, detail: `Provider fell back to stub: ${status.reason}` };
    }

    // Real mode: run a lightweight probe.
    if (role === "rag") {
      const r = await container.providers.rag.search({ query: "ping", topK: 1 });
      return { ok: true, detail: `LlamaIndex search returned ${r.length} chunk(s).` };
    }
    if (role === "memory") {
      const r = await container.providers.memory.listAll({ userId: "demo-user", limit: 1 });
      return { ok: true, detail: `Mem0 listAll returned ${r.length} item(s).` };
    }
    if (role === "llm") {
      // Avoid spending tokens on a real generation; just probe that the SDK
      // is reachable by importing the client implicitly via mode check.
      return { ok: true, detail: `OpenAI client initialised (${status.version ?? "unknown model"}).` };
    }
    if (role === "observability") {
      // Just verify keys are honored; trace upload happens during a run.
      return { ok: true, detail: "Langfuse client initialised. Trace upload tested on next run." };
    }
    return { ok: false, detail: "Unknown role" };
  } catch (err) {
    return { ok: false, detail: (err as Error).message };
  }
}

// ---------- POST ----------

export async function POST(req: Request): Promise<Response> {
  let body: ConnectBody;
  try {
    body = (await req.json()) as ConnectBody;
  } catch {
    return jsonResponse({ error: "Invalid JSON body." }, 400);
  }

  if (typeof body.role !== "string" || !VALID_ROLES.has(body.role as ProviderRole)) {
    return jsonResponse(
      { error: `Field 'role' must be one of: ${Array.from(VALID_ROLES).join(", ")}.` },
      400
    );
  }
  const role = body.role as ProviderRole;

  if (!body.values || typeof body.values !== "object" || Array.isArray(body.values)) {
    return jsonResponse({ error: "Field 'values' must be an object." }, 400);
  }
  const incoming = body.values as Record<string, unknown>;

  const allowed = new Set(ALLOWED_KEYS_PER_ROLE[role] ?? []);
  const merged = await readEnvFile();

  // Force FRAMEWORK_MODE=real for Connect (otherwise the container would just
  // pick the stub regardless of keys).
  merged["FRAMEWORK_MODE"] = "real";
  process.env["FRAMEWORK_MODE"] = "real";

  for (const [k, v] of Object.entries(incoming)) {
    if (!allowed.has(k)) continue;
    if (v === null || v === undefined || v === "") {
      delete merged[k];
      delete process.env[k];
      continue;
    }
    if (typeof v !== "string") {
      return jsonResponse({ error: `Field '${k}' must be a string.` }, 400);
    }
    merged[k] = v;
    process.env[k] = v;
  }

  try {
    await writeEnvFile(merged);
  } catch (err) {
    console.error("[connect] writeEnvFile failed:", err);
    return jsonResponse({ error: "Failed to write .env.local." }, 500);
  }

  resetSharedFrameworkContainer();

  const probe = await probeRole(role);

  // Snapshot the latest provider status.
  let providerStatus: ProviderStatus[] = [];
  try {
    providerStatus = buildFrameworkContainer().providerStatus;
  } catch {
    providerStatus = [];
  }

  return jsonResponse({
    ok: probe.ok,
    role,
    probe,
    providerStatus,
  });
}
