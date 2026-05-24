/**
 * Phase 1 demo. Calls the engine and pretty-prints the output.
 * Run with: pnpm demo  (or)  npx tsx scripts/demo.ts
 */

import { buildContainer } from "../src/index.js";

async function main(): Promise<void> {
  const { engine } = buildContainer();

  const result = await engine.run({
    userId: "demo-user",
    message: "Почему я снова застрял с Shadow и этой теорией?",
    mode: "auto",
  });

  console.log("=".repeat(72));
  console.log("RagMemoryEngine — Phase 1 Demo");
  console.log("=".repeat(72));

  console.log("\n[runId]", result.runId);

  console.log("\n[route]");
  console.log(JSON.stringify(result.route, null, 2));

  console.log("\n[answer]");
  console.log(result.answer);

  console.log("\n[sources]");
  for (const hit of result.sources) {
    console.log(
      `  - ${hit.item.title} (${hit.item.id}) score=${hit.finalScore.toFixed(2)}`
    );
  }

  console.log("\n[usedMemories]");
  for (const hit of result.usedMemories) {
    console.log(
      `  - [${hit.item.type}] ${hit.item.id} score=${hit.finalScore.toFixed(
        2
      )} importance=${hit.item.importance.toFixed(2)}`
    );
    console.log(`      "${hit.item.content}"`);
  }

  console.log("\n[memoryWriteCandidates]");
  for (const c of result.memoryWriteCandidates) {
    console.log(
      `  - [${c.type}] approval=${c.requiresUserApproval} conf=${c.confidence.toFixed(
        2
      )} imp=${c.importance.toFixed(2)}`
    );
    console.log(`      content: "${c.content}"`);
    console.log(`      reason:  ${c.reason}`);
  }

  console.log("\n[metrics]");
  console.log(JSON.stringify(result.metrics, null, 2));

  console.log("\n[trace] events:", result.trace.length);
  for (const event of result.trace) {
    console.log(`  - ${event.type.padEnd(24)} :: ${event.label}`);
  }

  console.log("\n=".repeat(72));
  console.log("Done.");
}

main().catch((err) => {
  console.error("Demo failed:", err);
  process.exit(1);
});
