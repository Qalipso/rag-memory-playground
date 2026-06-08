/**
 * POST /api/gold/seed
 *
 * Seeds the Gold Memory Lab corpus into long-term memory via the real
 * memory-formation pipeline. Idempotent unless { force: true }.
 * GET returns whether the gold user already has memory.
 */

import { seedGoldMemory, GOLD_USER_ID } from "../../../../src/framework/gold";
import { getMemoryStore } from "../../../../src/framework";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function GET(): Promise<Response> {
  const store = getMemoryStore();
  const blocks = await store.activeBlocks(GOLD_USER_ID);
  return json({ userId: GOLD_USER_ID, backend: store.backend, seeded: blocks.length > 0, blocks: blocks.length });
}

export async function POST(req: Request): Promise<Response> {
  let force = false;
  try {
    const body = (await req.json()) as { force?: unknown };
    force = body?.force === true;
  } catch {
    // empty body is fine
  }
  try {
    const result = await seedGoldMemory({ force });
    return json(result);
  } catch (error) {
    console.error("[gold/seed] failed:", error);
    return json({ error: "Gold memory seeding failed. See server logs." }, 500);
  }
}
