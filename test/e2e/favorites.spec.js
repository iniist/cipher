/**
 * Browsertests fuer die Favoriten.
 */
const { test, expect } = require("@playwright/test");

const favEntries = (page) => page.locator("#favList li");

test.beforeEach(async ({ page }) => {
  await page.goto("/index.html");
});

test("ohne Favoriten fehlt der Streifen, der Knopf erklärt sich selbst", async ({ page }) => {
  await expect(page.locator("#favs")).toBeHidden();
  await expect(favEntries(page)).toHaveCount(0);
  await expect(page.locator("#favSave")).toHaveAttribute("aria-pressed", "false");
  // Statt eines grauen Platzhaltersatzes sagt der Knopf, was er merken würde.
  await expect(page.locator("#favSaveText")).toHaveText("Die Arche · Stufe 10 merken");
});

test("merkt Bauwerk und Stufe und springt zurueck", async ({ page }) => {
  await page.selectOption("#building", "Notre_Dame");
  await page.fill("#level", "42");
  await page.locator("#level").blur();
  await page.click("#favSave");

  await expect(favEntries(page)).toHaveCount(1);
  await expect(page.locator("#favs")).toBeVisible();
  await expect(page.locator("#favSaveText")).toHaveText("Notre Dame · Stufe 42 gemerkt");
  await expect(favEntries(page).first()).toHaveAttribute("aria-current", "true");
  await expect(page.locator(".fav-go").first()).toHaveText("Notre Dame 42");

  // Woanders hin, dann ueber den Favoriten zurueck
  await page.selectOption("#building", "Colosseum");
  await page.fill("#level", "7");
  await page.locator("#level").blur();
  await expect(page.locator("#favSaveText")).toHaveText("Kolosseum · Stufe 7 merken");
  await expect(favEntries(page).first()).not.toHaveAttribute("aria-current", "true");

  await page.locator(".fav-go").first().click();
  await expect(page.locator("#building")).toHaveValue("Notre_Dame");
  await expect(page.locator("#level")).toHaveValue("42");
  await expect(page.locator("#favSaveText")).toHaveText("Notre Dame · Stufe 42 gemerkt");
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
  await expect(page.locator("#favs")).toBeHidden();
  await expect(page.locator("#favSaveText")).toHaveText("Die Arche · Stufe 10 merken");
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

test.describe("Platzierung", () => {
  test("der Streifen steht vor allem anderen im Bauwerk-Panel", async ({ page }) => {
    await page.click("#favSave");

    const [favs, select, panel] = await Promise.all([
      page.locator("#favs").boundingBox(),
      page.locator("#building").boundingBox(),
      page.locator(".panel").first().boundingBox()
    ]);

    // Frueher stand die Liste ganz unten im Panel, hinter Suche, Stufe,
    // Name und Faktor. Jetzt ist sie das Erste, was darin steht.
    expect(favs.y).toBeLessThan(select.y);
    expect(favs.y).toBeGreaterThan(panel.y);
  });

  test("auf dem Telefon ist der Streifen ohne Scrollen zu sehen", async ({ page, isMobile }) => {
    test.skip(!isMobile, "Die Aussage gilt fuer den schmalen Bildschirm");
    // Nicht die vollen 851px des Pixel 5: mit Adress- und Systemleiste
    // bleiben real rund 600px sichtbar. Bei dieser Hoehe trennt der Test
    // auch wirklich — am alten Platz am Panelende endete der Streifen bei
    // 681px und lag damit unter der Falz.
    await page.setViewportSize({ width: 393, height: 600 });
    await page.goto("/index.html");
    await page.click("#favSave");

    const box = await page.locator("#favs").boundingBox();
    expect(box.y + box.height).toBeLessThan(600);
  });

  test("der Knopf steht bei dem, was er merkt", async ({ page }) => {
    const [level, save, factor] = await Promise.all([
      page.locator("#level").boundingBox(),
      page.locator("#favSave").boundingBox(),
      page.locator("#factor").boundingBox()
    ]);

    // Zwischen Stufe und Faktor: gemerkt werden Bauwerk und Stufe, nicht
    // der Arche-Bonus.
    expect(save.y).toBeGreaterThan(level.y);
    expect(save.y).toBeLessThan(factor.y);
  });

  test("gemerkte Einträge sehen nicht aus wie die Faktor-Chips", async ({ page }) => {
    await page.click("#favSave");

    const [entry, chip] = await Promise.all([
      page.locator("#favList li").first().evaluate((el) => getComputedStyle(el).backgroundColor),
      page.locator("#factorChips button:not(.on)").first()
        .evaluate((el) => getComputedStyle(el).backgroundColor)
    ]);

    // Die Faktor-Chips sind Einstellungen, die Einträge hier Sprungmarken.
    // Gleiche Optik hieße gleiche Bedeutung, darum ist einer gefüllt.
    expect(chip).toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
    expect(entry).not.toBe(chip);
  });
});
