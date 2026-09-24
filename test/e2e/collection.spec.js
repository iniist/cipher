/**
 * Browsertests fuer die Sammlung unter den beiden Kopierkaesten.
 *
 * Der Fall dahinter: mehrere Bauwerke stehen gleichzeitig in der
 * Foerdergruppe, und am Ende soll eine Nachricht alle Zeilen enthalten.
 * Frueher war der Umweg dafuer eine Notiz ausserhalb von cipher.
 */
const { test, expect } = require("@playwright/test");

const eintraege = (page) => page.locator("#collList li");

/** Ein Bauwerk einstellen und seine Zeile kopieren. */
async function sammle(page, id, level, welche) {
  await page.locator("#building").selectOption(id, { force: true });
  await page.fill("#level", String(level));
  await page.locator("#level").blur();
  await page.click(`button[data-copy="${welche || "chatPlain"}"]`);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/index.html");
});

test("ohne gesammelte Zeile fehlt der Kasten", async ({ page }) => {
  await expect(page.locator("#collection")).toBeHidden();
  await expect(eintraege(page)).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("cipher:collection"))).toBeNull();
});

test("was kopiert wird, landet in der Sammlung", async ({ page }) => {
  await page.fill("#playerName", "Dani");
  const zeile = await page.locator("#chatPlain").textContent();

  await page.click('button[data-copy="chatPlain"]');

  await expect(page.locator("#collection")).toBeVisible();
  await expect(eintraege(page)).toHaveCount(1);
  await expect(page.locator(".coll-t").first()).toHaveText(zeile);
  await expect(page.locator("#collCount")).toHaveText("1 Zeile");
});

test("mehrere Bauwerke stehen in der Reihenfolge des Sammelns", async ({ page }) => {
  await sammle(page, "Notre_Dame", 42);
  await sammle(page, "Colosseum", 12, "chatPoints");
  await sammle(page, "The_Arc", 80);

  await expect(eintraege(page)).toHaveCount(3);
  await expect(page.locator("#collCount")).toHaveText("3 Zeilen");

  const texte = await page.locator(".coll-t").allTextContents();
  expect(texte[0]).toContain("Notre Dame");
  expect(texte[1]).toContain("Kolosseum");
  expect(texte[2]).toContain("Arche");
  // Die mittlere Zeile kam ueber den FP-Knopf, sie traegt also Zahlen.
  expect(texte[1]).toMatch(/P\d\(\d+\)/);
});

test("dasselbe Bauwerk erneut kopiert ersetzt seine Zeile an Ort und Stelle", async ({ page }) => {
  await sammle(page, "Notre_Dame", 42);
  await sammle(page, "Colosseum", 12);

  // Zurueck zum ersten Bauwerk, diesmal mit FP — dieselbe Foerderung,
  // nur anders geschrieben. Eine zweite Zeile waere ein Widerspruch.
  await sammle(page, "Notre_Dame", 42, "chatPoints");

  await expect(eintraege(page)).toHaveCount(2);
  const texte = await page.locator(".coll-t").allTextContents();
  expect(texte[0]).toContain("Notre Dame");
  expect(texte[0]).toMatch(/P5\(\d+\)/);
  expect(texte[1]).toContain("Kolosseum");
});

test("eine einzelne Zeile laesst sich wieder herausnehmen", async ({ page }) => {
  await sammle(page, "Notre_Dame", 42);
  await sammle(page, "Colosseum", 12);

  await page.locator(".coll-del").first().click();

  await expect(eintraege(page)).toHaveCount(1);
  await expect(page.locator(".coll-t").first()).toContainText("Kolosseum");
  const gespeichert = await page.evaluate(() => JSON.parse(localStorage.getItem("cipher:collection")));
  expect(gespeichert.map((entry) => entry.id)).toEqual(["Colosseum"]);
});

test("Leeren raeumt die Sammlung und blendet den Kasten aus", async ({ page }) => {
  await sammle(page, "Notre_Dame", 42);
  await expect(page.locator("#collection")).toBeVisible();

  await page.click("#collClear");

  await expect(page.locator("#collection")).toBeHidden();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("cipher:collection")))).toEqual([]);
});

test("die Sammlung ueberdauert das Neuladen", async ({ page }) => {
  await sammle(page, "Notre_Dame", 42);
  await sammle(page, "Colosseum", 12);
  const vorher = await page.locator(".coll-t").allTextContents();

  await page.reload();

  await expect(page.locator("#collection")).toBeVisible();
  expect(await page.locator(".coll-t").allTextContents()).toEqual(vorher);
});

test("laeuft die Sammlung ueber, faellt die aelteste Zeile heraus", async ({ page }) => {
  await page.evaluate(() => {
    const voll = [];
    for (let i = 0; i < 15; i++) voll.push({ id: "Bauwerk_" + i, text: "Zeile " + i });
    localStorage.setItem("cipher:collection", JSON.stringify(voll));
  });
  await page.reload();
  await expect(eintraege(page)).toHaveCount(15);

  await sammle(page, "Notre_Dame", 42);

  await expect(eintraege(page)).toHaveCount(15);
  const texte = await page.locator(".coll-t").allTextContents();
  expect(texte[0]).toBe("Zeile 1");
  expect(texte[14]).toContain("Notre Dame");
});

test("kaputte Eintraege im Speicher werden ausgesiebt", async ({ page }) => {
  await page.evaluate(() => localStorage.setItem("cipher:collection", JSON.stringify([
    { id: "Notre_Dame", text: "Notre Dame P5 P4" },
    { id: "Notre_Dame", text: "noch einmal dasselbe Bauwerk" },
    { id: "Colosseum", text: "   " },
    { id: "The_Arc" },
    "Unsinn"
  ])));
  await page.reload();

  await expect(eintraege(page)).toHaveCount(1);
  await expect(page.locator(".coll-t").first()).toHaveText("Notre Dame P5 P4");
});

test("Alle kopieren legt die Zeilen untereinander in die Zwischenablage", async ({ page, context, browserName }) => {
  test.skip(browserName !== "chromium", "Zwischenablage-Rechte gibt es hier nur in Chromium");
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);

  await sammle(page, "Notre_Dame", 42);
  await sammle(page, "Colosseum", 12);
  const zeilen = await page.locator(".coll-t").allTextContents();

  const knopf = page.locator("#collCopy");
  await knopf.click();
  await expect(knopf).toHaveText("Kopiert");

  const zwischenablage = await page.evaluate(() => navigator.clipboard.readText());
  expect(zwischenablage).toBe(zeilen.join("\n"));

  await expect(knopf).toHaveText("Alle kopieren", { timeout: 3000 });
});

test("die Bedienelemente der Sammlung tragen eine Beschriftung", async ({ page }) => {
  await sammle(page, "Notre_Dame", 42);
  await expect(page.locator(".coll-del").first())
    .toHaveAttribute("aria-label", "Notre Dame aus der Sammlung entfernen");
  await expect(page.locator("#collList")).toHaveAttribute("aria-labelledby", "collLabel");
});
