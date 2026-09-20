/**
 * Browsertests fuer Darstellung und Bedienung — die Zustaende, die beim
 * ersten Bauen ungeprueft geblieben waren: schmale Geraete, volle
 * Favoritenliste, der Leerzustand ohne Daten.
 */
const { test, expect } = require("@playwright/test");

/** Zwoelf Favoriten, also die volle Liste. */
const FULL_LIST = [
  ["The_Arc", 80], ["Notre_Dame", 55], ["Lotus_Temple", 37], ["Alcatraz", 120],
  ["Saturn_VI_Gate_CENTAURUS", 44], ["Lighthouse_of_Alexandria", 61],
  ["Arctic_Orangery", 90], ["Saint_Basil's_Cathedral", 33], ["Cape_Canaveral", 70],
  ["Innovation_Tower", 52], ["Frauenkirche_of_Dresden", 28], ["The_Blue_Galaxy", 66]
].map(([id, level]) => ({ id, level }));

async function seedFavorites(page, favorites) {
  await page.goto("/index.html");
  await page.evaluate((list) => localStorage.setItem("cipher:favorites", JSON.stringify(list)), favorites);
  await page.reload();
}

test.describe("schmale Geräte", () => {
  for (const width of [320, 360, 390]) {
    test(`bei ${width}px bleibt die Stufenzahl lesbar`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/index.html");
      // Dreistellig ist der enge Fall.
      await page.selectOption("#building", "Alcatraz");
      await page.fill("#level", "120");
      await page.locator("#level").blur();

      const room = await page.locator("#level").evaluate((el) => {
        const style = getComputedStyle(el);
        const inner = el.getBoundingClientRect().width
          - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
          - parseFloat(style.borderLeftWidth) - parseFloat(style.borderRightWidth);
        return { inner, clipped: el.scrollWidth > el.clientWidth + 1 };
      });

      expect(room.clipped, "die Stufenzahl darf nicht abgeschnitten sein").toBe(false);
      expect(room.inner).toBeGreaterThan(40);
    });
  }

  test("bei 320px entsteht kein waagerechtes Scrollen", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto("/index.html");
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe("Leerzustand", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/index.html");
    await page.selectOption("#building", "Shattered_Horizon_Siphon");
    await page.fill("#level", "20");
    await page.locator("#level").blur();
    await expect(page.locator("td.empty")).toBeVisible();
  });

  test("die Legende verschwindet mit dem Balken", async ({ page }) => {
    // Ohne .legend[hidden] schlug das display:flex das display:none des
    // Browsers — eine Farblegende ohne Balken blieb stehen.
    await expect(page.locator("#bar")).toBeHidden();
    await expect(page.locator("#legend")).toBeHidden();
  });

  test("die Kopierknöpfe sind ausgeschaltet, solange nichts dasteht", async ({ page }) => {
    await expect(page.locator('[data-copy="chatPlain"]')).toBeDisabled();
    await expect(page.locator('[data-copy="chatPoints"]')).toBeDisabled();
  });

  test("sie schalten sich wieder ein, sobald ein Plan da ist", async ({ page }) => {
    await page.fill("#inputTotal", "2500");
    await page.fill("#inputP1", "300");
    await page.click("#applyInput");

    await expect(page.locator("#legend")).toBeVisible();
    await expect(page.locator('[data-copy="chatPlain"]')).toBeEnabled();
    await expect(page.locator('[data-copy="chatPoints"]')).toBeEnabled();
  });
});

test.describe("Favoritenliste", () => {
  test("zwölf Einträge blähen das Panel nicht auf", async ({ page }) => {
    await page.setViewportSize({ width: 430, height: 900 });

    await page.goto("/index.html");
    const emptyHeight = await page.locator(".panel").first().evaluate((el) => el.offsetHeight);

    await seedFavorites(page, FULL_LIST);
    const fullHeight = await page.locator(".panel").first().evaluate((el) => el.offsetHeight);

    await expect(page.locator("#favList li")).toHaveCount(12);
    // Drei Reihen plus Abstände, nicht sechs.
    expect(fullHeight - emptyHeight).toBeLessThan(140);

    const scrollable = await page.locator("#favList").evaluate((el) => el.scrollHeight > el.clientHeight + 1);
    expect(scrollable, "die Liste muss scrollbar sein").toBe(true);
  });

  test("der aktive Favorit wird in den sichtbaren Bereich geholt", async ({ page }) => {
    await page.setViewportSize({ width: 430, height: 900 });
    await seedFavorites(page, FULL_LIST);

    // Der letzte Eintrag liegt unterhalb der drei sichtbaren Reihen.
    const last = FULL_LIST[FULL_LIST.length - 1];
    await page.selectOption("#building", last.id);
    await page.fill("#level", String(last.level));
    await page.locator("#level").blur();

    const visible = await page.locator("#favList").evaluate((list) => {
      const entry = list.querySelector('li[aria-current="true"]');
      if (!entry) return null;
      const top = entry.offsetTop - list.offsetTop;
      return top >= list.scrollTop - 1 && top + entry.offsetHeight <= list.scrollTop + list.clientHeight + 1;
    });
    expect(visible, "der aktive Eintrag muss sichtbar sein").toBe(true);
  });
});

test.describe("Stufenfeld", () => {
  test("der Wert ist beim Fokussieren markiert", async ({ page }) => {
    await page.goto("/index.html");
    await page.fill("#level", "10");
    await page.locator("#level").blur();

    await page.locator("#level").focus();
    // Markiert ersetzt die erste Ziffer den alten Wert, statt ihn zu ergänzen.
    await page.keyboard.type("80");
    await page.locator("#level").blur();
    await expect(page.locator("#level")).toHaveValue("80");
  });
});

test.describe("Bauwerkssuche", () => {
  test.beforeEach(async ({ page }) => await page.goto("/index.html"));

  const optionCount = (page) => page.locator("#building option").count();
  const optionTexts = (page) => page.locator("#building option").allTextContents();

  // Das gewählte Bauwerk bleibt immer in der Liste, auch wenn die Suche es
  // nicht trifft — sonst zeigte das Feld etwas anderes an als der Plan.
  // Die Zählung darunter nennt trotzdem nur die echten Treffer.

  test("ohne Suche stehen alle Bauwerke zur Wahl", async ({ page }) => {
    expect(await optionCount(page)).toBe(49);
    await expect(page.locator("#filterCount")).toHaveText("");
    await expect(page.locator("#filterClear")).toBeHidden();
  });

  test("ein Name schränkt die Liste ein", async ({ page }) => {
    // Beim Start ist "Die Arche" gewählt und zugleich der einzige Treffer.
    await page.fill("#buildingFilter", "arche");
    await expect(page.locator("#filterCount")).toHaveText("1 Bauwerk gefunden.");
    expect(await optionCount(page)).toBe(1);
    await expect(page.locator("#building option")).toHaveText(["Die Arche"]);
  });

  test("ein Zeitalter findet alle seine Bauwerke", async ({ page }) => {
    await page.fill("#buildingFilter", "titan");
    await expect(page.locator("#filterCount")).toHaveText("3 Bauwerke gefunden.");

    const texts = await optionTexts(page);
    for (const gate of ["Saturn VI Tor PEGASUS", "Saturn VI Tor CENTAURUS", "Saturn VI Tor HYDRA"]) {
      expect(texts).toContain(gate);
    }
    expect(texts).not.toContain("Kolosseum");
  });

  test("die Suche ignoriert Groß- und Kleinschreibung sowie Umlaute", async ({ page }) => {
    await page.fill("#buildingFilter", "TURM ZU BABEL");
    await expect(page.locator("#filterCount")).toHaveText("1 Bauwerk gefunden.");
    expect(await optionTexts(page)).toContain("Turm zu Babel");

    await page.fill("#buildingFilter", "arktische");
    const lower = await page.locator("#filterCount").textContent();
    await page.fill("#buildingFilter", "Arktische");
    await expect(page.locator("#filterCount")).toHaveText(lower);
    expect(lower).toMatch(/^3 Bauwerke/);
  });

  test("auch der Kurzname trifft", async ({ page }) => {
    // "Leuchtturm" ist der Kurzname, der volle Name lautet anders.
    await page.fill("#buildingFilter", "leuchtturm");
    await expect(page.locator("#filterCount")).toHaveText("1 Bauwerk gefunden.");
    expect(await optionTexts(page)).toContain("Leuchtturm von Alexandria");
  });

  test("das gewählte Bauwerk bleibt wählbar, auch wenn die Suche es nicht trifft", async ({ page }) => {
    await page.selectOption("#building", "Colosseum");
    await page.fill("#buildingFilter", "arche");

    await expect(page.locator("#filterCount")).toHaveText("1 Bauwerk gefunden.");
    const texts = await optionTexts(page);
    expect(texts).toContain("Die Arche");
    expect(texts).toContain("Kolosseum");
    await expect(page.locator("#building")).toHaveValue("Colosseum");
  });

  test("ohne Treffer sagt die Suche das", async ({ page }) => {
    await page.selectOption("#building", "Colosseum");
    await page.fill("#buildingFilter", "gibtesnicht");
    await expect(page.locator("#filterCount")).toHaveText("Kein Bauwerk gefunden.");
    // Die aktuelle Wahl bleibt trotzdem stehen, sonst zeigte das Feld
    // etwas anderes an als der Plan darunter.
    await expect(page.locator("#building")).toHaveValue("Colosseum");
    await expect(page.locator("#rows tr")).toHaveCount(5);
  });

  test("das Kreuz und Escape setzen die Suche zurück", async ({ page }) => {
    await page.fill("#buildingFilter", "arche");
    await expect(page.locator("#filterClear")).toBeVisible();
    await page.click("#filterClear");
    await expect(page.locator("#buildingFilter")).toHaveValue("");
    expect(await optionCount(page)).toBe(49);

    await page.fill("#buildingFilter", "arche");
    await page.locator("#buildingFilter").press("Escape");
    await expect(page.locator("#buildingFilter")).toHaveValue("");
    expect(await optionCount(page)).toBe(49);
  });

  test("ein Favorit springt auch zu einem ausgefilterten Bauwerk", async ({ page }) => {
    await seedFavorites(page, [{ id: "Saint_Basil's_Cathedral", level: 33 }]);
    // Ein Apostroph in der ID — genau der Fall, der einen Attributselektor
    // zerlegen kann.
    await page.fill("#buildingFilter", "arche");
    await expect(page.locator("#building")).toHaveValue("The_Arc");

    await page.locator(".fav-go").first().click();
    await expect(page.locator("#building")).toHaveValue("Saint_Basil's_Cathedral");
    await expect(page.locator("#level")).toHaveValue("33");
    await expect(page.locator("#rows tr")).toHaveCount(5);
  });

  test("die Suche bleibt für die Tastatur erreichbar", async ({ page }) => {
    await page.locator("#buildingFilter").focus();
    await expect(page.locator("#buildingFilter")).toBeFocused();
    const label = await page.locator('label[for="buildingFilter"]').textContent();
    expect(label.trim()).toBe("Bauwerke durchsuchen");
  });
});

test.describe("Farbhierarchie", () => {
  test("der Favoriten-Knopf überstrahlt den aktiven Faktor-Chip nicht", async ({ page }) => {
    await page.goto("/index.html");
    await page.click("#favSave");
    await expect(page.locator("#favSave")).toHaveAttribute("aria-pressed", "true");

    const [chip, save] = await Promise.all([
      page.locator("#factorChips button.on").evaluate((el) => getComputedStyle(el).backgroundColor),
      page.locator("#favSave").evaluate((el) => getComputedStyle(el).backgroundColor)
    ]);

    // Der Chip ist gefüllt, der Knopf nur umrandet.
    expect(chip).not.toBe(save);
    expect(save).toMatch(/rgba\(0, 0, 0, 0\)|transparent/);

    // Der Stern zeigt den Zustand stattdessen über seine Füllung.
    const starFill = await page.locator("#favSave svg").evaluate((el) => getComputedStyle(el).fill);
    expect(starFill).not.toBe("none");
  });
});
