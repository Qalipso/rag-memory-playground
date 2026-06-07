/**
 * OpenAI LLM-as-judge evaluator (real eval).
 *
 * Scores faithfulness / context relevance / answer relevance with a model call
 * instead of heuristics. Safety:
 *   - daily call cap (EVAL_DAILY_MAX_CALLS, default 200) to bound cost
 *   - never throws: any error or cap hit falls back to the deterministic
 *     evaluator and appends a warning, so the workflow node always succeeds
 *
 * Honesty: provider mode is "real" (judge is the configured evaluator). When a
 * call falls back, the result carries a `judge_fallback` warning.
 */

import type {
  EvaluationInput,
  EvaluationProvider,
} from "../ports/evaluation-provider.port.js";
import type { EvaluationsResult } from "../types.js";
import { DeterministicEvaluator } from "./deterministic-evaluator.js";

const DEFAULT_DAILY_MAX_CALLS = 200;

interface JudgeJson {
  faithfulness?: number;
  context_relevance?: number;
  answer_relevance?: number;
  notes?: string;
}

// Per-process daily call counter (resets at UTC day boundary).
let callDay = new Date().toUTCString().slice(0, 16);
let callsToday = 0;

function withinCallCap(): boolean {
  const today = new Date().toUTCString().slice(0, 16);
  if (today !== callDay) {
    callDay = today;
    callsToday = 0;
  }
  const cap = Number(process.env["EVAL_DAILY_MAX_CALLS"]) || DEFAULT_DAILY_MAX_CALLS;
  if (callsToday >= cap) return false;
  callsToday++;
  return true;
}

export class OpenAIJudgeEvaluator implements EvaluationProvider {
  readonly name = "openai-judge";
  readonly framework = "LLM-as-judge (OpenAI)";
  readonly mode = "real" as const;
  readonly version = "0.4.0";
  readonly requiredEnvVars = ["OPENAI_API_KEY"];

  private readonly model: string;
  private readonly fallback = new DeterministicEvaluator();

  constructor(model?: string) {
    this.model = model ?? process.env["OPENAI_LLM_MODEL"] ?? "gpt-4o-mini";
  }

  isConfigured(): boolean {
    return Boolean(process.env["OPENAI_API_KEY"]);
  }

  async evaluate(input: EvaluationInput): Promise<EvaluationsResult> {
    if (!this.isConfigured() || !withinCallCap()) {
      return this.fallbackResult(
        input,
        !this.isConfigured() ? "OPENAI_API_KEY missing" : "daily judge call cap reached"
      );
    }

    try {
      const judged = await this.judge(input);
      return judged;
    } catch (err) {
      return this.fallbackResult(input, `judge call failed: ${(err as Error).message}`);
    }
  }

  private async judge(input: EvaluationInput): Promise<EvaluationsResult> {
    const { default: OpenAI } = await import("openai");
    const client = new OpenAI({ apiKey: process.env["OPENAI_API_KEY"] });

    const context = [input.context.memoryBlock, input.context.documentBlock]
      .filter(Boolean)
      .join("\n\n")
      .slice(0, 6000);

    const completion = await client.chat.completions.create({
      model: this.model,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are a strict RAG answer evaluator. Score three metrics in [0,1]: " +
            "faithfulness (is the answer supported by the context, no hallucination), " +
            "context_relevance (is the retrieved context relevant to the question), " +
            "answer_relevance (does the answer address the question). " +
            "Return JSON: {faithfulness, context_relevance, answer_relevance, notes}.",
        },
        {
          role: "user",
          content: `Question:\n${input.question}\n\nContext:\n${context || "(none)"}\n\nAnswer:\n${input.answer}`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const j = JSON.parse(raw) as JudgeJson;
    const notes = typeof j.notes === "string" ? j.notes : "";

    const warnings: string[] = [];
    if (input.documents.length + input.memories.length === 0) {
      warnings.push("No documents or memories retrieved; answer is unanchored.");
    }

    return {
      faithfulness: {
        name: "faithfulness",
        score: clamp01(j.faithfulness),
        explanation: `LLM judge (${this.model}). ${notes}`.trim(),
      },
      contextRelevance: {
        name: "context_relevance",
        score: clamp01(j.context_relevance),
        explanation: `LLM judge (${this.model}).`,
      },
      answerRelevance: {
        name: "answer_relevance",
        score: clamp01(j.answer_relevance),
        explanation: `LLM judge (${this.model}).`,
      },
      custom: [],
      warnings,
    };
  }

  private async fallbackResult(
    input: EvaluationInput,
    reason: string
  ): Promise<EvaluationsResult> {
    const base = await this.fallback.evaluate(input);
    return { ...base, warnings: [...base.warnings, `judge_fallback: ${reason}`] };
  }
}

function clamp01(n: unknown): number {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.round(Math.min(1, Math.max(0, v)) * 100) / 100;
}
