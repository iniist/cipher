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

test("mit FP ist die Vorgabe, der Schalter zeigt die gewaehlte Fassung, und genau die wird gesammelt", async ({ page }) => {
  await nameEintragen(page, "Dani");
  await expect(page.locator('[data-chat-mode="points"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#chatPoints")).toBeVisible();
  await expect(page.locator("#chatPlain")).toBeHidden();
  expect(await page.locator("#chatPoints").textContent()).toMatch(/P1\(\d+\)/);

  await page.click('[data-chat-mode="plain"]');
  await expect(page.locator('[data-chat-mode="plain"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#chatPlain")).toBeVisible();
  await expect(page.locator("#chatPoints")).toBeHidden();

  const nurPlaetze = await page.locator("#chatPlain").textContent();
  expect(nurPlaetze).not.toMatch(/\(/);
  await knopf(page).click();
  await expect(page.locator(".coll-t").first()).toHaveText(nurPlaetze);
});

test("wer schon einen Namen hatte, muss ihn nicht neu eintragen", async ({ page }) => {
  // Ein Stand von vor dem Menue: der Name liegt, wo er immer lag.
  await page.evaluate(() => localStorage.setItem("cipher:state", JSON.stringify({ name: "Altbestand" })));
  await page.reload();
  await expect(page.locator("#nameNeedTop")).toBeHidden();
  await expect(knopf(page)).toHaveText("Zeile kopieren");
  await expect(page.locator("#chatPoints")).toContainText("Altbestand ");
  await page.click("#settingsPick");
  await expect(page.locator("#playerName")).toHaveValue("Altbestand");
});

test("das Menue rueckt ueber die Bildschirmtastatur", async ({ page }) => {
  // Die Tastatur selbst laesst sich hier nicht aufrufen; geprueft wird, dass
  // das Menue dieselbe Groesse vom sichtbaren Ausschnitt bekommt wie die
  // Bauwerksauswahl — daran haengt, dass es nicht hinter der Tastatur liegt.
  await page.click("#nameNeedTop .name-go");
  const hoehe = await page.evaluate(() => document.getElementById("settings").style.getPropertyValue("--vvh"));
  expect(hoehe).toBe(`${await page.evaluate(() => Math.round(window.visualViewport.height))}px`);
  await page.keyboard.press("Escape");
  await expect(page.locator("#settings")).toBeHidden();
});

test("die Wahl bleibt nach dem Neuladen", async ({ page }) => {
  await page.click('[data-chat-mode="plain"]');
  expect((await zustand(page)).chatMode).toBe("plain");
  await page.reload();
  await expect(page.locator('[data-chat-mode="plain"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#chatPlain")).toBeVisible();
});
