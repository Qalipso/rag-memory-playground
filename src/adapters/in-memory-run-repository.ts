import type {
  RunRecord,
  RunRepositoryPort,
} from "../ports/run-repository.port.js";
import type {
  EvaluationResult,
  RagMemoryInput,
  RouteDecision,
} from "../core/types.js";

interface MutableRun extends RunRecord {}

export class InMemoryRunRepository implements RunRepositoryPort {
  private readonly runs = new Map<string, MutableRun>();

  async create(input: {
    id: string;
    userId: string;
    input: RagMemoryInput;
  }): Promise<void> {
    this.runs.set(input.id, {
      id: input.id,
      userId: input.userId,
      input: input.input,
      route: emptyRoute(),
      answer: "",
      metrics: emptyMetrics(),
      createdAt: new Date().toISOString(),
    });
  }

  async complete(input: {
    id: string;
    route: RouteDecision;
    answer: string;
    metrics: EvaluationResult;
  }): Promise<void> {
    const existing = this.runs.get(input.id);
    if (!existing) return;
    this.runs.set(input.id, {
      ...existing,
      route: input.route,
      answer: input.answer,
      metrics: input.metrics,
    });
  }

  async getById(id: string): Promise<RunRecord | null> {
    return Promise.resolve(this.runs.get(id) ?? null);
  }

  async listByUser(userId: string, limit = 50): Promise<RunRecord[]> {
    const list = Array.from(this.runs.values())
      .filter((r) => r.userId === userId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .slice(0, limit);
    return Promise.resolve(list);
  }
}

function emptyRoute(): RouteDecision {
  return {
    mode: "auto",
    useDocuments: false,
    useMemory: false,
    useLongContext: false,
    reason: "(pending)",
    confidence: 0,
  };
}

function emptyMetrics(): EvaluationResult {
  return {
    faithfulness: 0,
    contextRelevance: 0,
    answerRelevance: 0,
    warnings: [],
  };
}
