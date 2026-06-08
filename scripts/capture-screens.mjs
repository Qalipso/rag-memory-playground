import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const OUT = "screens/img";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  colorScheme: "dark",
});
const page = await ctx.newPage();

async function go(path) {
  await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1500);
}
async function clickByText(label, waitMs = 4000) {
  try {
    const btn = page.getByRole("button", { name: label }).first();
    await btn.click({ timeout: 5000 });
    await page.waitForTimeout(waitMs);
    return true;
  } catch {
    console.log("  (skip click)", label);
    return false;
  }
}
async function shot(file, full = true) {
  await page.screenshot({ path: `${OUT}/${file}`, fullPage: full });
  console.log("captured ->", file);
}

// 1. Home
await go("/");
await shot("01-home.png");

// 2. Memory Lab — form memory to populate graph (real LLM ~8s)
await go("/memory");
await clickByText("Form memory", 14000);
await shot("02-memory-lab.png");

// 3. Compare — run comparison (multi-pipeline, real LLM)
await go("/compare");
await clickByText("Run comparison", 20000);
await shot("03-compare.png");

// 4. Playground (workbench)
await go("/rag-memory-playground");
await clickByText("Load sample project", 4000);
await clickByText("Explore", 14000);
await shot("04-playground.png");

// 5. Eval — run eval (real judge)
await go("/eval");
await clickByText("Run Eval", 20000);
await shot("05-eval.png");

await browser.close();
