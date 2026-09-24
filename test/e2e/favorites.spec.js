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
  await page.locator("#building").selectOption("Notre_Dame", { force: true });
  await page.fill("#level", "42");
  await page.locator("#level").blur();
  await page.click("#favSave");

  await expect(favEntries(page)).toHaveCount(1);
  await expect(page.locator("#favs")).toBeVisible();
  await expect(page.locator("#favSaveText")).toHaveText("Notre Dame · Stufe 42 gemerkt");
  await expect(favEntries(page).first()).toHaveAttribute("aria-current", "true");
  await expect(page.locator(".fav-go").first()).toHaveText("Notre Dame 42");

  // Woanders hin, dann ueber den Favoriten zurueck
  await page.locator("#building").selectOption("Colosseum", { force: true });
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
    await page.locator("#building").selectOption(id, { force: true });
    await page.fill("#level", level);
    await page.locator("#level").blur();
    await page.click("#favSave");
  }

  await expect(favEntries(page)).toHaveCount(3);
  await expect(page.locator(".fav-go")).toHaveText(["Die Arche 80", "Kolosseum 12", "Notre Dame 42"]);
});

test("jedes Bauwerk steht nur einmal in der Liste, seine Stufe wandert mit", async ({ page }) => {
  // Vorher war jede Stufe ein eigener Eintrag: wer sein Bauwerk eine Stufe
  // weiterzog, musste neu merken und hatte es danach doppelt.
  await page.fill("#level", "10");
  await page.locator("#level").blur();
  await page.click("#favSave");
  await expect(page.locator(".fav-go")).toHaveText(["Die Arche 10"]);

  await page.click("#levelUp");
  await page.click("#levelUp");
  await expect(favEntries(page)).toHaveCount(1);
  await expect(page.locator(".fav-go")).toHaveText(["Die Arche 12"]);
  await expect(page.locator("#favSaveText")).toHaveText("Die Arche · Stufe 12 gemerkt");

  await page.fill("#level", "80");
  await page.locator("#level").blur();
  await expect(page.locator(".fav-go")).toHaveText(["Die Arche 80"]);
  await expect(favEntries(page).first()).toHaveAttribute("aria-current", "true");

  // Die mitgefuehrte Stufe ist gespeichert, nicht nur angezeigt.
  await page.reload();
  await expect(page.locator(".fav-go")).toHaveText(["Die Arche 80"]);
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
  await page.locator("#building").selectOption("Colosseum", { force: true });
  await page.click("#favSave");
  await expect(favEntries(page)).toHaveCount(2);

  await page.locator(".fav-del").first().click();
  await expect(favEntries(page)).toHaveCount(1);
  await expect(page.locator(".fav-go")).toHaveText(["Die Arche 10"]);
});

test("Favoriten ueberleben einen Neuladen", async ({ page }) => {
  await page.locator("#building").selectOption("Notre_Dame", { force: true });
  await page.fill("#level", "42");
  await page.locator("#level").blur();
  await page.click("#favSave");

  await page.reload();
  await expect(favEntries(page)).toHaveCount(1);
  await expect(page.locator(".fav-go").first()).toHaveText("Notre Dame 42");
});

test("die Liste wird bei zwoelf Eintraegen gedeckelt", async ({ page }) => {
  const ids = await page.locator("#building option").evaluateAll((options) =>
    options.slice(0, 14).map((option) => option.value));
  for (const id of ids) {
    await page.locator("#building").selectOption(id, { force: true });
    await page.click("#favSave");
  }
  await expect(favEntries(page)).toHaveCount(12);
  // Der neueste steht vorne, die zwei aeltesten sind herausgefallen
  const shown = await page.locator(".fav-go").evaluateAll((buttons) => buttons.map((b) => b.textContent));
  const names = await page.locator("#building option").evaluateAll((options) =>
    Object.fromEntries(options.map((o) => [o.value, o.textContent])));
  expect(shown[0]).toContain(names[ids[13]].split(" ")[0].slice(0, 4));
  await expect(page.locator(".fav-go").filter({ hasText: names[ids[0]] })).toHaveCount(0);
  await expect(page.locator(".fav-go").filter({ hasText: names[ids[1]] })).toHaveCount(0);
});

test("kaputte Favoriten im Speicher werden verworfen", async ({ page }) => {
  await page.evaluate(() => {
    localStorage.setItem("cipher:favorites", JSON.stringify([
      { id: "Notre_Dame", level: 42 },     // gut
      { id: "Gibt_Es_Nicht", level: 5 },   // unbekanntes Bauwerk
      { id: "Notre_Dame", level: 9999 },   // ueber dem Maximum
      { id: "Notre_Dame", level: 42 },     // Dublette
      { id: "Notre_Dame", level: 30 },     // dasselbe Bauwerk, andere Stufe (alter Stand)
      null                                  // Schrott
    ]));
  });
  await page.reload();
  // Ein Eintrag je Bauwerk; von mehreren bleibt der vorderste.
  await expect(favEntries(page)).toHaveCount(1);
  await expect(page.locator(".fav-go").first()).toHaveText("Notre Dame 42");
});

test.describe("Platzierung", () => {
  test("der Streifen steht vor allem anderen im Bauwerk-Panel", async ({ page }) => {
    await page.click("#favSave");

    const [favs, select, panel] = await Promise.all([
      page.locator("#favs").boundingBox(),
      page.locator("#buildingPick").boundingBox(),
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

test.describe("Zuletzt benutzt zuerst", () => {
  // Vorher war die Liste "zuletzt gemerkt zuerst". Direkt nach dem Merken
  // stand der neue Eintrag vorn und war aktiv — das Auge lernte daraus
  // "erster Chip = das Aktive", und beim ersten Antippen eines aelteren
  // Eintrags brach die Regel. Jetzt gilt sie immer, wenn man die Liste
  // selbst angefasst hat.
  const seed = async (page) => {
    for (const [id, level] of [["Notre_Dame", "42"], ["Colosseum", "12"], ["The_Arc", "80"]]) {
      await page.locator("#building").selectOption(id, { force: true });
      await page.fill("#level", level);
      await page.locator("#level").blur();
      await page.click("#favSave");
    }
    await expect(page.locator(".fav-go")).toHaveText(["Die Arche 80", "Kolosseum 12", "Notre Dame 42"]);
  };

  test("ein angetippter Eintrag rueckt nach vorn und ist dort der aktive", async ({ page }) => {
    await seed(page);

    await page.locator(".fav-go", { hasText: "Notre Dame 42" }).click();

    await expect(page.locator(".fav-go")).toHaveText(["Notre Dame 42", "Die Arche 80", "Kolosseum 12"]);
    await expect(favEntries(page).first()).toHaveAttribute("aria-current", "true");
    await expect(page.locator("#building")).toHaveValue("Notre_Dame");
    await expect(page.locator("#level")).toHaveValue("42");
  });

  test("die uebrigen behalten ihre Reihenfolge, es bewegt sich nur der eine", async ({ page }) => {
    await seed(page);
    await page.locator(".fav-go", { hasText: "Kolosseum 12" }).click();
    // Kolosseum nach vorn, Arche und Notre Dame ruecken um genau einen Platz.
    await expect(page.locator(".fav-go")).toHaveText(["Kolosseum 12", "Die Arche 80", "Notre Dame 42"]);
  });

  test("die neue Reihenfolge ueberlebt einen Neuladen", async ({ page }) => {
    await seed(page);
    await page.locator(".fav-go", { hasText: "Notre Dame 42" }).click();

    await page.reload();
    await expect(page.locator(".fav-go")).toHaveText(["Notre Dame 42", "Die Arche 80", "Kolosseum 12"]);
    await expect(favEntries(page).first()).toHaveAttribute("aria-current", "true");
  });

  test("die Stufe zu aendern haelt den Eintrag aktuell, bewegt die Liste aber nicht", async ({ page }) => {
    await seed(page);
    await page.locator(".fav-go", { hasText: "Kolosseum 12" }).click();
    await page.locator("#building").selectOption("Notre_Dame", { force: true }); // Notre Dame ist Eintrag 3
    await expect(favEntries(page).nth(2)).toHaveAttribute("aria-current", "true");

    // Stufe weiterziehen: der Eintrag wandert mit, bleibt aber wo er ist.
    await page.click("#levelUp");
    await expect(page.locator(".fav-go")).toHaveText(["Kolosseum 12", "Die Arche 80", "Notre Dame 43"]);
    await expect(favEntries(page).nth(2)).toHaveAttribute("aria-current", "true");
  });

  test("den ersten Eintrag anzutippen aendert nichts an der Reihenfolge", async ({ page }) => {
    await seed(page);
    await page.locator("#building").selectOption("Hagia_Sophia", { force: true }); // woanders hin
    await page.locator(".fav-go", { hasText: "Die Arche 80" }).click();
    await expect(page.locator(".fav-go")).toHaveText(["Die Arche 80", "Kolosseum 12", "Notre Dame 42"]);
    await expect(favEntries(page).first()).toHaveAttribute("aria-current", "true");
  });
});

test.describe("Ein Bauwerk, eine Stufe", () => {
  const seed = async (page) => {
    for (const [id, level] of [["Notre_Dame", "42"], ["The_Arc", "81"]]) {
      await page.locator("#building").selectOption(id, { force: true });
      await page.fill("#level", level);
      await page.locator("#level").blur();
      await page.click("#favSave");
    }
    await expect(page.locator(".fav-go")).toHaveText(["Die Arche 81", "Notre Dame 42"]);
  };

  test("der Wechsel per Auswahlfeld auf ein gemerktes Bauwerk laedt dessen Stufe", async ({ page }) => {
    await seed(page);
    await expect(page.locator("#level")).toHaveValue("81");

    await page.locator("#building").selectOption("Notre_Dame", { force: true });
    await expect(page.locator("#level")).toHaveValue("42");
    // Und Notre Dames Eintrag ist unveraendert — die 81 der Arche kam nicht mit.
    await expect(page.locator(".fav-go")).toHaveText(["Die Arche 81", "Notre Dame 42"]);
  });

  test("der Wechsel per Suche laedt die Stufe ebenso", async ({ page }) => {
    await seed(page);
    await page.fill("#buildingFilter", "notre");
    await page.keyboard.press("Enter");
    await expect(page.locator("#building")).toHaveValue("Notre_Dame");
    await expect(page.locator("#level")).toHaveValue("42");
    await expect(page.locator(".fav-go")).toHaveText(["Die Arche 81", "Notre Dame 42"]);
  });

  test("ein nicht gemerktes Bauwerk behaelt die mitgebrachte Stufe", async ({ page }) => {
    await seed(page);
    await page.locator("#building").selectOption("Colosseum", { force: true }); // nicht gemerkt
    await expect(page.locator("#level")).toHaveValue("81");
    await expect(page.locator("#favSaveText")).toHaveText("Kolosseum · Stufe 81 merken");
  });

  test("Merken auf einem gemerkten Bauwerk entfernt es, statt es doppelt anzulegen", async ({ page }) => {
    await seed(page);
    await page.click("#levelUp"); // Arche auf 82, Eintrag wandert mit
    await expect(page.locator(".fav-go")).toHaveText(["Die Arche 82", "Notre Dame 42"]);

    await page.click("#favSave");
    await expect(page.locator(".fav-go")).toHaveText(["Notre Dame 42"]);
    await expect(page.locator("#favSaveText")).toHaveText("Die Arche · Stufe 82 merken");
  });

  test("die Lesart der Stufe aendert am Mitfuehren nichts", async ({ page }) => {
    await seed(page);
    await page.locator('#levelMode button[data-level-mode="current"]').click();
    await expect(page.locator("#level")).toHaveValue("80");
    await page.click("#levelUp");
    // Angezeigt 81, gerechnet 82 — der Chip zeigt die Lesart, gespeichert ist die gerechnete Stufe.
    await expect(page.locator(".fav-go").first()).toHaveText("Die Arche 81");
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("cipher:favorites"))[0].level);
    expect(stored).toBe(82);
  });
});
