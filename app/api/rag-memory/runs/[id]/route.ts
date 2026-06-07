/**
 * GET /api/rag-memory/runs/:id
 *
 * Permalink: returns the full stored ExplainableRun by id.
 */

import { getRunStore } from "../../../../../src/framework";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await ctx.params;
  const record = await getRunStore().get(id);
  if (!record) {
    return new Response(JSON.stringify({ error: "Run not found." }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }
  return new Response(JSON.stringify(record), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
