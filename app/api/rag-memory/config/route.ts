/**
 * GET  /api/rag-memory/config — returns masked env values + current provider status.
 * POST /api/rag-memory/config — persists submitted values to `.env.local`,
 *                                reloads them into process.env, and resets the
 *                                shared container so subsequent runs pick up
 *                                the new providers.
 *
 * SECURITY NOTE
 *   This endpoint accepts API keys via UI. It is meant for *local development
 *   only*. The dev server has no auth in front of it; do NOT expose this route
 *   on a public network. `.env.local` is git-ignored.
 *
 *   Values are stored in plain text on the local disk in `.env.local`.
 *   Responses always return masked previews (last 4 chars) — never raw keys.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import {
  buildFrameworkContainer,
  getSharedFrameworkContainer,
  resetSharedFrameworkContainer,
} from "../../../../src/framework";

interface ConfigBody {
  values?: Record<string, unknown>;
}

const MANAGED_KEYS = [
  "FRAMEWORK_MODE",
  "OPENAI_API_KEY",
  "OPENAI_LLM_MODEL",
  "OPENAI_EMBEDDING_MODEL",
  "MEM0_API_KEY",
  "MEM0_ORG_ID",
  "MEM0_PROJECT_ID",
  "LANGFUSE_PUBLIC_KEY",
  "LANGFUSE_SECRET_KEY",
  "LANGFUSE_HOST",
  "LANGFUSE_BASE_URL",
] as const;

type ManagedKey = (typeof MANAGED_KEYS)[number];

// Per-key descriptors shown in the UI.
const KEY_META: Record<
  ManagedKey,
  {
    label: string;
    role: "rag" | "memory" | "llm" | "observability" | "engine";
    secret: boolean;
    description: string;
    placeholder?: string;
  }
> = {
  FRAMEWORK_MODE: {
    label: "Framework mode",
    role: "engine",
    secret: false,
    description: "local (all stubs) or real (promote per provider when keys exist).",
    placeholder: "local | real",
  },
  OPENAI_API_KEY: {
    label: "OpenAI API key",
    role: "llm",
    secret: true,
    description: "Promotes both LlamaIndex retrieval and OpenAI chat completions.",
    placeholder: "sk-...",
  },
  OPENAI_LLM_MODEL: {
    label: "OpenAI chat model",
    role: "llm",
    secret: false,
    description: "Default: gpt-4o-mini.",
    placeholder: "gpt-4o-mini",
  },
  OPENAI_EMBEDDING_MODEL: {
    label: "OpenAI embedding model",
    role: "rag",
    secret: false,
    description: "Default: text-embedding-3-small.",
    placeholder: "text-embedding-3-small",
  },
  MEM0_API_KEY: {
    label: "Mem0 API key",
    role: "memory",
    secret: true,
    description: "Promotes memory provider to Mem0 cloud.",
    placeholder: "m0-...",
  },
  MEM0_ORG_ID: {
    label: "Mem0 org ID",
    role: "memory",
    secret: false,
    description: "Optional: organization scope.",
  },
  MEM0_PROJECT_ID: {
    label: "Mem0 project ID",
    role: "memory",
    secret: false,
    description: "Optional: project scope.",
  },
  LANGFUSE_PUBLIC_KEY: {
    label: "Langfuse public key",
    role: "observability",
    secret: true,
    description: "Required to enable Langfuse trace upload.",
    placeholder: "pk-lf-...",
  },
  LANGFUSE_SECRET_KEY: {
    label: "Langfuse secret key",
    role: "observability",
    secret: true,
    description: "Required to enable Langfuse trace upload.",
    placeholder: "sk-lf-...",
  },
  LANGFUSE_HOST: {
    label: "Langfuse host",
    role: "observability",
    secret: false,
    description: "Default: cloud.langfuse.com",
    placeholder: "https://cloud.langfuse.com",
  },
  LANGFUSE_BASE_URL: {
    label: "Langfuse base URL (legacy)",
    role: "observability",
    secret: false,
    description: "Alias of LANGFUSE_HOST for older SDKs.",
  },
};

function isManagedKey(k: string): k is ManagedKey {
  return (MANAGED_KEYS as readonly string[]).includes(k);
}

function mask(value: string | undefined, secret: boolean): string | null {
  if (!value) return null;
  if (!secret) return value;
  if (value.length <= 4) return "•".repeat(value.length);
  return "•".repeat(Math.max(4, value.length - 4)) + value.slice(-4);
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
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      out[key] = val;
    }
    return out;
  } catch {
    return {};
  }
}

function serializeEnv(values: Record<string, string>): string {
  const header = [
    "# RAG Memory Playground — managed by /api/rag-memory/config",
    "# Do not commit. .env.local is git-ignored.",
    "",
  ].join("\n");
  const body = Object.entries(values)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${quoteIfNeeded(v)}`)
    .join("\n");
  return `${header}${body}\n`;
}

function quoteIfNeeded(v: string): string {
  if (/^[A-Za-z0-9_.:\/\-]+$/.test(v)) return v;
  return `"${v.replace(/"/g, '\\"')}"`;
}

async function writeEnvFile(values: Record<string, string>): Promise<void> {
  const data = serializeEnv(values);
  await fs.writeFile(envFilePath(), data, { encoding: "utf8", mode: 0o600 });
}

// ---------- GET ----------

export async function GET(): Promise<Response> {
  const fileValues = await readEnvFile();

  const items = MANAGED_KEYS.map((key) => {
    const meta = KEY_META[key];
    // Prefer the file value (what user typed) so non-secret values are visible.
    // Secret values are always masked.
    const rawFromFile = fileValues[key];
    const rawFromProcess = process.env[key];
    const raw = rawFromFile ?? rawFromProcess;
    return {
      key,
      label: meta.label,
      role: meta.role,
      secret: meta.secret,
      description: meta.description,
      ...(meta.placeholder ? { placeholder: meta.placeholder } : {}),
      present: Boolean(raw),
      preview: mask(raw, meta.secret),
      source: rawFromFile !== undefined ? "file" : rawFromProcess !== undefined ? "env" : "missing",
    };
  });

  // Provider status from the current container (lazy).
  let providerStatus: Array<{ role: string; mode: "real" | "stub" | "fallback" }> = [];
  try {
    const { providerStatus: status } = getSharedFrameworkContainer();
    providerStatus = status;
  } catch {
    providerStatus = [];
  }

  return jsonResponse({
    items,
    providerStatus,
    envFile: envFilePath(),
    environment: summarizeEnvironment(providerStatus),
  });
}

function summarizeEnvironment(
  providerStatus: Array<{ role: string; mode: "real" | "stub" | "fallback" }>
): {
  mode: "local_demo" | "production" | "mixed";
  label: string;
  description: string;
  realRoles: string[];
  stubRoles: string[];
  fallbackRoles: string[];
} {
  // Evaluation role is always a stub for now; exclude from mode detection.
  const relevant = providerStatus.filter((p) => p.role !== "evaluation");
  const real = relevant.filter((p) => p.mode === "real").map((p) => p.role);
  const stub = relevant.filter((p) => p.mode === "stub").map((p) => p.role);
  const fallback = relevant.filter((p) => p.mode === "fallback").map((p) => p.role);

  if (real.length === 0 && fallback.length === 0) {
    return {
      mode: "local_demo",
      label: "Local Demo",
      description:
        "All providers run as local stubs. No API keys configured. Fast, free, fully offline.",
      realRoles: real,
      stubRoles: stub,
      fallbackRoles: fallback,
    };
  }
  if (real.length === relevant.length) {
    return {
      mode: "production",
      label: "Production",
      description:
        "All real providers connected and verified. Live calls to OpenAI / Mem0 / Langfuse.",
      realRoles: real,
      stubRoles: stub,
      fallbackRoles: fallback,
    };
  }
  return {
    mode: "mixed",
    label: "Mixed",
    description:
      "Some providers are real, others are stubs or fallbacks. See per-provider status.",
    realRoles: real,
    stubRoles: stub,
    fallbackRoles: fallback,
  };
}

// ---------- POST ----------

// Writing API keys to .env.local from an unauthenticated HTTP request is only
// safe on a local dev machine. Disabled unless ALLOW_RUNTIME_CONFIG=1, so a
// public deployment never exposes a secret-writing endpoint.
function runtimeConfigAllowed(): boolean {
  return process.env["ALLOW_RUNTIME_CONFIG"] === "1";
}

export async function POST(req: Request): Promise<Response> {
  if (!runtimeConfigAllowed()) {
    return jsonResponse(
      {
        error:
          "Runtime config writes are disabled. Set provider keys via environment variables, or set ALLOW_RUNTIME_CONFIG=1 for local development.",
      },
      403
    );
  }
  let body: ConfigBody;
  try {
    body = (await req.json()) as ConfigBody;
  } catch {
    return jsonResponse({ error: "Invalid JSON body." }, 400);
  }

  const incoming = body.values && typeof body.values === "object" ? body.values : null;
  if (!incoming) {
    return jsonResponse({ error: "Field 'values' must be an object." }, 400);
  }

  // Start from the existing file values so we don't drop unmanaged keys.
  const merged = await readEnvFile();

  for (const [k, v] of Object.entries(incoming)) {
    if (!isManagedKey(k)) {
      // Skip unmanaged keys silently.
      continue;
    }
    if (v === null || v === undefined || v === "") {
      delete merged[k];
      delete process.env[k];
      continue;
    }
    if (typeof v !== "string") {
      return jsonResponse(
        { error: `Field '${k}' must be a string.` },
        400
      );
    }
    merged[k] = v;
    process.env[k] = v;
  }

  // Persist to .env.local.
  try {
    await writeEnvFile(merged);
  } catch (e) {
    console.error("[config] writeEnvFile failed:", e);
    return jsonResponse(
      { error: "Failed to write .env.local. See server logs." },
      500
    );
  }

  // Reset the shared container so the next call rebuilds with the new env.
  resetSharedFrameworkContainer();

  // Build once now so we can return fresh provider status to the UI.
  let providerStatus: ReturnType<typeof buildFrameworkContainer>["providerStatus"] = [];
  try {
    providerStatus = buildFrameworkContainer().providerStatus;
  } catch {
    providerStatus = [];
  }

  // Return masked preview of what is now stored.
  const items = MANAGED_KEYS.map((key) => {
    const meta = KEY_META[key];
    const raw = merged[key];
    return {
      key,
      label: meta.label,
      role: meta.role,
      secret: meta.secret,
      present: Boolean(raw),
      preview: mask(raw, meta.secret),
    };
  });

  return jsonResponse({ ok: true, items, providerStatus });
}
