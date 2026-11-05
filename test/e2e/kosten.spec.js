/**
 * Gesamt-FP aus dem Spiel eintragen — seit dem Prestige-Update der einzige
 * Weg zu einem Plan. Bewusst ohne die Fixture mit vorab eingetragenen
 * Kosten: hier beginnt der Speicher leer.
 */
const { test, expect } = require("@playwright/test");

/** Ablesungen aus dem Spiel, 5.11.2026 (siehe test/prestige.test.js). */
const CASTEL_112 = { hash: "#lg=Castel_del_Monte&stufe=112", cost: "22732",
  rewards: ["1.984", "992", "331", "83", "17", "4", "0"] };
const HYDRA_89 = { hash: "#lg=Saturn_VI_Gate_HYDRA&stufe=89", cost: "28556",
  rewards: ["4.159", "2.079", "693", "173", "35"] };

async function eintragen(page, cost) {
  await page.fill("#inputTotal", cost);
  await page.click("#applyInput");
}

const sichtbareZeilen = (page) => page.locator("#rows tr[data-row]:not([hidden])");

test("ohne eingetragene Gesamt-FP fragt cipher danach und rechnet nichts", async ({ page }) => {
  await page.goto("/index.html" + HYDRA_89.hash);
  await expect(page.locator("#note")).toContainText("Seit dem Prestige-Update");
  await expect(page.locator("#inputTotal")).toBeVisible();
  await expect(page.locator("#rows .empty")).toContainText("Gesamt-FP");
  await expect(page.locator("#sumTotal")).toHaveText("–");
});

test("Kupfer-Stufe: 5 Plätze mit den Belohnungen aus dem Spiel", async ({ page }) => {
  await page.goto("/index.html" + HYDRA_89.hash);
  await eintragen(page, HYDRA_89.cost);
  await expect(sichtbareZeilen(page)).toHaveCount(5);
  await expect(page.locator("#rows tr[data-row]:not([hidden]) td.rew")).toHaveText(HYDRA_89.rewards);
  await expect(page.locator("#factorLabel")).toHaveText("Faktor Kupfer (Arche-Bonus)");
  await expect(page.locator("#factor")).toHaveValue("1,90");
  await expect(page.locator("#sumTotal")).toHaveAttribute("data-value", "28556");
});

test("Gold-Stufe: 7 Plätze, eigener Faktor mit 1,00 als Vorgabe", async ({ page }) => {
  await page.goto("/index.html" + CASTEL_112.hash);
  await eintragen(page, CASTEL_112.cost);
  await expect(sichtbareZeilen(page)).toHaveCount(7);
  await expect(page.locator("#rows tr[data-row]:not([hidden]) td.rew")).toHaveText(CASTEL_112.rewards);
  await expect(page.locator("#factorLabel")).toHaveText("Faktor Gold (Gold-Mäzen-Bonus)");
  await expect(page.locator("#factor")).toHaveValue("1,00");
  await expect(page.locator("#legendRest")).toHaveText("P4–P7");
  // P7 bringt 0 FP und steht nicht in der Chat-Zeile.
  await expect(page.locator("#chatPoints")).toContainText("P6(4)");
  await expect(page.locator("#chatPoints")).not.toContainText("P7");
});

test("Kupfer- und Gold-Faktor sind getrennt einstellbar", async ({ page }) => {
  await page.goto("/index.html" + CASTEL_112.hash);
  await eintragen(page, CASTEL_112.cost);
  await page.click("#factorUp");
  await expect(page.locator("#factor")).toHaveValue("1,01");

  // Zurück auf eine Kupfer-Stufe desselben Bauwerks: dort gilt weiter 1,90.
  await page.fill("#level", "100");
  await page.locator("#level").blur();
  await expect(page.locator("#factorLabel")).toHaveText("Faktor Kupfer (Arche-Bonus)");
  await expect(page.locator("#factor")).toHaveValue("1,90");
  await page.fill("#level", "112");
  await page.locator("#level").blur();
  await expect(page.locator("#factor")).toHaveValue("1,01");
});

test("eingetragene Kosten bleiben über das Neuladen gemerkt", async ({ page }) => {
  await page.goto("/index.html" + HYDRA_89.hash);
  await eintragen(page, HYDRA_89.cost);
  await page.reload();
  await expect(sichtbareZeilen(page)).toHaveCount(5);
  await expect(page.locator("#note")).toContainText("28.556 FP auf dieser Stufe von dir");
});

test("Ändern holt das Feld mit der alten Zahl zurück", async ({ page }) => {
  await page.goto("/index.html" + HYDRA_89.hash);
  await eintragen(page, HYDRA_89.cost);
  await page.click("#resetInput");
  await expect(page.locator("#inputTotal")).toHaveValue(HYDRA_89.cost);
  await expect(page.locator("#inputTotal")).toBeFocused();
  await page.fill("#inputTotal", "28557");
  await page.keyboard.press("Enter");
  await expect(page.locator("#sumTotal")).toHaveAttribute("data-value", "28557");
});

test("Kosten von vor dem Update werden nicht übernommen", async ({ page }) => {
  await page.goto("/index.html");
  await page.evaluate(() => localStorage.setItem("cipher:totals", JSON.stringify({ "Saturn_VI_Gate_HYDRA:89": 27995 })));
  await page.goto("/index.html" + HYDRA_89.hash);
  await page.reload();
  await expect(page.locator("#inputTotal")).toBeVisible();
  await expect(page.locator("#sumTotal")).toHaveText("–");
});

test("Bauwerke ohne Gold-Kategorie enden bei Stufe 200", async ({ page }) => {
  await page.goto("/index.html#lg=Tower_of_Babel&stufe=250");
  await expect(page.locator("#level")).toHaveValue(/^(199|200)$/);
  await expect(page.locator("#levelUp")).toBeDisabled();
});

test("Gold-Bauwerke gehen über Stufe 200 hinaus", async ({ page }) => {
  await page.goto("/index.html#lg=The_Arc&stufe=250");
  await expect(page.locator("#levelUp")).toBeEnabled();
});

test("die Schnellwahl bietet auf Gold-Stufen eigene Werte an", async ({ page }) => {
  const chips = page.locator("#factorChips button");
  await page.goto("/index.html" + CASTEL_112.hash);
  await eintragen(page, CASTEL_112.cost);
  await expect(chips).toHaveText(["1,00", "1,05", "1,10", "1,15", "1,20", "1,25"]);
  await expect(page.locator('#factorChips button[data-factor="100"]')).toHaveClass(/on/);

  await page.locator('#factorChips button[data-factor="120"]').click();
  await expect(page.locator("#factor")).toHaveValue("1,20");
  // P1 zahlt 1.984 × 1,20 = 2.380,8, also 2.381.
  await expect(page.locator('[data-pay-open="0"]')).toHaveText("2.381");

  // Auf einer Kupfer-Stufe die gewohnte Schnellwahl und der Kupfer-Faktor.
  await page.fill("#level", "100");
  await page.locator("#level").blur();
  await expect(chips).toHaveText(["1,80", "1,85", "1,90", "1,92", "1,95", "2,00"]);
  await expect(page.locator("#factor")).toHaveValue("1,90");
});
