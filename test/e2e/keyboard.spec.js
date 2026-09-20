/**
 * Browsertests fuer die Tastaturbedienung und den Betrieb ohne JavaScript.
 */
const { test, expect } = require("@playwright/test");

/** Was gerade den Fokus hat, kurz beschrieben. */
const activeDescriptor = (page) => page.evaluate(() => ({
  tag: document.activeElement.tagName,
  slot: document.activeElement.dataset ? document.activeElement.dataset.slot ?? null : null
}));

test.describe("Tastatur", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/index.html");
    // Stufe 40: hier werfen alle fuenf Plaetze eine Belohnung ab, keine
    // Checkbox ist deaktiviert.
    await page.fill("#level", "40");
    await page.locator("#level").blur();
  });

  test("der Fokus bleibt auf der Checkbox, die umgeschaltet wurde", async ({ page }) => {
    const checkbox = page.locator('#rows input[data-slot="2"]');
    await checkbox.focus();
    await page.keyboard.press("Space");

    await expect(checkbox).not.toBeChecked();
    expect(await activeDescriptor(page)).toEqual({ tag: "INPUT", slot: "2" });
  });

  test("mehrere Plaetze lassen sich nacheinander abwaehlen, ohne neu zu tabben", async ({ page }) => {
    await page.locator('#rows input[data-slot="4"]').focus();
    await page.keyboard.press("Space");
    // Ohne Fokuswiederherstellung landete der Fokus hier auf <body> und
    // Shift+Tab kaeme nie bei P4 an.
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Space");

    await expect(page.locator('#rows input[data-slot="4"]')).not.toBeChecked();
    await expect(page.locator('#rows input[data-slot="3"]')).not.toBeChecked();
    await expect(page.locator('#rows input[data-slot="2"]')).toBeChecked();
  });

  test("der Fokus wird nur zurueckgegeben, wenn er in der Tabelle stand", async ({ page }) => {
    await page.locator("#factor").focus();
    await page.keyboard.press("ArrowRight");
    expect(await activeDescriptor(page)).toEqual({ tag: "INPUT", slot: null });
    await expect(page.locator("#factor")).toBeFocused();
  });
});

test.describe("ohne JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("erklaert der Hinweis, warum die Seite leer bleibt", async ({ page }) => {
    await page.goto("/index.html");

    const note = page.locator(".noscript");
    await expect(note).toBeVisible();
    await expect(note).toContainText("JavaScript ist aus");
    await expect(note).toContainText("vollständig in deinem Browser");
    await expect(note.locator('a[href="./datenschutz.html"]')).toBeVisible();
  });

  test("bleiben die Rechtsseiten vollstaendig lesbar", async ({ page }) => {
    await page.goto("/impressum.html");
    await expect(page.locator("h1")).toHaveText("Impressum");
    await expect(page.locator("main")).toContainText("Daniel Scholz");

    await page.goto("/datenschutz.html");
    await expect(page.locator("h1")).toHaveText("Datenschutzerklärung");
    await expect(page.locator("main")).toContainText("keine Cookies");
  });
});
