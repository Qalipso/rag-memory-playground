/**
 * Next.js App Router endpoint: POST /api/rag-memory/run
 *
 * Wire-up:
 *   1. Drop this file into a Next.js 13+ project at `app/api/rag-memory/run/route.ts`.
 *   2. Ensure `@/lib/rag-memory` (or the src/ path used here) resolves to the
 *      engine entry point exported from `src/index.ts`.
 *
 * This file is framework-agnostic enough that the import path may need a small
 * adjustment in your Next.js app's tsconfig paths. Phase 1 uses the package's
 * own src/index for self-contained typechecking.
 */

import { ragMemoryEngine } from "../../../../src/index.js";
import type { EngineMode, RagMemoryInput } from "../../../../src/index.js";

interface RequestBody {
  userId?: unknown;
  conversationId?: unknown;
  message?: unknown;
  mode?: unknown;
  config?: unknown;
}

const VALID_MODES: EngineMode[] = ["auto", "rag", "memory", "long_context", "hybrid"];

function isString(x: unknown): x is string {
  return typeof x === "string";
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function POST(req: Request): Promise<Response> {
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return jsonResponse({ error: "Invalid JSON body." }, 400);
  }

  if (!isString(body.userId) || body.userId.trim().length === 0) {
    return jsonResponse({ error: "Field 'userId' is required and must be a non-empty string." }, 400);
  }

  if (!isString(body.message) || body.message.trim().length === 0) {
    return jsonResponse({ error: "Field 'message' is required and must be a non-empty string." }, 400);
  }

  let mode: EngineMode | undefined;
  if (body.mode !== undefined) {
    if (!isString(body.mode) || !(VALID_MODES as string[]).includes(body.mode)) {
      return jsonResponse(
        { error: `Field 'mode' must be one of: ${VALID_MODES.join(", ")}.` },
        400
      );
    }
    mode = body.mode as EngineMode;
  }

  const input: RagMemoryInput = {
    userId: body.userId,
    message: body.message,
    ...(isString(body.conversationId) ? { conversationId: body.conversationId } : {}),
    ...(mode ? { mode } : {}),
    ...(isPartialConfig(body.config) ? { config: body.config } : {}),
  };

  try {
    const result = await ragMemoryEngine.run(input);
    return jsonResponse(result, 200);
  } catch (error) {
    // Log full error server-side; return safe message to client.
    console.error("[rag-memory] engine.run failed:", error);
    return jsonResponse(
      { error: "Failed to run RAG Memory engine. See server logs for details." },
      500
    );
  }
}

function isPartialConfig(x: unknown): x is RagMemoryInput["config"] {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}
