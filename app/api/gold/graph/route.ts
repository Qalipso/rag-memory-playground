/**
 * GET /api/gold/graph
 *
 * Returns the typed Gold macro-history graph (always available from the static
 * dataset — no seeding required). Optional filters:
 *   ?types=Event,Regime   restrict node types
 *   ?regimeId=bretton_woods  restrict to one regime
 *   ?q=inflation          text filter on label/summary
 */

import {
  getGoldGraph,
  filterGoldGraph,
  getGoldDataset,
} from "../../../../src/framework/gold";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NODE_TYPES = [
  "Event", "Regime", "PricePoint", "MacroFactor", "CentralBank", "Country",
  "PolicyAction", "Narrative", "Hypothesis", "Counterexample", "Source",
];

const EDGE_TYPES = [
  "happened_during", "triggered", "coincided_with", "increased_gold_demand",
  "reduced_gold_demand", "changed_monetary_regime", "supports_hypothesis",
  "contradicts_hypothesis", "similar_to", "different_from", "source_for",
];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function GET(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const typesParam = url.searchParams.get("types");
    const regimeId = url.searchParams.get("regimeId") ?? undefined;
    const q = url.searchParams.get("q") ?? undefined;

    const full = getGoldGraph();
    const filtered = filterGoldGraph(full, {
      types: typesParam ? typesParam.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
      regimeId,
      query: q,
    });

    const dataset = getGoldDataset();

    return json({
      nodes: filtered.nodes,
      edges: filtered.edges,
      regimes: dataset.regimes,
      annual: dataset.annual,
      nodeTypes: NODE_TYPES,
      edgeTypes: EDGE_TYPES,
      totals: { nodes: full.nodes.length, edges: full.edges.length },
    });
  } catch (error) {
    console.error("[gold/graph] failed:", error);
    return json({ error: "Failed to build gold graph. See server logs." }, 500);
  }
}
