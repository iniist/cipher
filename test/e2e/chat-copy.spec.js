/**
 * Browsertests fuer das Kopieren der Chat-Zeile.
 *
 * Eine Zeile, ein Knopf; ob die FP mitgehen, sagt der Schalter darueber.
 * Kopiert wird erst mit Spielernamen.
 */
const { test, expect } = require("@playwright/test");
const { nameEintragen } = require("./menue");

const knopf = (page) => page.locator("#chatCopy");
const zustand = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("cipher:state") || "{}"));

test.beforeEach(async ({ page }) => {
  await page.goto("/index.html");
});

test("ohne Namen kopiert der Knopf nicht, sondern fuehrt ins Namensfeld", async ({ page }) => {
  await expect(knopf(page)).toHaveText("Erst Namen eintragen");
  await expect(page.locator("#nameNeedTop")).toBeVisible();

  await knopf(page).click();
  await expect(page.locator("#settings")).toBeVisible();
  await expect(page.locator("#playerName")).toBeFocused();
  // Nichts kopiert, also auch nichts gesammelt.
  await expect(page.locator("#collection")).toBeHidden();

  await page.keyboard.type("Dani");
  await page.keyboard.press("Enter");
  await expect(knopf(page)).toHaveText("Zeile kopieren");
  await expect(knopf(page)).toBeFocused();
  // Das Enter, das das Menue schloss, hat nicht gleich kopiert.
  await expect(page.locator("#collection")).toBeHidden();
  await expect(page.locator("#nameNeedTop")).toBeHidden();
});

test("der obere Hinweis oeffnet das Menue im Namensfeld", async ({ page }) => {
  await page.click("#nameNeedTop .name-go");
  await expect(page.locator("#playerName")).toBeFocused();
});

test("nur Leerzeichen zaehlen nicht als Name", async ({ page }) => {
  await nameEintragen(page, "   ");
  await expect(knopf(page)).toHaveText("Erst Namen eintragen");
  await expect(page.locator("#nameNeedTop")).toBeVisible();
});

test("der Schalter zeigt die gewaehlte Fassung, und genau die wird gesammelt", async ({ page }) => {
  await nameEintragen(page, "Dani");
  await expect(page.locator('[data-chat-mode="plain"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#chatPlain")).toBeVisible();
  await expect(page.locator("#chatPoints")).toBeHidden();

  await page.click('[data-chat-mode="points"]');
  await expect(page.locator('[data-chat-mode="points"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#chatPoints")).toBeVisible();
  await expect(page.locator("#chatPlain")).toBeHidden();

  const mitFp = await page.locator("#chatPoints").textContent();
  expect(mitFp).toMatch(/P1\(\d+\)/);
  await knopf(page).click();
  await expect(page.locator(".coll-t").first()).toHaveText(mitFp);
});

test("die Wahl bleibt nach dem Neuladen", async ({ page }) => {
  await page.click('[data-chat-mode="points"]');
  expect((await zustand(page)).chatMode).toBe("points");
  await page.reload();
  await expect(page.locator('[data-chat-mode="points"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#chatPoints")).toBeVisible();
});
