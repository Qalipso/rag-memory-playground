/**
 * Pure scoring helpers for the Gold History Golden Eval.
 *
 * Scores an ExplainableRun against a gold eval question by checking how much
 * of the required evidence (source docs, ideal answer points, memory topics)
 * appears in the retrieved context and answer. Works in stub mode because it
 * scores retrieved CONTEXT, not only the generated answer.
 */

import type { ExplainableRun } from "../types.js";
import type { GoldEvalQuestion } from "./types.js";

export interface GoldQuestionScore {
  questionId: string;
  sourceRecall: number; // fraction of requiredSourceIds retrieved
  pointCoverage: number; // fraction of idealPoints found in context/answer
  memoryTopicRecall: number; // fraction of requiredMemoryTopics in memories
  overall: number;
  pass: boolean;
  retrievedSourceIds: string[];
  matchedPoints: string[];
}

function contextHaystack(run: ExplainableRun): string {
  return [
    run.answer,
    ...run.retrievedDocuments.map((d) => `${d.title} ${d.content}`),
    ...run.retrievedMemories.map((m) => m.content),
  ]
    .join(" ")
    .toLowerCase();
}

function memoryHaystack(run: ExplainableRun): string {
  return run.retrievedMemories.map((m) => m.content).join(" ").toLowerCase();
}

export function scoreGoldQuestion(
  q: GoldEvalQuestion,
  run: ExplainableRun
): GoldQuestionScore {
  const docIds = new Set(run.retrievedDocuments.map((d) => d.id));
  const retrievedSourceIds = q.requiredSourceIds.filter((id) => docIds.has(id));
  const sourceRecall =
    q.requiredSourceIds.length === 0
      ? 1
      : retrievedSourceIds.length / q.requiredSourceIds.length;

  const hay = contextHaystack(run);
  const matchedPoints = q.idealPoints.filter((p) =>
    pointMatches(hay, p)
  );
  const pointCoverage =
    q.idealPoints.length === 0 ? 1 : matchedPoints.length / q.idealPoints.length;

  const memHay = memoryHaystack(run);
  const memHits = q.requiredMemoryTopics.filter((t) => memHay.includes(t.toLowerCase()));
  const memoryTopicRecall =
    q.requiredMemoryTopics.length === 0 ? 1 : memHits.length / q.requiredMemoryTopics.length;

  // Weight evidence retrieval and answer coverage equally; memory is a bonus signal.
  const overall = 0.4 * sourceRecall + 0.4 * pointCoverage + 0.2 * memoryTopicRecall;

  return {
    questionId: q.id,
    sourceRecall,
    pointCoverage,
    memoryTopicRecall,
    overall,
    pass: overall >= 0.5,
    retrievedSourceIds,
    matchedPoints,
  };
}

/** A point matches if a majority of its salient tokens appear in the haystack. */
function pointMatches(hay: string, point: string): boolean {
  const tokens = point
    .toLowerCase()
    .replace(/[^a-z0-9$%\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP.has(t));
  if (tokens.length === 0) return hay.includes(point.toLowerCase());
  const hits = tokens.filter((t) => hay.includes(t)).length;
  return hits / tokens.length >= 0.6;
}

const STOP = new Set([
  "the", "and", "for", "with", "that", "then", "than", "from", "into", "when",
  "what", "did", "was", "were", "are", "but", "not", "its", "via", "had", "has",
]);
