/**
 * Browsertests fuer die Bauwerksseiten (arche.html, …, tools/build-pages.js):
 * erreichbar wie auf Netlify, ohne Skript vollstaendig, und jede Stufe
 * fuehrt mit Bauwerk und Stufe in den Rechner.
 */
const { test, expect } = require("@playwright/test");
const DATA = require("../../data.js");
const Calc = require("../../calc.js");
const { PAGES } = require("../../tools/build-pages.js");

const fmt = (value) => String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

for (const page of PAGES) {
  test(`/${page.slug} ist ohne .html erreichbar und traegt sich als canonical`, async ({ request }) => {
    const response = await request.get("/" + page.slug);
    expect(response.status()).toBe(200);
    expect(await response.text()).toContain(`<link rel="canonical" href="https://foe-foerderrechner.com/${page.slug}">`);
  });
}

test("die Arche-Seite steht ohne JavaScript vollstaendig da", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/arche");
  await expect(page.locator("h1")).toHaveText("Die Arche fördern: Kosten und Mäzenplätze je Stufe");
  const arc = DATA.buildings.find((building) => building.id === "The_Arc");
  await expect(page.locator(".levels tbody tr")).toHaveCount(arc.maxLevel);
  await expect(page.locator("#stufe-80 td").first()).toHaveText(fmt(Calc.totalCost(arc, 80, {}).value));
  await context.close();
});

test("ein Tipp auf die Stufe oeffnet sie im Rechner", async ({ page }) => {
  await page.goto("/arche");
  await page.locator('#stufe-80 a').click();
  await expect(page).toHaveURL(/\/$/); // der Anhang ist wieder weg
  await expect(page.locator("#level")).toHaveValue("80");
  const arc = DATA.buildings.find((building) => building.id === "The_Arc");
  await expect.poll(async () => (await page.locator("#sumTotal").textContent()).trim())
    .toBe(fmt(Calc.totalCost(arc, 80, {}).value));
});

test("ein unbekanntes Bauwerk im Link aendert nichts", async ({ page }) => {
  await page.goto("/index.html#lg=Gibts_nicht&stufe=80");
  await expect(page.locator("#level")).not.toHaveValue("80");
  expect(new URL(page.url()).hash).toBe("");
});
