/**
 * GET  /api/rag-memory/sources          → list all knowledge sources + stats.
 * POST /api/rag-memory/sources          → add a new source.
 *                                          Body: { action: "link" | "samples", url?, title?, tags? }
 *
 * SSRF defense lives in src/framework/knowledge/ingest.ts.
 */

import { getSharedFrameworkContainer } from "../../../../src/framework";
import { getKnowledgeStore } from "../../../../src/framework/knowledge/store";

interface AddBody {
  action?: unknown;
  url?: unknown;
  title?: unknown;
  tags?: unknown;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function currentRagMode(): "real" | "stub" | "fallback" {
  try {
    const c = getSharedFrameworkContainer();
    const rag = c.providerStatus.find((p) => p.role === "rag");
    return (rag?.mode ?? "stub") as "real" | "stub" | "fallback";
  } catch {
    return "stub";
  }
}

export async function GET(): Promise<Response> {
  const store = getKnowledgeStore();
  const sources = store.list();
  const totalChunks = store.allChunks().length;
  return jsonResponse({
    sources,
    totalSources: sources.length,
    totalChunks,
    ragMode: currentRagMode(),
  });
}

export async function POST(req: Request): Promise<Response> {
  let body: AddBody;
  try {
    body = (await req.json()) as AddBody;
  } catch {
    return jsonResponse({ error: "Invalid JSON body." }, 400);
  }

  const action = body.action;
  const store = getKnowledgeStore();
  const ragMode = currentRagMode();

  if (action === "samples") {
    const added = store.loadSamples(ragMode);
    return jsonResponse({ ok: true, added, total: store.list().length });
  }

  if (action === "link") {
    if (typeof body.url !== "string" || body.url.trim().length === 0) {
      return jsonResponse({ error: "Field 'url' is required for link action." }, 400);
    }
    try {
      // Validate URL early.
      new URL(body.url);
    } catch {
      return jsonResponse({ error: "Field 'url' is not a valid URL." }, 400);
    }

    const tags =
      Array.isArray(body.tags)
        ? (body.tags.filter((t) => typeof t === "string") as string[])
        : [];

    const source = await store.addLink({
      url: body.url,
      ...(typeof body.title === "string" ? { title: body.title } : {}),
      tags,
      providerMode: ragMode,
    });
    const status = source.status === "indexed" ? 200 : source.status === "failed" ? 502 : 202;
    return jsonResponse({ ok: source.status === "indexed", source }, status);
  }

  return jsonResponse(
    { error: "Field 'action' must be 'link' or 'samples'." },
    400
  );
}
