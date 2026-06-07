/**
 * Next.js App Router endpoint: POST /api/rag-memory/framework-run
 *
 * Drives the LangGraph workflow and returns an ExplainableRun.
 */

import { getSharedFrameworkContainer } from "../../../../src/framework";
import type { EngineMode, FrameworkInput } from "../../../../src/framework";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_MODES: EngineMode[] = ["auto", "rag", "memory", "long_context", "hybrid"];

interface RequestBody {
  userId?: unknown;
  conversationId?: unknown;
  message?: unknown;
  mode?: unknown;
}

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
    return jsonResponse({ error: "Field 'userId' is required." }, 400);
  }
  if (!isString(body.message) || body.message.trim().length === 0) {
    return jsonResponse({ error: "Field 'message' is required." }, 400);
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

  const input: FrameworkInput = {
    userId: body.userId,
    message: body.message,
    ...(isString(body.conversationId) ? { conversationId: body.conversationId } : {}),
    ...(mode ? { mode } : {}),
  };

  try {
    const { engine } = getSharedFrameworkContainer();
    const result = await engine.run(input);
    return jsonResponse(result, 200);
  } catch (error) {
    console.error("[framework-run] engine.run failed:", error);
    return jsonResponse(
      { error: "Framework engine failed. See server logs." },
      500
    );
  }
}
