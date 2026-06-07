/**
 * POST /api/rag-memory/memory/form
 *
 * Runs the memory-formation pipeline on a raw note and returns the full result
 * (normalized text, classification, entities, multi-level blocks, new graph
 * edges, per-stage trace, provider status, failure modes).
 */

import { formMemory } from "../../../../../src/framework";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  userId?: unknown;
  text?: unknown;
}

function isString(x: unknown): x is string {
  return typeof x === "string";
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function POST(req: Request): Promise<Response> {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  const userId = isString(body.userId) && body.userId.trim() ? body.userId.trim() : "demo-user";
  if (!isString(body.text) || body.text.trim().length === 0) {
    return json({ error: "Field 'text' is required." }, 400);
  }
  if (body.text.length > 5000) {
    return json({ error: "Note too long (max 5000 chars)." }, 400);
  }

  try {
    const result = await formMemory({ userId, text: body.text });
    return json(result, 200);
  } catch (error) {
    console.error("[memory/form] failed:", error);
    return json({ error: "Memory formation failed. See server logs." }, 500);
  }
}
