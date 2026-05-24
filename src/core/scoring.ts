/**
 * Three-factor memory scoring blend from Generative Agents (Park et al., 2023).
 * See ../../THEORY.md §2.2 and GUIDE.md §2.4.
 */

export interface MemoryScoreInput {
  relevance: number; // 0..1
  importance: number; // 0..1
  lastAccessedAt?: string;
  createdAt: string;
  now?: Date;
  weights: {
    relevanceWeight: number;
    recencyWeight: number;
    importanceWeight: number;
  };
}

/**
 * Exponential decay since reference date.
 * halfLifeDays controls how fast recency drops.
 */
export function calculateRecencyScore(
  date: string,
  now: Date = new Date(),
  halfLifeDays = 30
): number {
  const past = new Date(date).getTime();
  if (Number.isNaN(past)) return 0;

  const diffDays = (now.getTime() - past) / (1000 * 60 * 60 * 24);
  if (diffDays < 0) return 1;

  // Half-life decay: score = 2^(-diffDays / halfLifeDays)
  return Math.pow(2, -diffDays / halfLifeDays);
}

/**
 * Weighted, normalized blend of relevance + recency + importance.
 * Result is in [0, 1].
 */
export function calculateMemoryScore(input: MemoryScoreInput): number {
  const recency = calculateRecencyScore(
    input.lastAccessedAt ?? input.createdAt,
    input.now
  );

  const { relevanceWeight, recencyWeight, importanceWeight } = input.weights;
  const maxWeight = relevanceWeight + recencyWeight + importanceWeight;

  if (maxWeight === 0) return 0;

  const weighted =
    relevanceWeight * clamp01(input.relevance) +
    recencyWeight * clamp01(recency) +
    importanceWeight * clamp01(input.importance);

  return weighted / maxWeight;
}

export function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}
