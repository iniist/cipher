/**
 * Browsertests fuer das Menue.
 *
 * Name, Darstellung und Kuerzel-Schalter stehen nicht mehr auf der Seite,
 * sondern im Menue oben rechts. Die Welt bleibt draussen sichtbar.
 */
const { test, expect } = require("@playwright/test");
const { nameEintragen, themaWaehlen } = require("./menue");

test.beforeEach(async ({ page }) => {
  await page.goto("/index.html");
});

test("oben stehen nur Welt und Menue, die Einstellungen liegen im Menue", async ({ page }) => {
  await expect(page.locator("#worldPick")).toBeVisible();
  await expect(page.locator("#settingsPick")).toBeVisible();
  await expect(page.locator(".modes")).toBeHidden();
  await expect(page.locator("#playerName")).toBeHidden();
  await expect(page.locator("#useAbbr")).toBeHidden();

  await page.click("#settingsPick");
  await expect(page.locator("#settingsPick")).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator(".modes")).toBeVisible();
  await expect(page.locator("#playerName")).toBeVisible();
  await expect(page.locator("#useAbbr")).toBeVisible();

  await page.click("#settingsClose");
  await expect(page.locator("#settings")).toBeHidden();
  await expect(page.locator("#settingsPick")).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("#settingsPick")).toBeFocused();
});

test("ohne Namen weist der Foerderchat den Weg ins Menue", async ({ page }) => {
  await expect(page.locator("#nameHint")).toBeVisible();
  await page.click("#nameHintGo");
  await expect(page.locator("#settings")).toBeVisible();
  await expect(page.locator("#playerName")).toBeFocused();

  await page.keyboard.type("Dani");
  await page.keyboard.press("Enter");
  await expect(page.locator("#settings")).toBeHidden();
  await expect(page.locator("#nameHint")).toBeHidden();
  await expect(page.locator("#chatPlain")).toContainText("Dani ");
  // Der Hinweis ist weg, also kehrt der Fokus zum Menueknopf zurueck.
  await expect(page.locator("#settingsPick")).toBeFocused();
});

test("mit Namen bleibt der Hinweis weg, auch nach dem Neuladen", async ({ page }) => {
  await nameEintragen(page, "Dani");
  await page.reload();
  await expect(page.locator("#nameHint")).toBeHidden();
});

test("das Theme laesst sich im Menue waehlen und bleibt", async ({ page }) => {
  await themaWaehlen(page, "writer");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "writer");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "writer");
});

test("ein Tipp daneben schliesst das Menue", async ({ page }) => {
  await page.click("#settingsPick");
  await expect(page.locator("#settings")).toBeVisible();
  await page.mouse.click(5, 5);
  await expect(page.locator("#settings")).toBeHidden();
});
