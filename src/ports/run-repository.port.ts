import type {
  EvaluationResult,
  RagMemoryInput,
  RouteDecision,
} from "../core/types.js";

export interface RunRecord {
  id: string;
  userId: string;
  input: RagMemoryInput;
  route: RouteDecision;
  answer: string;
  metrics: EvaluationResult;
  createdAt: string;
}

export interface RunRepositoryPort {
  create(input: { id: string; userId: string; input: RagMemoryInput }): Promise<void>;
  complete(input: {
    id: string;
    route: RouteDecision;
    answer: string;
    metrics: EvaluationResult;
  }): Promise<void>;
  getById(id: string): Promise<RunRecord | null>;
  listByUser(userId: string, limit?: number): Promise<RunRecord[]>;
}
