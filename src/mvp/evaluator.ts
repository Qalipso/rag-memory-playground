/**
 * Ragas-shaped deterministic evaluator.
 *
 * No LLM required. All metrics computed via token overlap and scoring heuristics.
 *
 * Metrics mirror Ragas API surface:
 *   faithfulness       — answer grounded in retrieved context
 *   answer_relevancy   — answer addresses the question
 *   context_precision  — retrieved chunks are on-topic
 *   context_recall     — context covers the question's information need
 */

import type { EvalResult, RetrievedChunk } from "./types";

// ─── Tokenisation ─────────────────────────────────────────────────────────────

const STOP = new Set([
  "the","and","for","that","this","with","are","was","not","but","from",
  "have","been","will","they","their","there","what","when","where","which",
  "who","how","its","into","over","also","can","our","your","you","all",
  "about","more","some","has","had","one","two","three","then","than","use",
  "used","using","does","did","get","got","just","make","made","like","other",
  "each","such","any","may","might","would","could","should","way","time",
]);

function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/\b[a-z]{3,}\b/g) ?? []);
}

/** Content words: tokens not in stoplist, length > 3. */
function contentWords(text: string): string[] {
  return tokenize(text).filter((w) => !STOP.has(w) && w.length > 3);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── Metrics ─────────────────────────────────────────────────────────────────

/**
 * Faithfulness — what fraction of answer sentences are grounded in retrieved chunks.
 *
 * A sentence is "grounded" if ≥45 % of its content words appear in the
 * concatenated chunk texts.  Mirrors the Ragas NLI-based approach but
 * uses lexical overlap instead of an entailment model.
 */
function computeFaithfulness(answer: string, chunkTexts: string[]): number {
  const sentences = answer
    .split(/(?<=[.!?])\s+|\n{2,}/)
    .map((s) => s.trim())
    .filter((s) => s.length > 12);

  if (sentences.length === 0) return 0;
  const allChunks = chunkTexts.join(" ").toLowerCase();

  let grounded = 0;
  for (const sent of sentences) {
    const words = contentWords(sent);
    if (words.length === 0) { grounded++; continue; }
    const found = words.filter((w) => allChunks.includes(w)).length;
    if (found / words.length >= 0.45) grounded++;
  }
  return grounded / sentences.length;
}

/**
 * Answer Relevancy — how much of the question's intent the answer addresses.
 *
 * Measures content-word overlap: fraction of question's content words that
 * appear in the answer.
 */
function computeAnswerRelevancy(question: string, answer: string): number {
  const qWords = contentWords(question);
  if (qWords.length === 0) return 0;
  const answerLower = answer.toLowerCase();
  const found = qWords.filter((w) => answerLower.includes(w)).length;
  return found / qWords.length;
}

/**
 * Context Precision — fraction of retrieved chunks that are "on-topic".
 *
 * A chunk is on-topic if its retrieval score exceeds a minimum threshold.
 * Mirrors the Ragas definition: precision@k over the retrieved set.
 */
function computeContextPrecision(
  retrievedChunks: RetrievedChunk[],
  threshold = 0.25,
): number {
  if (retrievedChunks.length === 0) return 0;
  const relevant = retrievedChunks.filter((c) => c.score >= threshold).length;
  return relevant / retrievedChunks.length;
}

/**
 * Context Recall — how well the retrieved context covers the question.
 *
 * Measures fraction of the retrieval query terms found anywhere in the
 * retrieved chunk texts.
 */
function computeContextRecall(
  queryTerms: string[],
  chunkTexts: string[],
): number {
  if (queryTerms.length === 0 || chunkTexts.length === 0) return 0;
  const allText = chunkTexts.join(" ").toLowerCase();
  const found = queryTerms.filter((t) => allText.includes(t.toLowerCase())).length;
  return found / queryTerms.length;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface EvaluateInput {
  question: string;
  answer: string;
  /** From RetrievalTrace.queryTerms */
  queryTerms: string[];
  /** From RetrievalTrace.retrievedChunks */
  retrievedChunks: RetrievedChunk[];
  /** Raw text of each retrieved chunk, same order */
  chunkTexts: string[];
}

export function evaluate(input: EvaluateInput): EvalResult {
  const faithfulness      = computeFaithfulness(input.answer, input.chunkTexts);
  const answerRelevancy   = computeAnswerRelevancy(input.question, input.answer);
  const contextPrecision  = computeContextPrecision(input.retrievedChunks);
  const contextRecall     = computeContextRecall(input.queryTerms, input.chunkTexts);

  // Overall: harmonic-mean-flavoured average that penalises any single low score.
  const scores = [faithfulness, answerRelevancy, contextPrecision, contextRecall];
  const n = scores.length;
  // Weighted average: faithfulness and context_precision weighted higher.
  const weighted =
    faithfulness * 0.35 +
    answerRelevancy * 0.25 +
    contextPrecision * 0.20 +
    contextRecall * 0.20;
  // Penalise if any metric < 0.3 (a weak component drags the overall score).
  const minScore = Math.min(...scores);
  const penalty = minScore < 0.3 ? minScore / 0.3 : 1;
  const overall = weighted * penalty;

  return {
    faithfulness:     round2(faithfulness),
    answerRelevancy:  round2(answerRelevancy),
    contextPrecision: round2(contextPrecision),
    contextRecall:    round2(contextRecall),
    overall:          round2(overall),
    // unused but satisfies exhaustiveness
    _n: n,
  };
}
