// Shared client-side types + visual constants for the Gold Memory Lab UI.

export const GOLD_USER_ID_CLIENT = "gold-lab";

export interface GoldNode {
  id: string;
  type: string;
  label: string;
  summary?: string;
  year?: number;
  startYear?: number;
  endYear?: number;
  data?: Record<string, unknown>;
}

export interface GoldEdge {
  id: string;
  from: string;
  to: string;
  type: string;
  label?: string;
  weight?: number;
}

export interface GoldRegime {
  id: string;
  name: string;
  startYear: number;
  endYear: number;
  summary: string;
  characteristics: string[];
  macroFactors: string[];
}

export interface AnnualPrice {
  year: number;
  priceUsd: number;
  regimeId: string;
  note: string;
}

export interface GoldGraphResponse {
  nodes: GoldNode[];
  edges: GoldEdge[];
  regimes: GoldRegime[];
  annual: AnnualPrice[];
  nodeTypes: string[];
  edgeTypes: string[];
  totals: { nodes: number; edges: number };
}

export interface RetrievedDocument {
  id: string;
  title: string;
  content: string;
  source: string;
  score: number;
  reason: string;
}

export interface RetrievedMemory {
  id: string;
  type: string;
  content: string;
  score: number;
  reason: string;
}

export interface FailureMode {
  id: string;
  type: string;
  description: string;
  severity: "info" | "warn" | "critical";
}

export interface ExplainableRun {
  runId: string;
  route: { mode: string; reason: string; confidence: number };
  answer: string;
  retrievedDocuments: RetrievedDocument[];
  retrievedMemories: RetrievedMemory[];
  finalContext: { tokensEstimate: number };
  evaluations: {
    faithfulness: { score: number; explanation: string };
    contextRelevance: { score: number; explanation: string };
    answerRelevance: { score: number; explanation: string };
  };
  failureModes: FailureMode[];
  meta: { totalDurationMs: number; frameworks: { llm: { mode: string; name: string } } };
}

export interface AskMetrics {
  routeMode: string;
  documents: number;
  memories: number;
  confidence: number;
  contextRelevance: number;
  answerRelevance: number;
  failureModes: number;
  estimatedCostUsd: number;
  latencyMs: number;
  llmMode: string;
}

export interface AskResponse {
  run: ExplainableRun;
  subgraph: { nodes: GoldNode[]; edges: GoldEdge[] };
  metrics: AskMetrics;
}

// 11 gold node types → distinct colors.
export const NODE_COLORS: Record<string, string> = {
  Event: "#fbbf24",
  Regime: "#f59e0b",
  PricePoint: "#fcd34d",
  MacroFactor: "#5eead4",
  CentralBank: "#7dd3fc",
  Country: "#a5b4fc",
  PolicyAction: "#c4b5fd",
  Narrative: "#f9a8d4",
  Hypothesis: "#34d399",
  Counterexample: "#fb7185",
  Source: "#94a3b8",
};

export const EDGE_COLORS: Record<string, string> = {
  happened_during: "#52525b",
  triggered: "#fbbf24",
  coincided_with: "#3f3f46",
  increased_gold_demand: "#34d399",
  reduced_gold_demand: "#fb7185",
  changed_monetary_regime: "#f59e0b",
  supports_hypothesis: "#22c55e",
  contradicts_hypothesis: "#ef4444",
  similar_to: "#7dd3fc",
  different_from: "#c084fc",
  source_for: "#3f3f46",
};

export const REGIME_COLORS: Record<string, string> = {
  official_price_era: "#94a3b8",
  bretton_woods: "#7dd3fc",
  fiat_transition: "#a5b4fc",
  great_inflation_bull: "#fbbf24",
  strong_dollar_disinflation: "#34d399",
  post2008_expansion: "#f59e0b",
  reserve_diversification: "#fb7185",
};

export function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

export function modeTone(m: string): "good" | "warn" | "neutral" {
  return m === "real" ? "good" : m === "fallback" ? "warn" : "neutral";
}
