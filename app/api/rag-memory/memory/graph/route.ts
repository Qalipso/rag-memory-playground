/**
 * GET /api/rag-memory/memory/graph?userId=demo-user
 *
 * Returns the current memory graph snapshot (blocks + edges + entities) for a
 * user, built from the formation store.
 */

import { getMemoryStore } from "../../../../../src/framework";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const userId = url.searchParams.get("userId")?.trim() || "demo-user";
  const store = getMemoryStore();
  const snapshot = await store.snapshot(userId);
  return new Response(JSON.stringify({ userId, backend: store.backend, ...snapshot }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
