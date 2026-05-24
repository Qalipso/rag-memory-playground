import { newCandidateId } from "../core/ids.js";
import type {
  EngineConfig,
  MemoryType,
  MemoryWriteCandidate,
  RouteDecision,
} from "../core/types.js";

interface RuleMatch {
  type: MemoryType;
  importance: number;
  confidence: number;
  reason: string;
  template: (msg: string) => string;
}

const semanticTriggers: { pattern: RegExp; match: RuleMatch }[] = [
  {
    pattern: /(я хочу|моя цель|мне нравится|предпочитаю|i prefer|i want|i'd like)/i,
    match: {
      type: "semantic",
      importance: 0.75,
      confidence: 0.7,
      reason: "User stated a preference, goal, or stable personal fact.",
      template: (msg) => msg.trim(),
    },
  },
];

const episodicTriggers: { pattern: RegExp; match: RuleMatch }[] = [
  {
    pattern: /(застрял|снова|паттерн|overwhelmed|stuck)/i,
    match: {
      type: "episodic",
      importance: 0.65,
      confidence: 0.65,
      reason: "User described a recurring behavior or emotional/project pattern.",
      template: (msg) => `User described a recurring pattern: ${msg.trim()}`,
    },
  },
];

/**
 * Returns candidates only. Persistence happens via MemoryRepository in Phase 4.
 */
export class MemoryWritePolicyService {
  decide(params: {
    userId: string;
    userMessage: string;
    assistantAnswer: string;
    route: RouteDecision;
    config: EngineConfig;
  }): MemoryWriteCandidate[] {
    if (params.config.memory.writePolicy === "never") return [];

    const requireApproval = params.config.memory.writePolicy === "ask";

    const candidates: MemoryWriteCandidate[] = [];

    for (const rule of semanticTriggers) {
      if (rule.pattern.test(params.userMessage)) {
        candidates.push(this.makeCandidate(rule.match, params.userMessage, requireApproval));
      }
    }

    for (const rule of episodicTriggers) {
      if (rule.pattern.test(params.userMessage)) {
        candidates.push(this.makeCandidate(rule.match, params.userMessage, requireApproval));
      }
    }

    return candidates;
  }

  private makeCandidate(
    rule: RuleMatch,
    userMessage: string,
    requireApproval: boolean
  ): MemoryWriteCandidate {
    return {
      id: newCandidateId(),
      shouldSave: true,
      type: rule.type,
      content: rule.template(userMessage),
      importance: rule.importance,
      confidence: rule.confidence,
      reason: rule.reason,
      requiresUserApproval: requireApproval,
    };
  }
}
