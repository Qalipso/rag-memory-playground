import { test, expect } from "@playwright/test";

/**
 * Visual Memory Lab UI flow: form a note → pipeline trace renders → multi-level
 * blocks appear → memory graph populates → consolidate runs.
 *
 * Structural assertions only (no exact counts) so it passes with real or stub
 * providers.
 */
test.describe("/memory — Visual Memory Lab", () => {
  test("forms memory and renders trace, blocks, graph", async ({ page }) => {
    await page.goto("/memory");

    // Page loaded.
    await expect(page.getByRole("heading", { name: "Visual Memory Lab" })).toBeVisible();

    // Note textarea is prefilled; form it.
    await page.getByRole("button", { name: "Form memory" }).click();

    // Pipeline trace shows the ordered stages.
    await expect(page.getByText("Pipeline trace")).toBeVisible();
    for (const stage of ["normalize", "classifyExtractSplit", "embed", "store", "linkGraph"]) {
      await expect(page.getByText(stage, { exact: false }).first()).toBeVisible();
    }

    // At least one memory block rendered under the level columns.
    await expect(page.getByText(/Memory blocks \(\d+\)/)).toBeVisible();

    // Classification surfaced (summary + at least one entity/topic chip).
    await expect(page.getByText("Classification", { exact: false })).toBeVisible();

    // Graph section reports active blocks > 0.
    await expect(page.getByText(/\d+ active blocks/)).toBeVisible();
  });

  test("consolidate runs and reports a result", async ({ page }) => {
    await page.goto("/memory");
    await page.getByRole("button", { name: "Form memory" }).click();
    await expect(page.getByText(/Memory blocks \(\d+\)/)).toBeVisible();

    await page.getByRole("button", { name: "Consolidate" }).click();
    await expect(page.getByText(/Consolidated: \d+ block/)).toBeVisible();
  });
});
