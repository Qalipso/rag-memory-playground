import type { DeepPartial, EngineConfig, MemoryType } from "./types.js";

export const defaultEngineConfig: EngineConfig = {
  retrieval: {
    mode: "hybrid",
    topK: 5,
    rerank: false,
    minScore: 0.35,
  },
  memory: {
    enabledTypes: ["episodic", "semantic", "procedural"],
    writePolicy: "ask",
    consolidationEnabled: false,
    forgettingEnabled: true,
    contradictionDetection: false,
  },
  scoring: {
    relevanceWeight: 0.6,
    recencyWeight: 0.2,
    importanceWeight: 0.2,
  },
  generation: {
    maxContextTokens: 4000,
    citeSources: true,
    strictGrounding: true,
  },
};

export function mergeWithDefaultConfig(
  override?: DeepPartial<EngineConfig>
): EngineConfig {
  if (!override) return cloneConfig(defaultEngineConfig);

  return {
    retrieval: {
      ...defaultEngineConfig.retrieval,
      ...(override.retrieval ?? {}),
    },
    memory: {
      ...defaultEngineConfig.memory,
      ...(override.memory ?? {}),
      enabledTypes: normalizeEnabledTypes(
        override.memory?.enabledTypes,
        defaultEngineConfig.memory.enabledTypes
      ),
    },
    scoring: {
      ...defaultEngineConfig.scoring,
      ...(override.scoring ?? {}),
    },
    generation: {
      ...defaultEngineConfig.generation,
      ...(override.generation ?? {}),
    },
  };
}

function normalizeEnabledTypes(
  override: ReadonlyArray<MemoryType | undefined> | undefined,
  fallback: MemoryType[]
): MemoryType[] {
  if (!override) return [...fallback];
  const filtered = override.filter((t): t is MemoryType => t !== undefined);
  return filtered.length > 0 ? filtered : [...fallback];
}

function cloneConfig(cfg: EngineConfig): EngineConfig {
  return {
    retrieval: { ...cfg.retrieval },
    memory: { ...cfg.memory, enabledTypes: [...cfg.memory.enabledTypes] },
    scoring: { ...cfg.scoring },
    generation: { ...cfg.generation },
  };
}
