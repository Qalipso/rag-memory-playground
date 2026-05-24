import type { FinalContext, ProviderMode, Route } from "../types.js";

export interface LLMGenerateInput {
  message: string;
  route: Route;
  context: FinalContext;
}

export interface LLMProvider {
  readonly name: string;
  readonly framework: string;
  readonly mode: ProviderMode;
  readonly version?: string;
  readonly requiredEnvVars: string[];
  isConfigured(): boolean;
  generate(input: LLMGenerateInput): Promise<string>;
}
