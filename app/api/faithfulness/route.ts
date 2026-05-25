import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { z } from "zod";

const DAILY_CAP_USD = 2;
let dailySpend = 0;
let capResetDay = new Date().toDateString();

function checkCap(cost: number): boolean {
  const today = new Date().toDateString();
  if (today !== capResetDay) {
    dailySpend = 0;
    capResetDay = today;
  }
  if (dailySpend + cost > DAILY_CAP_USD) return false;
  dailySpend += cost;
  return true;
}

const FAITHFULNESS_PROMPT = `You are an AI evaluation expert. Judge whether the answer is faithful to the provided contexts.

Faithfulness measures: does the answer only contain claims that are supported by the retrieved contexts?

Score on a scale of 0.0 to 1.0:
0.0 - Completely unfaithful. Answer contradicts or ignores the contexts.
0.5 - Partially faithful. Some claims supported, some not.
1.0 - Fully faithful. Every claim is grounded in the provided contexts.

Return JSON:
- score: float 0.0–1.0
- rationale: 1-3 sentences with specific evidence`;

const FaithfulnessResponseSchema = z.object({
  score: z.number().min(0).max(1),
  rationale: z.string().min(10).max(500),
});

const RequestSchema = z.object({
  answer: z.string().min(1).max(3000),
  contexts: z.array(z.string().min(1).max(2000)).min(1).max(10),
});

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }

  const { answer, contexts } = parsed.data;

  // Estimate cost before calling ($0.15/1M input, $0.60/1M output for gpt-4o-mini)
  const estimatedCost = 0.001;
  if (!checkCap(estimatedCost)) {
    return NextResponse.json({ error: "Daily cost cap reached ($2/day). Try again tomorrow." }, { status: 429 });
  }

  const client = new OpenAI({ apiKey });

  const contextBlock = contexts.map((c, i) => `[Context ${i + 1}]\n${c}`).join("\n\n");
  const userMessage = `Answer to evaluate:\n${answer}\n\nRetrieved contexts:\n${contextBlock}`;

  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: FAITHFULNESS_PROMPT },
      { role: "user", content: userMessage },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  const evalResult = FaithfulnessResponseSchema.parse(JSON.parse(raw));

  const inputTokens = completion.usage?.prompt_tokens ?? 0;
  const outputTokens = completion.usage?.completion_tokens ?? 0;
  const cost_usd = (inputTokens / 1_000_000) * 0.15 + (outputTokens / 1_000_000) * 0.60;

  return NextResponse.json({
    score: evalResult.score,
    rationale: evalResult.rationale,
    model: "gpt-4o-mini",
    cost_usd,
    daily_spend_usd: dailySpend,
  });
}
