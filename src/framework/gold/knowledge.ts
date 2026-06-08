/**
 * Derives RAG knowledge chunks from the gold dataset.
 *
 * Each event, regime, and hypothesis/counterexample becomes one retrievable
 * document with a STABLE id (used by the Golden Eval `requiredSourceIds`).
 * These chunks are surfaced by the LocalRagProvider alongside the demo seed
 * docs, so the gold corpus is always available for retrieval.
 */

import type { KnowledgeChunk } from "../knowledge/types.js";
import { getGoldDataset } from "./dataset.js";
import type { GoldDataset } from "./types.js";

function annualPriceLine(dataset: GoldDataset, year: number): string {
  const row = dataset.annual.find((a) => a.year === year);
  return row ? ` Annual average gold price ~$${row.priceUsd}/oz.` : "";
}

function buildChunks(dataset: GoldDataset): KnowledgeChunk[] {
  const chunks: KnowledgeChunk[] = [];

  // Regime documents
  for (const r of dataset.regimes) {
    chunks.push({
      id: `regime_${r.id}`,
      sourceId: "gold",
      title: `Regime: ${r.name} (${r.startYear}-${r.endYear})`,
      source: "data/gold/regimes.json",
      content: `${r.name} (${r.startYear}-${r.endYear}). ${r.summary} Key characteristics: ${r.characteristics.join("; ")}. Macro factors: ${r.macroFactors.join(", ")}.`,
      chunkIndex: 0,
    });
  }

  // Event documents
  for (const e of dataset.events) {
    const parts: string[] = [`${e.title} (${e.year}).`, e.summary];
    if (e.macroFactors?.length) parts.push(`Macro factors: ${e.macroFactors.join(", ")}.`);
    if (e.centralBanks?.length) parts.push(`Central banks: ${e.centralBanks.join(", ")}.`);
    if (e.countries?.length) parts.push(`Countries: ${e.countries.join(", ")}.`);
    parts.push(`Monetary regime: ${e.regimeId}.${annualPriceLine(dataset, e.year)}`);
    chunks.push({
      id: e.id,
      sourceId: "gold",
      title: `Event: ${e.title} (${e.year})`,
      source: "data/gold/events_1926_2026.jsonl",
      content: parts.join(" "),
      chunkIndex: 0,
    });
  }

  // Hypothesis & counterexample documents
  for (const h of dataset.hypotheses) {
    const detail = h.rationale ?? h.explanation ?? "";
    const label = h.type === "counterexample" ? "Counterexample" : "Hypothesis";
    chunks.push({
      id: h.id,
      sourceId: "gold",
      title: `${label}: ${h.statement.slice(0, 60)}`,
      source: "data/gold/hypotheses.jsonl",
      content: `${label}. ${h.statement} ${detail} Related factors: ${(h.relatedFactors ?? []).join(", ")}.`,
      chunkIndex: 0,
    });
  }

  // A compact price-history overview document
  const decades = dataset.annual.filter((a) => a.year % 10 === 0);
  chunks.push({
    id: "gold_price_overview",
    sourceId: "gold",
    title: "Gold price overview 1926-2026",
    source: "data/gold/prices_annual_1926_2026.csv",
    content:
      "Approximate annual gold prices (USD/oz), illustrative: " +
      decades.map((d) => `${d.year}: $${d.priceUsd}`).join(", ") +
      ". The official price was $20.67 then $35 until 1971; gold floated after the Nixon Shock and rose from tens of dollars to thousands by the 2020s.",
    chunkIndex: 0,
  });

  return chunks;
}

declare global {
  // eslint-disable-next-line no-var
  var __goldChunks: KnowledgeChunk[] | undefined;
}

/** Lazily built, cached. Safe to call from the (sync) knowledge store. */
export function getGoldKnowledgeChunks(): KnowledgeChunk[] {
  if (!globalThis.__goldChunks) {
    try {
      globalThis.__goldChunks = buildChunks(getGoldDataset());
    } catch {
      // If data files are missing, degrade gracefully to an empty gold corpus.
      globalThis.__goldChunks = [];
    }
  }
  return globalThis.__goldChunks;
}
