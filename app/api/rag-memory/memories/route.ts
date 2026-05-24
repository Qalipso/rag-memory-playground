/**
 * Next.js App Router endpoint: GET /api/rag-memory/memories?userId=demo-user
 *
 * Returns every memory the active MemoryProvider holds for a user, plus
 * provider status, so the memory-graph tab can render the full store.
 */

import { getSharedFrameworkContainer } from "../../../../src/framework";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const userId = url.searchParams.get("userId");

  if (!userId || userId.trim().length === 0) {
    return jsonResponse({ error: "Query param 'userId' is required." }, 400);
  }

  const limitRaw = url.searchParams.get("limit");
  const limit = limitRaw ? Math.max(1, Math.min(500, parseInt(limitRaw, 10))) : 200;

  try {
    const { providers, providerStatus } = getSharedFrameworkContainer();
    const memories = await providers.memory.listAll({ userId, limit });

    const memoryStatus = providerStatus.find((p) => p.role === "memory");

    return jsonResponse({
      userId,
      provider: memoryStatus ?? null,
      memories,
      count: memories.length,
    });
  } catch (error) {
    console.error("[memories] listAll failed:", error);
    return jsonResponse(
      { error: "Failed to list memories. See server logs." },
      500
    );
  }
}
