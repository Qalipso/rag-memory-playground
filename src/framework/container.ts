import { DeterministicEvaluator } from "./adapters/deterministic-evaluator.js";
import { OpenAIJudgeEvaluator } from "./adapters/openai-judge-evaluator.js";
import { RagasHttpEvaluator } from "./adapters/ragas-http-evaluator.js";
import { LangfuseObservabilityProvider } from "./adapters/langfuse-observability-provider.js";
import { LlamaIndexRagProvider } from "./adapters/llamaindex-rag-provider.js";
import { LocalLLMProvider } from "./adapters/local-llm-provider.js";
import { FormationMemoryProvider } from "./adapters/formation-memory-provider.js";
import { LocalObservabilityProvider } from "./adapters/local-observability-provider.js";
import { LocalRagProvider } from "./adapters/local-rag-provider.js";
import { Mem0MemoryProvider } from "./adapters/mem0-memory-provider.js";
import { OpenAILLMProvider } from "./adapters/openai-llm-provider.js";
import { FrameworkEngine } from "./engine.js";
import type { EvaluationProvider } from "./ports/evaluation-provider.port.js";
import type { LLMProvider } from "./ports/llm-provider.port.js";
import type { MemoryProvider } from "./ports/memory-provider.port.js";
import type { ObservabilityProvider } from "./ports/observability-provider.port.js";
import type { RagProvider } from "./ports/rag-provider.port.js";
import type {
  DebugEnvelope,
  ProviderRole,
  ProviderStatus,
} from "./types.js";

/**
 * Env-driven provider selection.
 *
 *   FRAMEWORK_MODE=local | real     (default: local)
 *
 * In local mode all providers are deterministic stubs.
 * In real mode each provider promotes to its real implementation when the
 * required env vars are present. If a real constructor throws, the container
 * falls back to the stub and records the decision in providerStatus.
 */
export interface BuildContainerOptions {
  mode?: "local" | "real";
}

export interface FrameworkContainer {
  engine: FrameworkEngine;
  providers: {
    rag: RagProvider;
    memory: MemoryProvider;
    llm: LLMProvider;
    evaluator: EvaluationProvider;
    obs: ObservabilityProvider;
  };
  providerStatus: ProviderStatus[];
  debug: DebugEnvelope;
}

interface ProviderSelection<TPort> {
  provider: TPort;
  status: ProviderStatus;
  decision: { role: ProviderRole; decision: string };
}

type PortWithMetadata = {
  name: string;
  framework: string;
  version?: string;
  requiredEnvVars: string[];
  isConfigured(): boolean;
};

export function buildFrameworkContainer(
  opts: BuildContainerOptions = {}
): FrameworkContainer {
  const mode =
    opts.mode ??
    (process.env["FRAMEWORK_MODE"] as "local" | "real" | undefined) ??
    "local";
  const wantsReal = mode === "real";

  const rag = pickProvider<RagProvider>({
    role: "rag",
    wantsReal,
    envSet: Boolean(process.env["OPENAI_API_KEY"]),
    realFactory: () => new LlamaIndexRagProvider(),
    stub: new LocalRagProvider(),
  });

  const memory = pickProvider<MemoryProvider>({
    role: "memory",
    wantsReal,
    envSet: Boolean(process.env["MEM0_API_KEY"]),
    realFactory: () => new Mem0MemoryProvider(),
    stub: new FormationMemoryProvider(),
  });

  const llm = pickProvider<LLMProvider>({
    role: "llm",
    wantsReal,
    envSet: Boolean(process.env["OPENAI_API_KEY"]),
    realFactory: () => new OpenAILLMProvider(),
    stub: new LocalLLMProvider(),
  });

  // Evaluation, in priority order:
  //   1. Real Ragas via the Python sidecar     (RAGAS_URL set)
  //   2. OpenAI LLM-as-judge                    (EVAL_MODE=judge + OPENAI_API_KEY)
  //   3. Deterministic Ragas-shaped stub        (default; always works)
  const ragasUrl = process.env["RAGAS_URL"];
  const useRagas = wantsReal && Boolean(ragasUrl);
  const useJudge =
    !useRagas &&
    wantsReal &&
    process.env["EVAL_MODE"] === "judge" &&
    Boolean(process.env["OPENAI_API_KEY"]);
  const evaluator: EvaluationProvider = useRagas
    ? new RagasHttpEvaluator(ragasUrl!)
    : useJudge
      ? new OpenAIJudgeEvaluator()
      : new DeterministicEvaluator();
  const evalReason = useRagas
    ? "Real Ragas active via sidecar (RAGAS_URL set)."
    : useJudge
      ? "LLM-as-judge active (EVAL_MODE=judge). Falls back to deterministic on error or daily cap."
      : "Deterministic Ragas-shaped evaluator. Set RAGAS_URL for real Ragas, or EVAL_MODE=judge for LLM-as-judge.";
  const evalStatus: ProviderStatus = {
    role: "evaluation",
    name: evaluator.name,
    framework: evaluator.framework,
    mode: useRagas || useJudge ? "real" : "stub",
    reason: evalReason,
    requiredEnvVars: evaluator.requiredEnvVars,
    isConfigured: evaluator.isConfigured(),
    ...(evaluator.version ? { version: evaluator.version } : {}),
  };

  const obs = pickProvider<ObservabilityProvider>({
    role: "observability",
    wantsReal,
    envSet: Boolean(
      process.env["LANGFUSE_PUBLIC_KEY"] && process.env["LANGFUSE_SECRET_KEY"]
    ),
    realFactory: () => new LangfuseObservabilityProvider(),
    stub: new LocalObservabilityProvider(),
  });

  const providerStatus: ProviderStatus[] = [
    rag.status,
    memory.status,
    llm.status,
    evalStatus,
    obs.status,
  ];

  const decisions = [
    rag.decision,
    memory.decision,
    llm.decision,
    { role: "evaluation" as ProviderRole, decision: evalStatus.reason },
    obs.decision,
  ];

  const debug: DebugEnvelope = {
    envHints: [
      "OPENAI_API_KEY",
      "MEM0_API_KEY",
      "MEM0_ORG_ID",
      "MEM0_PROJECT_ID",
      "LANGFUSE_PUBLIC_KEY",
      "LANGFUSE_SECRET_KEY",
      "LANGFUSE_BASE_URL",
      "FRAMEWORK_MODE",
    ].map((key) => ({ key, present: Boolean(process.env[key]) })),
    containerDecisions: decisions,
    workflow: {
      nodeOrder: [],
      skippedNodes: [],
      failedNodes: [],
    },
  };

  const engine = new FrameworkEngine({
    rag: rag.provider,
    memory: memory.provider,
    llm: llm.provider,
    evaluator,
    obs: obs.provider,
    providerStatus,
    debug,
  });

  return {
    engine,
    providers: {
      rag: rag.provider,
      memory: memory.provider,
      llm: llm.provider,
      evaluator,
      obs: obs.provider,
    },
    providerStatus,
    debug,
  };
}

function pickProvider<TPort extends PortWithMetadata>(args: {
  role: ProviderRole;
  wantsReal: boolean;
  envSet: boolean;
  realFactory: () => TPort;
  stub: TPort;
}): ProviderSelection<TPort> {
  const { role, wantsReal, envSet, realFactory, stub } = args;

  if (!wantsReal) {
    return {
      provider: stub,
      status: makeStatus(role, stub, "stub", "FRAMEWORK_MODE=local; using stub."),
      decision: { role, decision: "stub (FRAMEWORK_MODE=local)" },
    };
  }

  if (!envSet) {
    return {
      provider: stub,
      status: makeStatus(
        role,
        stub,
        "fallback",
        `Required env vars missing for real provider; using ${stub.name} as fallback.`
      ),
      decision: {
        role,
        decision: `fallback to ${stub.name} (env missing)`,
      },
    };
  }

  try {
    const real = realFactory();
    return {
      provider: real,
      status: makeStatus(role, real, "real", "Real provider initialized."),
      decision: { role, decision: `real (${real.name})` },
    };
  } catch (err) {
    const reason = `Real provider failed to initialize: ${(err as Error).message}`;
    console.warn(`[framework] ${role}: ${reason}`);
    return {
      provider: stub,
      status: makeStatus(role, stub, "fallback", reason),
      decision: { role, decision: `fallback to ${stub.name} (init error)` },
    };
  }
}

function makeStatus<TPort extends PortWithMetadata>(
  role: ProviderRole,
  provider: TPort,
  mode: ProviderStatus["mode"],
  reason: string
): ProviderStatus {
  return {
    role,
    name: provider.name,
    framework: provider.framework,
    mode,
    reason,
    requiredEnvVars: provider.requiredEnvVars,
    isConfigured: provider.isConfigured(),
    ...(provider.version ? { version: provider.version } : {}),
  };
}

// Use globalThis so the singleton survives Next.js dev-mode hot reloads.
declare global {
  // eslint-disable-next-line no-var
  var __frameworkContainer: FrameworkContainer | undefined;
}

export function getSharedFrameworkContainer(): FrameworkContainer {
  if (!globalThis.__frameworkContainer)
    globalThis.__frameworkContainer = buildFrameworkContainer();
  return globalThis.__frameworkContainer;
}

/**
 * Drops the cached container so the next call to getSharedFrameworkContainer
 * picks up the latest env vars. Used by the config endpoint after writing
 * .env.local so the user does not have to restart the dev server.
 */
export function resetSharedFrameworkContainer(): void {
  globalThis.__frameworkContainer = undefined;
}
