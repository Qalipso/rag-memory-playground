/**
 * Framework-engine demo. LangGraph + LlamaIndex.TS / local stubs.
 * Run with: pnpm demo:framework  (or)  npx tsx scripts/demo-framework.ts
 */

import { buildFrameworkContainer } from "../src/framework/index.js";

async function main(): Promise<void> {
  const { engine, providers } = buildFrameworkContainer();

  console.log("=".repeat(72));
  console.log("Framework Engine — Demo");
  console.log("=".repeat(72));
  console.log("Providers:");
  console.log(`  rag:           ${providers.rag.name} (${providers.rag.mode})`);
  console.log(`  memory:        ${providers.memory.name} (${providers.memory.mode})`);
  console.log(`  llm:           ${providers.llm.name} (${providers.llm.mode})`);
  console.log(`  evaluator:     ${providers.evaluator.name} (${providers.evaluator.mode})`);
  console.log(`  observability: ${providers.obs.name} (${providers.obs.mode})`);

  const result = await engine.run({
    userId: "demo-user",
    message: "Почему я снова застрял с Shadow и этой теорией?",
    mode: "auto",
  });

  console.log("\n[runId]", result.runId);
  console.log("\n[route]");
  console.log(JSON.stringify(result.route, null, 2));

  console.log("\n[graphSteps]");
  for (const s of result.graphSteps) {
    console.log(
      `  - ${s.name.padEnd(28)} [${s.status.padEnd(7)}] ${s.framework.padEnd(18)} ${s.durationMs}ms`
    );
    console.log(`      in:  ${s.inputSummary}`);
    console.log(`      out: ${s.outputSummary}`);
  }

  console.log("\n[retrievedDocuments]");
  for (const d of result.retrievedDocuments) {
    console.log(`  - ${d.title} (${d.source}) score=${d.score.toFixed(2)}`);
  }

  console.log("\n[retrievedMemories]");
  for (const m of result.retrievedMemories) {
    console.log(`  - [${m.type}] score=${m.score.toFixed(2)}`);
    console.log(`      ${m.content}`);
  }

  console.log("\n[answer]");
  console.log(result.answer);

  console.log("\n[evaluations]");
  console.log(`  faithfulness:     ${result.evaluations.faithfulness.score}`);
  console.log(`  contextRelevance: ${result.evaluations.contextRelevance.score}`);
  console.log(`  answerRelevance:  ${result.evaluations.answerRelevance.score}`);
  if (result.evaluations.warnings.length > 0) {
    console.log(`  warnings:`);
    for (const w of result.evaluations.warnings) console.log(`    - ${w}`);
  }

  if (result.failureModes.length > 0) {
    console.log("\n[failureModes]");
    for (const f of result.failureModes) {
      console.log(`  - [${f.type}] ${f.description}`);
    }
  }

  console.log("\n[meta]");
  console.log(`  totalDurationMs: ${result.meta.totalDurationMs}`);
  console.log(`  frameworks:`);
  for (const [k, v] of Object.entries(result.meta.frameworks)) {
    console.log(`    ${k.padEnd(15)} ${v.name} (${v.mode})`);
  }

  console.log("\n[trace] events:", result.trace.length);

  console.log("\n=".repeat(72));
  console.log("Done.");
}

main().catch((err) => {
  console.error("Demo failed:", err);
  process.exit(1);
});
