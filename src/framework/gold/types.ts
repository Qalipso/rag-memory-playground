/**
 * Gold Memory Lab domain types.
 *
 * A typed macro-history graph over 100 years of gold. This is a historical
 * macro-analysis and explainable-memory demo — not investment advice.
 *
 * The gold graph is intentionally separate from the generic memory graph
 * (MemoryBlock / MemoryEdge): it carries domain node/edge types that express
 * macro structure (events, regimes, price points, hypotheses) so the UI can
 * render a regime timeline and trace explanatory paths.
 */

export const GOLD_USER_ID = "gold-lab";

export type GoldNodeType =
  | "Event"
  | "Regime"
  | "PricePoint"
  | "MacroFactor"
  | "CentralBank"
  | "Country"
  | "PolicyAction"
  | "Narrative"
  | "Hypothesis"
  | "Counterexample"
  | "Source";

export type GoldEdgeType =
  | "happened_during"
  | "triggered"
  | "coincided_with"
  | "increased_gold_demand"
  | "reduced_gold_demand"
  | "changed_monetary_regime"
  | "supports_hypothesis"
  | "contradicts_hypothesis"
  | "similar_to"
  | "different_from"
  | "source_for";

export interface GoldNode {
  id: string;
  type: GoldNodeType;
  label: string;
  summary?: string;
  /** Single year for point-in-time nodes (Event, PricePoint). */
  year?: number;
  /** Span for Regime nodes. */
  startYear?: number;
  endYear?: number;
  /** Free-form domain payload (price, regimeId, category, etc.). */
  data?: Record<string, unknown>;
}

export interface GoldEdge {
  id: string;
  from: string;
  to: string;
  type: GoldEdgeType;
  label?: string;
  weight?: number;
}

export interface GoldGraph {
  nodes: GoldNode[];
  edges: GoldEdge[];
}

// ---------- Raw parsed dataset shapes ----------

export interface AnnualPrice {
  year: number;
  priceUsd: number;
  regimeId: string;
  note: string;
}

export interface MonthlyPrice {
  month: string; // YYYY-MM
  priceUsd: number;
  regimeId: string;
  note: string;
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

export interface GoldEvent {
  id: string;
  year: number;
  title: string;
  regimeId: string;
  summary: string;
  category: string;
  countries?: string[];
  centralBanks?: string[];
  policyActions?: string[];
  macroFactors?: string[];
  narratives?: string[];
  changedRegimeFrom?: string;
  changedRegimeTo?: string;
  supportsHypotheses?: string[];
  contradictsHypotheses?: string[];
}

export interface GoldHypothesis {
  id: string;
  type: "hypothesis" | "counterexample";
  statement: string;
  rationale?: string;
  explanation?: string;
  appliesTo?: string[];
  supportedBy?: string[];
  contradictedBy?: string[];
  counterexamples?: string[];
  relatedFactors?: string[];
}

export interface GoldDataset {
  annual: AnnualPrice[];
  monthly: MonthlyPrice[];
  regimes: GoldRegime[];
  events: GoldEvent[];
  hypotheses: GoldHypothesis[];
}

// ---------- Eval shapes ----------

export interface GoldEvalQuestion {
  id: string;
  question: string;
  mode: "rag" | "memory" | "hybrid" | "long_context" | "auto";
  idealPoints: string[];
  requiredSourceIds: string[];
  requiredMemoryTopics: string[];
}

export interface GoldEvalFile {
  name: string;
  description: string;
  version: string;
  questions: GoldEvalQuestion[];
}
