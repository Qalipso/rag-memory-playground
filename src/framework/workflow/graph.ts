import { END, START, StateGraph } from "@langchain/langgraph";
import {
  buildContextNode,
  buildExplainableRunNode,
  classifyIntentNode,
  evaluateAnswerNode,
  generateAnswerNode,
  retrieveDocumentsNode,
  retrieveMemoriesNode,
  type NodeDeps,
} from "./nodes.js";
import { WorkflowState } from "./state.js";

/**
 * Composes the LangGraph workflow.
 *
 *   START
 *     → classifyIntentNode
 *     → retrieveDocumentsNode    (skipped if route.useDocuments=false)
 *     → retrieveMemoriesNode     (skipped if route.useMemory=false)
 *     → buildContextNode
 *     → generateAnswerNode
 *     → evaluateAnswerNode
 *     → buildExplainableRunNode  (synthesises failure modes from final state)
 *     → END
 *
 * Each node emits a GraphStep (ok / skipped / failed) into the observability
 * provider so the final ExplainableRun carries a full step-by-step trace
 * including providerMode per step.
 */
export function buildWorkflow(deps: NodeDeps) {
  const graph = new StateGraph(WorkflowState)
    .addNode("classifyIntentNode", classifyIntentNode(deps))
    .addNode("retrieveDocumentsNode", retrieveDocumentsNode(deps))
    .addNode("retrieveMemoriesNode", retrieveMemoriesNode(deps))
    .addNode("buildContextNode", buildContextNode(deps))
    .addNode("generateAnswerNode", generateAnswerNode(deps))
    .addNode("evaluateAnswerNode", evaluateAnswerNode(deps))
    .addNode("buildExplainableRunNode", buildExplainableRunNode(deps))
    .addEdge(START, "classifyIntentNode")
    .addEdge("classifyIntentNode", "retrieveDocumentsNode")
    .addEdge("retrieveDocumentsNode", "retrieveMemoriesNode")
    .addEdge("retrieveMemoriesNode", "buildContextNode")
    .addEdge("buildContextNode", "generateAnswerNode")
    .addEdge("generateAnswerNode", "evaluateAnswerNode")
    .addEdge("evaluateAnswerNode", "buildExplainableRunNode")
    .addEdge("buildExplainableRunNode", END);

  return graph.compile();
}
