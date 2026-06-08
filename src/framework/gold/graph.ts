/**
 * Builds the typed Gold macro-history graph from the dataset and provides
 * filtering + explanation-path helpers used by the API and UI.
 *
 * Node types:  Event, Regime, PricePoint, MacroFactor, CentralBank, Country,
 *              PolicyAction, Narrative, Hypothesis, Counterexample, Source.
 * Edge types:  happened_during, triggered, coincided_with,
 *              increased_gold_demand, reduced_gold_demand,
 *              changed_monetary_regime, supports_hypothesis,
 *              contradicts_hypothesis, similar_to, different_from, source_for.
 */

import { getGoldDataset } from "./dataset.js";
import type {
  GoldDataset,
  GoldEdge,
  GoldEdgeType,
  GoldGraph,
  GoldNode,
} from "./types.js";

const DEMAND_UP = new Set([
  "high_inflation",
  "negative_real_rates",
  "crisis_hedge",
  "geopolitical_risk",
  "geopolitical_shock",
  "central_bank_demand",
  "de_dollarization",
  "oil_shock",
  "quantitative_easing",
  "dollar_weakness",
  "stagflation",
  "investment_demand",
  "valuation_effect",
  "reflation",
]);

const DEMAND_DOWN = new Set([
  "positive_real_rates",
  "rising_real_rates",
  "strong_dollar",
  "disinflation",
  "central_bank_supply",
  "deflation",
]);

function humanize(id: string): string {
  return id
    .replace(/^pa_/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// Explicit cross-decade analogies (similar_to / different_from).
const ANALOGIES: Array<{ from: string; to: string; type: GoldEdgeType; label: string }> = [
  { from: "great_inflation_bull", to: "reserve_diversification", type: "similar_to", label: "both strong gold bulls amid inflation + geopolitical stress" },
  { from: "evt_1980_peak", to: "evt_2024_records", type: "similar_to", label: "rally peaks decades apart" },
  { from: "evt_1979_shocks", to: "evt_russia_sanctions", type: "similar_to", label: "geopolitical shocks lifting gold" },
  { from: "evt_oil_shock_1973", to: "evt_2022_inflation_hikes", type: "different_from", label: "inflation lifted gold in 1973 but not 2022" },
  { from: "h_inflation_hedge", to: "h_real_rates", type: "different_from", label: "competing explanations of gold's moves" },
];

function buildGraph(dataset: GoldDataset): GoldGraph {
  const nodes = new Map<string, GoldNode>();
  const edges: GoldEdge[] = [];
  let edgeSeq = 0;

  const addNode = (n: GoldNode) => {
    if (!nodes.has(n.id)) nodes.set(n.id, n);
  };
  const addEdge = (from: string, to: string, type: GoldEdgeType, label?: string, weight = 1) => {
    if (!from || !to) return;
    edges.push({ id: `ge_${edgeSeq++}`, from, to, type, label, weight });
  };

  const annualByYear = new Map(dataset.annual.map((a) => [a.year, a]));

  // ---- Regime nodes ----
  for (const r of dataset.regimes) {
    addNode({
      id: `regime_${r.id}`,
      type: "Regime",
      label: r.name,
      summary: r.summary,
      startYear: r.startYear,
      endYear: r.endYear,
      data: { regimeId: r.id, macroFactors: r.macroFactors },
    });
    for (const f of r.macroFactors) {
      const fid = `factor_${f}`;
      addNode({ id: fid, type: "MacroFactor", label: humanize(f) });
      addEdge(`regime_${r.id}`, fid, "coincided_with");
    }
  }

  // ---- Hypothesis / Counterexample nodes ----
  for (const h of dataset.hypotheses) {
    addNode({
      id: h.id,
      type: h.type === "counterexample" ? "Counterexample" : "Hypothesis",
      label: h.statement.length > 80 ? h.statement.slice(0, 77) + "…" : h.statement,
      summary: h.rationale ?? h.explanation,
      data: { relatedFactors: h.relatedFactors ?? [] },
    });
  }
  // Counterexample -> Hypothesis it challenges.
  for (const h of dataset.hypotheses) {
    if (h.type !== "counterexample") continue;
    for (const target of h.appliesTo ?? []) {
      addEdge(h.id, target, "contradicts_hypothesis", "counterexample");
    }
  }

  // ---- Event nodes + their relations ----
  for (const e of dataset.events) {
    addNode({
      id: e.id,
      type: "Event",
      label: e.title,
      summary: e.summary,
      year: e.year,
      data: { category: e.category, regimeId: e.regimeId },
    });

    // happened_during regime
    addEdge(e.id, `regime_${e.regimeId}`, "happened_during");

    // regime change
    if (e.changedRegimeTo) {
      addEdge(e.id, `regime_${e.changedRegimeTo}`, "changed_monetary_regime", "started regime");
    }

    // price point (same year)
    const price = annualByYear.get(e.year);
    if (price) {
      const pid = `price_${e.year}`;
      addNode({
        id: pid,
        type: "PricePoint",
        label: `${e.year}: $${price.priceUsd}/oz`,
        year: e.year,
        data: { priceUsd: price.priceUsd, regimeId: price.regimeId },
      });
      addEdge(pid, `regime_${price.regimeId}`, "happened_during");
      addEdge(e.id, pid, "coincided_with");
    }

    // macro factors -> demand direction
    for (const f of e.macroFactors ?? []) {
      const fid = `factor_${f}`;
      addNode({ id: fid, type: "MacroFactor", label: humanize(f) });
      const type: GoldEdgeType = DEMAND_UP.has(f)
        ? "increased_gold_demand"
        : DEMAND_DOWN.has(f)
          ? "reduced_gold_demand"
          : "coincided_with";
      addEdge(e.id, fid, type);
    }

    // policy actions (event triggered)
    for (const p of e.policyActions ?? []) {
      addNode({ id: p, type: "PolicyAction", label: humanize(p) });
      addEdge(e.id, p, "triggered");
    }

    // central banks / countries / narratives (coincided_with)
    for (const cb of e.centralBanks ?? []) {
      const id = `cb_${slug(cb)}`;
      addNode({ id, type: "CentralBank", label: cb });
      addEdge(e.id, id, "coincided_with");
    }
    for (const c of e.countries ?? []) {
      const id = `country_${slug(c)}`;
      addNode({ id, type: "Country", label: c });
      addEdge(e.id, id, "coincided_with");
    }
    for (const n of e.narratives ?? []) {
      const id = `narr_${n}`;
      addNode({ id, type: "Narrative", label: humanize(n) });
      addEdge(e.id, id, "coincided_with");
    }

    // hypothesis support / contradiction
    for (const h of e.supportsHypotheses ?? []) {
      addEdge(e.id, h, "supports_hypothesis");
    }
    for (const h of e.contradictsHypotheses ?? []) {
      addEdge(e.id, h, "contradicts_hypothesis");
    }
  }

  // Hypothesis-side support links (dedupe handled implicitly; extra weight is fine).
  for (const h of dataset.hypotheses) {
    for (const e of h.supportedBy ?? []) addEdge(e, h.id, "supports_hypothesis");
    for (const e of h.contradictedBy ?? []) addEdge(e, h.id, "contradicts_hypothesis");
  }

  // ---- Source nodes (data files) ----
  const sources: Array<{ id: string; label: string; types: string[] }> = [
    { id: "src_events_file", label: "events_1926_2026.jsonl", types: ["Event"] },
    { id: "src_regimes_file", label: "regimes.json", types: ["Regime"] },
    { id: "src_hypotheses_file", label: "hypotheses.jsonl", types: ["Hypothesis", "Counterexample"] },
    { id: "src_prices_file", label: "prices_annual_1926_2026.csv", types: ["PricePoint"] },
  ];
  for (const s of sources) {
    addNode({ id: s.id, type: "Source", label: s.label });
    for (const node of nodes.values()) {
      if (s.types.includes(node.type)) addEdge(s.id, node.id, "source_for");
    }
  }

  // ---- Explicit analogies ----
  for (const a of ANALOGIES) {
    addEdge(resolveAnalogId(a.from), resolveAnalogId(a.to), a.type, a.label, 1);
  }

  return { nodes: Array.from(nodes.values()), edges };
}

/** Regime ids in ANALOGIES are bare (e.g. "great_inflation_bull"); prefix them. */
function resolveAnalogId(id: string): string {
  if (id.startsWith("evt_") || id.startsWith("h_") || id.startsWith("cex_") || id.startsWith("regime_")) {
    return id;
  }
  // bare regime id
  return `regime_${id}`;
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

declare global {
  // eslint-disable-next-line no-var
  var __goldGraph: GoldGraph | undefined;
}

export function getGoldGraph(): GoldGraph {
  if (!globalThis.__goldGraph) globalThis.__goldGraph = buildGraph(getGoldDataset());
  return globalThis.__goldGraph;
}

export interface GraphFilter {
  types?: string[];
  regimeId?: string;
  query?: string;
}

export function filterGoldGraph(graph: GoldGraph, filter: GraphFilter): GoldGraph {
  let nodes = graph.nodes;
  if (filter.types && filter.types.length > 0) {
    const set = new Set(filter.types);
    nodes = nodes.filter((n) => set.has(n.type));
  }
  if (filter.regimeId) {
    const rid = filter.regimeId;
    nodes = nodes.filter(
      (n) =>
        (n.type === "Regime" && n.data?.["regimeId"] === rid) ||
        n.data?.["regimeId"] === rid
    );
  }
  if (filter.query && filter.query.trim()) {
    const q = filter.query.toLowerCase();
    nodes = nodes.filter(
      (n) =>
        n.label.toLowerCase().includes(q) ||
        (n.summary ?? "").toLowerCase().includes(q)
    );
  }
  const ids = new Set(nodes.map((n) => n.id));
  const edges = graph.edges.filter((e) => ids.has(e.from) && ids.has(e.to));
  return { nodes, edges };
}

/**
 * Returns the subgraph of seed nodes plus their 1-hop neighbors — the
 * "explanation path" shown for an answer. seedIds are matched leniently
 * (exact id, or label/summary containing the seed term).
 */
export function explanationSubgraph(graph: GoldGraph, seedIds: string[]): GoldGraph {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const keep = new Set<string>();
  for (const s of seedIds) {
    if (byId.has(s)) keep.add(s);
  }
  // 1-hop expansion
  const frontier = new Set(keep);
  for (const e of graph.edges) {
    if (frontier.has(e.from)) keep.add(e.to);
    if (frontier.has(e.to)) keep.add(e.from);
  }
  const nodes = graph.nodes.filter((n) => keep.has(n.id));
  const edges = graph.edges.filter((e) => keep.has(e.from) && keep.has(e.to));
  return { nodes, edges };
}
