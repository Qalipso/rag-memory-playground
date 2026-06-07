/**
 * GET /api/rag-memory/runs?userId=demo-user&limit=50
 *
 * Lists recent run summaries (id, message, route, faithfulness, latency).
 */

import { getRunStore } from "../../../../src/framework";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const userId = url.searchParams.get("userId")?.trim() || "demo-user";
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit")) || 50));
  const store = getRunStore();
  const runs = await store.list(userId, limit);
  return new Response(JSON.stringify({ userId, backend: store.backend, runs }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
