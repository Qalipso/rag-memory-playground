import type {
  EvaluationsResult,
  FinalContext,
  ProviderMode,
  RetrievedDocument,
  RetrievedMemory,
  Route,
} from "../types.js";

export interface EvaluationInput {
  question: string;
  answer: string;
  route: Route;
  context: FinalContext;
  documents: RetrievedDocument[];
  memories: RetrievedMemory[];
}

export interface EvaluationProvider {
  readonly name: string;
  readonly framework: string;
  readonly mode: ProviderMode;
  readonly version?: string;
  readonly requiredEnvVars: string[];
  isConfigured(): boolean;
  evaluate(input: EvaluationInput): Promise<EvaluationsResult>;
}
