/**
 * Derives memory-formation notes from the gold dataset.
 *
 * Each note is a short narrative observation that flows through the existing
 * memory-formation pipeline (formMemory): normalize -> classify -> extract
 * entities -> split into memory blocks -> embed -> store -> link graph.
 *
 * After seeding, these become the long-term memory the retrieval workflow
 * grounds on for the "Ask Gold Memory" surface (userId = GOLD_USER_ID).
 */

import { getGoldDataset } from "./dataset.js";
import type { GoldDataset } from "./types.js";

export interface GoldNote {
  id: string;
  text: string;
}

function buildNotes(dataset: GoldDataset): GoldNote[] {
  const notes: GoldNote[] = [];

  for (const r of dataset.regimes) {
    notes.push({
      id: `note_${r.id}`,
      text: `From ${r.startYear} to ${r.endYear} gold traded under the ${r.name}. ${r.summary} Defining traits: ${r.characteristics.join("; ")}.`,
    });
  }

  for (const e of dataset.events) {
    const drivers = e.macroFactors?.length ? ` Drivers: ${e.macroFactors.join(", ")}.` : "";
    notes.push({
      id: `note_${e.id}`,
      text: `In ${e.year}, ${e.title}. ${e.summary}${drivers} This happened during the ${e.regimeId} regime.`,
    });
  }

  for (const h of dataset.hypotheses) {
    const detail = h.rationale ?? h.explanation ?? "";
    notes.push({
      id: `note_${h.id}`,
      text: `${h.type === "counterexample" ? "Counterexample" : "Macro hypothesis"}: ${h.statement} ${detail}`,
    });
  }

  return notes;
}

declare global {
  // eslint-disable-next-line no-var
  var __goldNotes: GoldNote[] | undefined;
}

export function getGoldMemoryNotes(): GoldNote[] {
  if (!globalThis.__goldNotes) globalThis.__goldNotes = buildNotes(getGoldDataset());
  return globalThis.__goldNotes;
}
