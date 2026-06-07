/**
 * POST /api/rag-memory/memory/consolidate
 *
 * Runs a consolidation pass for a user: merges near-duplicate blocks of the same
 * level (marking older 'merged', adding 'supersedes' edges). Returns counts and
 * the updated graph snapshot.
 */

import { consolidateMemory, getMemoryStore } from "../../../../../src/framework";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  userId?: unknown;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function POST(req: Request): Promise<Response> {
  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    // empty body is fine
  }
  const userId =
    typeof body.userId === "string" && body.userId.trim() ? body.userId.trim() : "demo-user";

  const result = await consolidateMemory(userId);
  const snapshot = await getMemoryStore().snapshot(userId);
  return json({ userId, ...result, snapshot }, 200);
}
