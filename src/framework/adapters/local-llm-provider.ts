import type {
  LLMGenerateInput,
  LLMProvider,
} from "../ports/llm-provider.port.js";

/**
 * Deterministic local LLM that narrates the route and context.
 * Replace with OpenAILLMProvider when OPENAI_API_KEY is set.
 */
export class LocalLLMProvider implements LLMProvider {
  readonly name = "local-llm";
  readonly framework = "deterministic-template";
  readonly mode = "stub" as const;
  readonly version = "0.3.0";
  readonly requiredEnvVars: string[] = [];
  isConfigured(): boolean {
    return true;
  }

  async generate(input: LLMGenerateInput): Promise<string> {
    const { message, route, context } = input;

    const lines: string[] = [];
    lines.push(
      `Local LLM (deterministic). Route: ${route.mode}, confidence ${route.confidence.toFixed(2)}.`
    );
    lines.push(`Reason: ${route.reason}`);
    lines.push(
      `Context size: ${context.tokensEstimate} tokens (system + memories + documents).`
    );

    if (context.memoryBlock.trim().length > 0) {
      const head = context.memoryBlock.split("\n")[0]?.slice(0, 120) ?? "";
      lines.push(`Memory anchor: ${head}`);
    }
    if (context.documentBlock.trim().length > 0) {
      const head = context.documentBlock.split("\n")[0]?.slice(0, 120) ?? "";
      lines.push(`Document anchor: ${head}`);
    }

    lines.push(`User asked: "${truncate(message, 100)}"`);
    lines.push(
      "Answer (stub): grounded synthesis would go here when a real LLM provider is wired in."
    );
    return lines.join("\n");
  }
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}
