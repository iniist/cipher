/**
 * Gesamtkosten seit dem Prestige-Update: aus kosten.js (Wiki von InnoGames),
 * ein eigener Eintrag hat Vorrang, oberhalb der Tabelle fragt cipher nach.
 * Bewusst ohne die Fixture mit Testkosten: hier beginnt der Speicher leer.
 */
const { test, expect } = require("@playwright/test");

/** Ablesungen aus dem Spiel, 5.11.2026 (siehe test/prestige.test.js). */
const CASTEL_112 = { hash: "#lg=Castel_del_Monte&stufe=112", cost: "22732",
  rewards: ["1.984", "992", "331", "83", "17", "4", "0"] };
const HYDRA_89 = { hash: "#lg=Saturn_VI_Gate_HYDRA&stufe=89", cost: "28556",
  rewards: ["4.159", "2.079", "693", "173", "35"] };
/** Ueber Stufe 500 reicht die Tabelle nicht. */
const ARCHE_501 = "#lg=The_Arc&stufe=501";

async function eintragen(page, cost) {
  await page.fill("#inputTotal", cost);
  await page.click("#applyInput");
}

const zeilen = (page) => page.locator("#rows tr[data-row]");

test("die Kosten kommen aus der Tabelle, ohne dass jemand etwas einträgt", async ({ page }) => {
  await page.goto("/index.html" + HYDRA_89.hash);
  await expect(zeilen(page)).toHaveCount(5);
  await expect(page.locator("#rows td.rew")).toHaveText(HYDRA_89.rewards);
  await expect(page.locator("#sumTotal")).toHaveAttribute("data-value", HYDRA_89.cost);
  await expect(page.locator("#inputTotal")).toHaveCount(0);
  await expect(page.locator("#note")).toHaveText("");
  await expect(page.locator("#factorLabel")).toHaveText("Faktor Kupfer (Arche-Bonus)");
  await expect(page.locator("#factor")).toHaveValue("1,90");
});

test("Gold-Stufe: 7 Plätze, eigener Faktor mit 1,00 als Vorgabe", async ({ page }) => {
  await page.goto("/index.html" + CASTEL_112.hash);
  await expect(zeilen(page)).toHaveCount(7);
  await expect(page.locator("#rows td.rew")).toHaveText(CASTEL_112.rewards);
  await expect(page.locator("#factorLabel")).toHaveText("Faktor Gold (Gold-Mäzen-Bonus)");
  await expect(page.locator("#factor")).toHaveValue("1,00");
  await expect(page.locator("#legendRest")).toHaveText("P4–P7");
  // P7 bringt 0 FP und steht nicht in der Chat-Zeile.
  await expect(page.locator("#chatPoints")).toContainText("P6(4)");
  await expect(page.locator("#chatPoints")).not.toContainText("P7");
});

test("über der Tabelle fragt cipher nach den Gesamt-FP", async ({ page }) => {
  await page.goto("/index.html" + ARCHE_501);
  await expect(page.locator("#note")).toContainText("kenne ich die Kosten noch nicht");
  await expect(page.locator("#rows .empty")).toContainText("Gesamt-FP");
  await expect(page.locator("#sumTotal")).toHaveText("–");

  await eintragen(page, "10300000");
  await expect(zeilen(page)).toHaveCount(7);
  await expect(page.locator("#sumTotal")).toHaveAttribute("data-value", "10300000");

  // Gemerkt über das Neuladen, und "Ändern" holt das Feld mit der Zahl zurück.
  await page.reload();
  await expect(page.locator("#note")).toContainText("10.300.000 FP auf dieser Stufe von dir");
  await page.click("#resetInput");
  await expect(page.locator("#inputTotal")).toHaveValue("10300000");
  await expect(page.locator("#inputTotal")).toBeFocused();
  await page.fill("#inputTotal", "10300001");
  await page.keyboard.press("Enter");
  await expect(page.locator("#sumTotal")).toHaveAttribute("data-value", "10300001");
});

test("ein eigener Eintrag geht vor, Zurücksetzen führt zur Tabelle", async ({ page }) => {
  await page.goto("/index.html");
  await page.evaluate(() => localStorage.setItem("cipher:costs",
    JSON.stringify({ "Saturn_VI_Gate_HYDRA:89": 28600 })));
  await page.goto("/index.html" + HYDRA_89.hash);
  await page.reload();
  await expect(page.locator("#sumTotal")).toHaveAttribute("data-value", "28600");
  await expect(page.locator("#note")).toContainText("laut Wiki 28.556");

  await page.click("#resetInput");
  await expect(page.locator("#sumTotal")).toHaveAttribute("data-value", HYDRA_89.cost);
  await expect(page.locator("#note")).toHaveText("");
});

test("Kosten von vor dem Update werden nicht übernommen", async ({ page }) => {
  await page.goto("/index.html");
  await page.evaluate(() => localStorage.setItem("cipher:totals", JSON.stringify({ "Saturn_VI_Gate_HYDRA:89": 27995 })));
  await page.goto("/index.html" + HYDRA_89.hash);
  await page.reload();
  await expect(page.locator("#sumTotal")).toHaveAttribute("data-value", HYDRA_89.cost);
});

test("Kupfer- und Gold-Faktor sind getrennt einstellbar", async ({ page }) => {
  await page.goto("/index.html" + CASTEL_112.hash);
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

test("die Schnellwahl bietet auf Gold-Stufen eigene Werte an", async ({ page }) => {
  const chips = page.locator("#factorChips button");
  await page.goto("/index.html" + CASTEL_112.hash);
  await expect(chips).toHaveText(["1,00", "1,05", "1,10", "1,15", "1,20", "1,25"]);
  await expect(page.locator('#factorChips button[data-factor="100"]')).toHaveClass(/on/);

  await page.locator('#factorChips button[data-factor="120"]').click();
  await expect(page.locator("#factor")).toHaveValue("1,20");
  // P1 zahlt 1.984 × 1,20 = 2.380,8, also 2.381.
  await expect(page.locator('[data-pay-open="0"]')).toHaveText("2.381");

  await page.fill("#level", "100");
  await page.locator("#level").blur();
  await expect(chips).toHaveText(["1,80", "1,85", "1,90", "1,92", "1,95", "2,00"]);
  await expect(page.locator("#factor")).toHaveValue("1,90");
});

test("Bauwerke ohne Gold-Kategorie enden bei Stufe 200", async ({ page }) => {
  await page.goto("/index.html#lg=Tower_of_Babel&stufe=250");
  await expect(page.locator("#level")).toHaveValue(/^(199|200)$/);
  await expect(page.locator("#levelUp")).toBeDisabled();
});

test("die Fußzeile nennt die Quelle der Kosten", async ({ page }) => {
  await page.goto("/index.html");
  const zeile = page.locator("#costDate").locator("xpath=..");
  await expect(zeile).toContainText("© InnoGames GmbH");
  await expect(zeile.locator('a[href="https://de.wiki.forgeofempires.com/"]')).toHaveCount(1);
});

test("der Schalter „Faktor“ hängt ihn an die Chat-Zeile, auf Gold-Stufen den Gold-Faktor", async ({ page }) => {
  await page.goto("/index.html" + HYDRA_89.hash);
  await expect(page.locator("#chatFactor")).not.toBeChecked();
  await expect(page.locator("#chatPoints")).not.toContainText("...");

  await page.locator("#chatFactor").check();
  await expect(page.locator("#chatPoints")).toHaveText(/ \.\.\. 1\.9$/);
  await expect(page.locator("#chatPlain")).toHaveText(/ \.\.\. 1\.9$/);

  // Gemerkt über das Neuladen.
  await page.reload();
  await expect(page.locator("#chatFactor")).toBeChecked();

  await page.goto("/index.html" + CASTEL_112.hash);
  await page.reload();
  await expect(page.locator("#chatPoints")).toHaveText(/ \.\.\. 1\.0$/);
});

test("die Zeile über dem Plan nennt Anteil und Sprünge", async ({ page }) => {
  const info = page.locator("#planInfo");
  await page.goto("/index.html" + HYDRA_89.hash);
  await expect(info).toHaveText("Kupfer-Stufe · 5 Plätze · Mäzen-Anteil 25 % der Stufenkosten");

  // Siphon: auf 69 kündigt sich der Sprung an, auf 70 steht, was davor galt.
  await page.goto("/index.html#lg=Shattered_Horizon_Siphon&stufe=69");
  await page.reload();
  await expect(info).toHaveText("Kupfer-Stufe · 5 Plätze · Mäzen-Anteil 40 % der Stufenkosten · ab Stufe 70: 25 %");
  await page.click("#levelUp");
  await expect(info).toHaveText("Kupfer-Stufe · 5 Plätze · Mäzen-Anteil 25 % der Stufenkosten (bis Stufe 69: 40 %)");

  // Gold-Bauwerk an der Grenze zu Gold.
  await page.goto("/index.html#lg=The_Arc&stufe=100");
  await page.reload();
  await expect(info).toHaveText("Kupfer-Stufe · 5 Plätze · Mäzen-Anteil 25 % der Stufenkosten · ab Stufe 101: Gold, 7 Plätze, 15 %");
  await page.click("#levelUp");
  await expect(info).toHaveText("Gold-Stufe · 7 Plätze · Mäzen-Anteil 15 % der Stufenkosten (bis Stufe 100: 25 %)");
});
