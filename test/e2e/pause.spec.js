/**
 * Die Pause zum Prestige-Update (pause.js): vor dem Stichtag rechnet cipher
 * wie immer, ab dem Stichtag steht statt des Rechners ein Hinweis.
 */
const { test, expect } = require("@playwright/test");

const KURZ_DAVOR = new Date("2026-11-04T22:59:00Z"); // 4.11., 23:59 Uhr MEZ
const STICHTAG = new Date("2026-11-04T23:00:00Z");   // 5.11., 0:00 Uhr MEZ

test("kurz vor dem Update rechnet cipher, der Hinweis bleibt verborgen", async ({ page }) => {
  await page.clock.setFixedTime(KURZ_DAVOR);
  await page.goto("/index.html");
  await expect(page.locator("#pause")).toBeHidden();
  await expect(page.locator("#rows tr")).toHaveCount(5);
  await expect(page.locator("#sumTotal")).toBeVisible();
});

test("ab dem Update steht der Hinweis statt des Rechners", async ({ page }) => {
  await page.clock.setFixedTime(STICHTAG);
  await page.goto("/index.html");
  await expect(page.locator("#pause")).toBeVisible();
  await expect(page.locator("#pauseTitle")).toHaveText("cipher macht eine kurze Pause");
  await expect(page.locator("#pause")).toContainText("Prestige-Update vom 5. November 2026");
  await expect(page.locator("#sumTotal")).toBeHidden();
  await expect(page.locator("#howTitle")).toBeHidden();
  await expect(page.locator("#dataDate")).toBeHidden();
  // Kopf und Fuß bleiben: Darstellung und Rechtliches erreichbar.
  await expect(page.locator("#wordmark")).toBeVisible();
  await expect(page.locator(".site-foot")).toBeVisible();
});

test("die Pause rührt den Speicher nicht an", async ({ page }) => {
  await page.clock.setFixedTime(KURZ_DAVOR);
  await page.goto("/index.html");
  await page.evaluate(() => localStorage.setItem("cipher:favorites", "[\"test\"]"));
  await page.clock.setFixedTime(STICHTAG);
  await page.reload();
  await expect(page.locator("#pause")).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("cipher:favorites"))).toBe("[\"test\"]");
});

test("Bauwerksseite: Hinweis erst ab dem Update", async ({ page }) => {
  await page.clock.setFixedTime(KURZ_DAVOR);
  await page.goto("/arche.html");
  await expect(page.locator(".pause-note")).toBeHidden();
  await page.clock.setFixedTime(STICHTAG);
  await page.reload();
  await expect(page.locator(".pause-note")).toBeVisible();
  await expect(page.locator(".pause-note")).toContainText("bis zum Prestige-Update vom 5. November 2026");
  await expect(page.locator("table.levels")).toBeVisible();
});
