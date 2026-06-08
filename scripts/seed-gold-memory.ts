/**
 * scripts/seed-gold-memory.ts
 *
 * Reads the /data/gold seed files, derives source docs + memory notes, and
 * sends each note through the existing memory-formation pipeline (formMemory),
 * storing multi-level memory blocks and graph edges in the active MemoryStore.
 *
 * Usage:
 *   npx tsx scripts/seed-gold-memory.ts          # idempotent
 *   npx tsx scripts/seed-gold-memory.ts --force  # clear + reseed
 *
 * Persistence note: with DATABASE_URL set, seeded memory persists to
 * Postgres+pgvector and is shared with the running Next.js server. Without it,
 * the in-memory store is per-process, so prefer the in-app /api/gold/seed
 * (the /gold-lab page calls it automatically on load).
 */

import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { getGoldDataset } from "../src/framework/gold/dataset.js";
import { getGoldGraph } from "../src/framework/gold/graph.js";
import { getGoldMemoryNotes } from "../src/framework/gold/notes.js";
import { seedGoldMemory } from "../src/framework/gold/seed.js";
import { getMemoryStore } from "../src/framework/memory/store.js";

async function main(): Promise<void> {
  const force = process.argv.includes("--force");

  const dataset = getGoldDataset();
  const graph = getGoldGraph();
  const notes = getGoldMemoryNotes();
  const store = getMemoryStore();

  console.log("Gold Memory Lab seeder");
  console.log("----------------------");
  console.log(`Store backend : ${store.backend}`);
  console.log(`Dataset       : ${dataset.annual.length} annual prices, ${dataset.monthly.length} monthly, ${dataset.events.length} events, ${dataset.regimes.length} regimes, ${dataset.hypotheses.length} hypotheses`);
  console.log(`Typed graph   : ${graph.nodes.length} nodes, ${graph.edges.length} edges`);
  console.log(`Memory notes  : ${notes.length}`);
  console.log(`Mode          : ${force ? "force (clear + reseed)" : "idempotent"}`);
  console.log("");
  console.log("Forming memories through the pipeline...");

  const result = await seedGoldMemory({ force });

  if (result.alreadySeeded) {
    console.log(`Already seeded: ${result.blocksCreated} blocks present for user "${result.userId}". Use --force to reseed.`);
  } else {
    console.log("Done.");
    console.log(`  notes processed  : ${result.notesProcessed}`);
    console.log(`  blocks created   : ${result.blocksCreated}`);
    console.log(`  edges created    : ${result.edgesCreated}`);
    console.log(`  entities created : ${result.entitiesCreated}`);
  }

  if (store.backend === "in-memory") {
    console.log("");
    console.log("Note: in-memory store is per-process. Set DATABASE_URL to persist,");
    console.log("or just open /gold-lab (it seeds via /api/gold/seed automatically).");
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seeding failed:", err);
    process.exit(1);
  });
