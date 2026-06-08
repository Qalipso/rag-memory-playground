/**
 * Gold Memory Lab — public entry point.
 *
 * A 100-year gold macro-history demo built on the RAG Memory engine:
 * typed macro graph, derived knowledge docs + memory notes, and a Golden Eval.
 * Historical macro-analysis and explainable-memory demo, not investment advice.
 */

export * from "./types.js";
export { getGoldDataset, getGoldEval, resetGoldCache } from "./dataset.js";
export { getGoldKnowledgeChunks } from "./knowledge.js";
export { getGoldMemoryNotes, type GoldNote } from "./notes.js";
export {
  getGoldGraph,
  filterGoldGraph,
  explanationSubgraph,
  type GraphFilter,
} from "./graph.js";
export { seedGoldMemory, type SeedGoldResult } from "./seed.js";
export { scoreGoldQuestion, type GoldQuestionScore } from "./eval.js";
