/**
 * Snipen (snipen.html): Eingaben aus dem Förderfenster des Nachbarn, dazu
 * die eigene Arche — heraus kommt je Platz, ob er sich lohnt.
 */
const { test, expect } = require("@playwright/test");

async function eintragen(page, werte) {
  for (const [id, wert] of Object.entries(werte)) await page.fill("#" + id, wert);
}

test("Arche 183 beim Nachbarn: P1 ist nur riskant zu haben", async ({ page }) => {
  await page.goto("/snipen.html");
  await expect(page.locator("#snBuilding")).toHaveValue("The_Arc");
  await eintragen(page, { snLevel: "183", snProgress: "34.456", snArc: "188" });
  await expect(page.locator("#snTotal")).toHaveValue("127.430");
  await expect(page.locator("#snTaken input")).toHaveCount(7);
  await expect(page.locator("#snSummary")).toHaveText("Noch offen: 92.974 FP · Gold-Stufe · dein Bonus: Gold 21 %");

  const p1 = page.locator('#snRows li[data-slot="1"]');
  await expect(p1).toHaveClass("riskant");
  await expect(p1.locator("h3")).toHaveText("P1 11.124 + 2.336 Bonus = 13.460 FP");
  await expect(p1.locator(".limits")).toHaveText("Platz ab 1 FP · sicher ab 46.487 FP");

  // Mischkalkulation: 8 Gold-BP + 2 Bonus für 33.027 FP Verlust.
  await p1.locator(".bpCount").fill("8");
  await expect(p1.locator("output")).toHaveText("→ sicher kostet dich eine Blaupause 3.303 FP");
});

test("kurz vor voll: belegte Plätze, und einer lohnt sich", async ({ page }) => {
  await page.goto("/snipen.html");
  await eintragen(page, { snLevel: "183", snArc: "188", snProgress: "124.430", snP1: "13.000", snP2: "6.000", snP3: "2.000" });
  // Offen 3.000. P3: (3000 + 2000) / 2 = 2.500, Grenze 1.854 + 389 = 2.243 → zu teuer zum Sichern.
  // P4 frei: sicher ab 1.500, Grenze 464 + 97 = 561 → riskant.
  await expect(page.locator('#snRows li[data-slot="3"]')).toHaveClass("riskant");
  await page.fill("#snP3", "1.200");
  // P3 jetzt: (3000 + 1200) / 2 = 2.100 ≤ 2.243.
  await expect(page.locator('#snRows li[data-slot="3"]')).toHaveClass("lohnt");
  await expect(page.locator('#snRows li[data-slot="3"] .verdict')).toHaveText("Lohnt sich: 2.100 FP einzahlen, der Platz ist sicher. Gewinn 143 FP.");
});

test("Kupfer-Stufe: 5 Plätze, Kupfer-Bonus, und die Arche wird gemerkt", async ({ page }) => {
  await page.goto("/snipen.html");
  await page.selectOption("#snBuilding", "Saturn_VI_Gate_HYDRA");
  await eintragen(page, { snLevel: "89", snArc: "120", snProgress: "0" });
  await expect(page.locator("#snTaken input")).toHaveCount(5);
  await expect(page.locator("#snSummary")).toHaveText("Noch offen: 28.556 FP · Kupfer-Stufe · dein Bonus: Kupfer 90 %");
  await page.reload();
  await expect(page.locator("#snBuilding")).toHaveValue("Saturn_VI_Gate_HYDRA");
  await expect(page.locator("#snArc")).toHaveValue("120");
});

test("ohne Kosten in der Tabelle fragt die Seite nach der rechten Zahl", async ({ page }) => {
  await page.goto("/snipen.html");
  await eintragen(page, { snLevel: "501" });
  await expect(page.locator("#snSummary")).toContainText("rechte Zahl am Balken");
  await eintragen(page, { snTotal: "10.300.000", snProgress: "10.000.000" });
  await expect(page.locator("#snSummary")).toContainText("Noch offen: 300.000 FP");
});

test("die Seite steht nicht im Index", async ({ page }) => {
  await page.goto("/snipen.html");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex");
});
