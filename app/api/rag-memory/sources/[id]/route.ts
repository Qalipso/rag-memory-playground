/**
 * DELETE /api/rag-memory/sources/[id]                  → remove a source.
 * POST   /api/rag-memory/sources/[id]                  → action handler:
 *                                                          { action: "resync" | "test", query? }
 */

import { getSharedFrameworkContainer } from "../../../../../src/framework";
import { getKnowledgeStore } from "../../../../../src/framework/knowledge/store";

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

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await ctx.params;
  const ok = getKnowledgeStore().delete(id);
  if (!ok) return jsonResponse({ error: "Source not found." }, 404);
  return jsonResponse({ ok: true, id });
}

interface ActionBody {
  action?: unknown;
  query?: unknown;
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await ctx.params;
  let body: ActionBody;
  try {
    body = (await req.json()) as ActionBody;
  } catch {
    return jsonResponse({ error: "Invalid JSON body." }, 400);
  }

  const store = getKnowledgeStore();
  const existing = store.getById(id);
  if (!existing) return jsonResponse({ error: "Source not found." }, 404);

  if (body.action === "resync") {
    const source = await store.resync(id, currentRagMode());
    if (!source) return jsonResponse({ error: "Source not found." }, 404);
    return jsonResponse({ ok: source.status === "indexed", source });
  }

  if (body.action === "test") {
    const query =
      typeof body.query === "string" && body.query.trim().length > 0
        ? body.query.trim()
        : existing.source.title;

    const { engine } = getSharedFrameworkContainer();
    const run = await engine.run({
      userId: "demo-user",
      message: query,
      mode: "rag",
    });

    // Surface only the hits that came from THIS source.
    const ours = run.retrievedDocuments.filter((d) => {
      const sid = (d.metadata as Record<string, unknown> | undefined)?.["sourceId"];
      return sid === id || d.id.startsWith(`${id}_chunk_`);
    });

    return jsonResponse({
      ok: ours.length > 0,
      query,
      hits: ours.map((h) => ({
        id: h.id,
        title: h.title,
        score: h.score,
        reason: h.reason,
      })),
      totalHits: run.retrievedDocuments.length,
      providerMode: existing.source.providerMode,
    });
  }

  return jsonResponse({ error: "Field 'action' must be 'resync' or 'test'." }, 400);
}
