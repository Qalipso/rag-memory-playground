import type {
  LLMGenerateInput,
  LLMProvider,
} from "../ports/llm-provider.port.js";

/**
 * OpenAI chat completion adapter.
 *
 * Lazy-imports the `openai` SDK. Requires OPENAI_API_KEY.
 * Default model: gpt-4o-mini (fast + cheap, good for playground iteration).
 */
export interface OpenAILLMOptions {
  apiKey?: string;
  model?: string;
  temperature?: number;
}

export class OpenAILLMProvider implements LLMProvider {
  readonly name = "openai";
  readonly framework = "OpenAI Chat Completions";
  readonly mode = "real" as const;
  readonly version: string;
  readonly requiredEnvVars: string[] = ["OPENAI_API_KEY"];

  private readonly apiKey: string;
  private readonly model: string;
  private readonly temperature: number;
  private clientPromise: Promise<OpenAILike> | null = null;

  constructor(opts: OpenAILLMOptions = {}) {
    const apiKey = opts.apiKey ?? process.env["OPENAI_API_KEY"];
    if (!apiKey) {
      throw new Error("OpenAILLMProvider requires OPENAI_API_KEY.");
    }
    this.apiKey = apiKey;
    this.model = opts.model ?? process.env["OPENAI_LLM_MODEL"] ?? "gpt-4o-mini";
    this.temperature = opts.temperature ?? 0.2;
    this.version = this.model;
  }

  isConfigured(): boolean {
    return Boolean(process.env["OPENAI_API_KEY"]);
  }

  async generate(input: LLMGenerateInput): Promise<string> {
    const client = await this.getClient();
    const res = await client.chat.completions.create({
      model: this.model,
      temperature: this.temperature,
      messages: [
        { role: "system", content: input.context.systemPrompt },
        { role: "user", content: input.context.finalPrompt },
      ],
    });
    const choice = res.choices[0];
    return choice?.message?.content ?? "";
  }

  private async getClient(): Promise<OpenAILike> {
    if (!this.clientPromise) {
      this.clientPromise = (async () => {
        const mod = (await import("openai")) as { default: new (o: { apiKey: string }) => OpenAILike };
        return new mod.default({ apiKey: this.apiKey });
      })();
    }
    return this.clientPromise;
  }
}

interface OpenAILike {
  chat: {
    completions: {
      create(args: {
        model: string;
        temperature?: number;
        messages: { role: "system" | "user" | "assistant"; content: string }[];
      }): Promise<{ choices: { message?: { content?: string } }[] }>;
    };
  };
}
