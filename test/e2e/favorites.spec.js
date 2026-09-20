/**
 * Browsertests fuer die Favoriten.
 */
const { test, expect } = require("@playwright/test");

const favEntries = (page) => page.locator("#favList li");

test.beforeEach(async ({ page }) => {
  await page.goto("/index.html");
});

test("ohne Favoriten steht ein Hinweis da", async ({ page }) => {
  await expect(page.locator("#favEmpty")).toBeVisible();
  await expect(favEntries(page)).toHaveCount(0);
  await expect(page.locator("#favSave")).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#favSaveText")).toHaveText("Merken");
});

test("merkt Bauwerk und Stufe und springt zurueck", async ({ page }) => {
  await page.selectOption("#building", "Notre_Dame");
  await page.fill("#level", "42");
  await page.locator("#level").blur();
  await page.click("#favSave");

  await expect(favEntries(page)).toHaveCount(1);
  await expect(page.locator("#favEmpty")).toBeHidden();
  await expect(page.locator("#favSaveText")).toHaveText("Gemerkt");
  await expect(favEntries(page).first()).toHaveAttribute("aria-current", "true");
  await expect(page.locator(".fav-go").first()).toHaveText("Notre Dame 42");

  // Woanders hin, dann ueber den Favoriten zurueck
  await page.selectOption("#building", "Colosseum");
  await page.fill("#level", "7");
  await page.locator("#level").blur();
  await expect(page.locator("#favSaveText")).toHaveText("Merken");
  await expect(favEntries(page).first()).not.toHaveAttribute("aria-current", "true");

  await page.locator(".fav-go").first().click();
  await expect(page.locator("#building")).toHaveValue("Notre_Dame");
  await expect(page.locator("#level")).toHaveValue("42");
  await expect(page.locator("#favSaveText")).toHaveText("Gemerkt");
});

test("mehrere Favoriten stehen nebeneinander, neueste zuerst", async ({ page }) => {
  const picks = [
    ["Notre_Dame", "42"],
    ["Colosseum", "12"],
    ["The_Arc", "80"]
  ];
  for (const [id, level] of picks) {
    await page.selectOption("#building", id);
    await page.fill("#level", level);
    await page.locator("#level").blur();
    await page.click("#favSave");
  }

  await expect(favEntries(page)).toHaveCount(3);
  await expect(page.locator(".fav-go")).toHaveText(["Die Arche 80", "Kolosseum 12", "Notre Dame 42"]);
});

test("dasselbe Bauwerk laesst sich in mehreren Stufen merken", async ({ page }) => {
  for (const level of ["10", "40", "80"]) {
    await page.fill("#level", level);
    await page.locator("#level").blur();
    await page.click("#favSave");
  }
  await expect(favEntries(page)).toHaveCount(3);
  await expect(page.locator(".fav-go")).toHaveText(["Die Arche 80", "Die Arche 40", "Die Arche 10"]);
});

test("erneutes Klicken vergisst den Favoriten wieder", async ({ page }) => {
  await page.click("#favSave");
  await expect(favEntries(page)).toHaveCount(1);

  await page.click("#favSave");
  await expect(favEntries(page)).toHaveCount(0);
  await expect(page.locator("#favEmpty")).toBeVisible();
  await expect(page.locator("#favSaveText")).toHaveText("Merken");
});

test("das Kreuz entfernt einen einzelnen Favoriten", async ({ page }) => {
  await page.click("#favSave");
  await page.selectOption("#building", "Colosseum");
  await page.click("#favSave");
  await expect(favEntries(page)).toHaveCount(2);

  await page.locator(".fav-del").first().click();
  await expect(favEntries(page)).toHaveCount(1);
  await expect(page.locator(".fav-go")).toHaveText(["Die Arche 10"]);
});

test("Favoriten ueberleben einen Neuladen", async ({ page }) => {
  await page.selectOption("#building", "Notre_Dame");
  await page.fill("#level", "42");
  await page.locator("#level").blur();
  await page.click("#favSave");

  await page.reload();
  await expect(favEntries(page)).toHaveCount(1);
  await expect(page.locator(".fav-go").first()).toHaveText("Notre Dame 42");
});

test("die Liste wird bei zwoelf Eintraegen gedeckelt", async ({ page }) => {
  for (let level = 1; level <= 14; level++) {
    await page.fill("#level", String(level));
    await page.locator("#level").blur();
    await page.click("#favSave");
  }
  await expect(favEntries(page)).toHaveCount(12);
  // Der neueste steht vorne, der aelteste ist herausgefallen
  await expect(page.locator(".fav-go").first()).toHaveText("Die Arche 14");
  await expect(page.locator(".fav-go").last()).toHaveText("Die Arche 3");
});

test("kaputte Favoriten im Speicher werden verworfen", async ({ page }) => {
  await page.evaluate(() => {
    localStorage.setItem("cipher:favorites", JSON.stringify([
      { id: "Notre_Dame", level: 42 },     // gut
      { id: "Gibt_Es_Nicht", level: 5 },   // unbekanntes Bauwerk
      { id: "Notre_Dame", level: 9999 },   // ueber dem Maximum
      { id: "Notre_Dame", level: 42 },     // Dublette
      null                                  // Schrott
    ]));
  });
  await page.reload();
  await expect(favEntries(page)).toHaveCount(1);
  await expect(page.locator(".fav-go").first()).toHaveText("Notre Dame 42");
});
