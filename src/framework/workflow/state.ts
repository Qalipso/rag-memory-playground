import { Annotation } from "@langchain/langgraph";
import type {
  EvaluationsResult,
  FailureMode,
  FinalContext,
  FrameworkInput,
  GraphStep,
  RetrievedDocument,
  RetrievedMemory,
  Route,
} from "../types.js";

/**
 * LangGraph state schema for the RAG Memory workflow.
 *
 * Each node reads from state and returns a partial update. Reducers below
 * decide how updates are merged. We use append reducers for graphSteps so the
 * ordering of node execution is preserved.
 */
export const WorkflowState = Annotation.Root({
  input: Annotation<FrameworkInput>(),
  runId: Annotation<string>(),
  startedAt: Annotation<number>(),

  route: Annotation<Route | null>({
    reducer: (_left, right) => right,
    default: () => null,
  }),

  documents: Annotation<RetrievedDocument[]>({
    reducer: (_left, right) => right,
    default: () => [],
  }),

  memories: Annotation<RetrievedMemory[]>({
    reducer: (_left, right) => right,
    default: () => [],
  }),

  context: Annotation<FinalContext | null>({
    reducer: (_left, right) => right,
    default: () => null,
  }),

  answer: Annotation<string>({
    reducer: (_left, right) => right,
    default: () => "",
  }),

  evaluations: Annotation<EvaluationsResult | null>({
    reducer: (_left, right) => right,
    default: () => null,
  }),

  failureModes: Annotation<FailureMode[]>({
    reducer: (left, right) => [...(left ?? []), ...(right ?? [])],
    default: () => [],
  }),

  graphSteps: Annotation<GraphStep[]>({
    reducer: (left, right) => [...(left ?? []), ...(right ?? [])],
    default: () => [],
  }),
});

export type WorkflowStateType = typeof WorkflowState.State;
export type WorkflowStateUpdate = typeof WorkflowState.Update;
