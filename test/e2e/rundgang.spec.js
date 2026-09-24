/**
 * Browsertests fuer die Vorstellungsseite (rundgang.html).
 *
 * Die Seite wird geteilt, nicht aus dem Rechner verlinkt — das halten die
 * Tests fest, ebenso dass sie ohne Bewegung und ohne Skript vollstaendig ist.
 */
const { test, expect } = require("@playwright/test");

test("der Rechner verlinkt den Rundgang nicht", async ({ page }) => {
  for (const path of ["/index.html", "/impressum.html", "/datenschutz.html"]) {
    await page.goto(path);
    await expect(page.locator('a[href*="rundgang"]')).toHaveCount(0);
  }
});

test("der Rundgang fuehrt zum Rechner und laedt alle Bilder", async ({ page }) => {
  await page.goto("/rundgang.html", { waitUntil: "networkidle" });
  await expect(page.locator("h1")).toHaveText("cipher");
  await expect(page.locator('a.btn[href="./index.html"]').first()).toBeVisible();

  // Lazy geladene Bilder durch Scrollen anstossen, dann jedes pruefen.
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < height; y += 600) {
    await page.evaluate((top) => window.scrollTo(0, top), y);
    await page.waitForTimeout(30);
  }
  await expect.poll(() => page.evaluate(() => Array.from(document.images)
    .filter((image) => !image.complete || image.naturalWidth === 0)
    .map((image) => image.getAttribute("src")))).toEqual([]);
});

test("ohne Bewegung steht alles sofort da", async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto("/rundgang.html");
  const hidden = await page.evaluate(() => Array.from(document.querySelectorAll(".reveal"))
    .filter((element) => getComputedStyle(element).opacity !== "1").length);
  expect(hidden).toBe(0);
  await context.close();
});

test("ohne Skript ist nichts versteckt", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/rundgang.html");
  await expect(page.locator(".feature").first()).toBeVisible();
  const hidden = await page.evaluate(() => Array.from(document.querySelectorAll(".reveal"))
    .filter((element) => getComputedStyle(element).opacity !== "1").length);
  expect(hidden).toBe(0);
  await context.close();
});

test("Sichern und Summe lassen sich umschalten", async ({ page }) => {
  await page.goto("/rundgang.html");
  await page.locator("#planSwap").scrollIntoViewIfNeeded();
  await page.click('[data-plan="summe"]');
  await expect(page.locator('[data-plan="summe"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('[data-plan-img="summe"]')).toHaveClass(/is-on/);
  await expect(page.locator('[data-plan-img="sichern"]')).not.toHaveClass(/is-on/);
});

test("keine waagrechte Scrollleiste", async ({ page }) => {
  await page.goto("/rundgang.html", { waitUntil: "networkidle" });
  const [scroll, inner] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(scroll).toBeLessThanOrEqual(inner);
});
