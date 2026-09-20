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

  test("die Legende bleibt bei 320px auf einer Zeile", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto("/index.html");

    const rows = await page.locator("#legend").evaluate((legend) => {
      const tops = [...legend.children].map((item) => Math.round(item.getBoundingClientRect().top));
      return new Set(tops).size;
    });
    // Vorher rutschte "P4-P5" allein auf eine zweite Zeile.
    expect(rows).toBe(1);
  });

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

  const hits = (page) => page.locator(".filter-hit b");

  // Die Suche schränkt das Auswahlfeld nicht ein, sondern zeigt ihre Treffer
  // als eigene Liste darunter. Dadurch enthält das Auswahlfeld immer alle
  // Bauwerke und immer das wirklich gewählte, und die Trefferzahl stimmt mit
  // dem überein, was man sieht.

  test("ohne Suche steht nur das vollständige Auswahlfeld da", async ({ page }) => {
    expect(await page.locator("#building option").count()).toBe(49);
    await expect(page.locator("#filterCount")).toHaveText("");
    await expect(page.locator("#filterResults")).toBeHidden();
    await expect(page.locator("#filterClear")).toBeHidden();
  });

  test("Namenstreffer stehen vor Zeitalter-Treffern", async ({ page }) => {
    // Der gemeldete Fall: in "Markusdom" steht kein "ho", er passt nur über
    // sein Zeitalter. Vorher stand der eigentlich gemeinte Namenstreffer
    // deshalb ganz unten.
    await page.fill("#buildingFilter", "Ho");

    await expect(page.locator("#filterCount")).toHaveText("3 Bauwerke gefunden.");
    await expect(hits(page)).toHaveText(["Horizontriss-Siphon", "Markusdom", "Notre Dame"]);
  });

  test("die Hervorhebung zeigt, ob Name oder Zeitalter getroffen hat", async ({ page }) => {
    await page.fill("#buildingFilter", "Ho");

    const rows = page.locator(".filter-hit");
    // Erster Treffer: im Namen.
    await expect(rows.nth(0).locator("b mark")).toHaveText("Ho");
    await expect(rows.nth(0).locator("span mark")).toHaveCount(0);

    // Die beiden anderen: im Zeitalter — sichtbar, warum sie dastehen.
    for (const index of [1, 2]) {
      await expect(rows.nth(index).locator("span mark")).toHaveText("Ho");
      await expect(rows.nth(index).locator("b mark")).toHaveCount(0);
    }
  });

  test("die Trefferzahl stimmt mit den angezeigten Treffern überein", async ({ page }) => {
    await page.selectOption("#building", "Saturn_VI_Gate_PEGASUS");
    await page.fill("#buildingFilter", "Ho");

    await expect(page.locator("#filterCount")).toHaveText("3 Bauwerke gefunden.");
    await expect(hits(page)).toHaveCount(3);
    // Das gewählte Bauwerk taucht nicht als vierter Treffer auf.
    await expect(hits(page)).not.toContainText(["Saturn VI Tor PEGASUS"]);
  });

  test("das Auswahlfeld bleibt vollständig und behält seine Wahl", async ({ page }) => {
    await page.selectOption("#building", "Colosseum");
    await page.fill("#buildingFilter", "arche");

    expect(await page.locator("#building option").count()).toBe(49);
    await expect(page.locator("#building")).toHaveValue("Colosseum");
    await expect(page.locator("#rows tr")).toHaveCount(5);
  });

  test("ein Klick auf einen Treffer wählt das Bauwerk und schließt die Suche", async ({ page }) => {
    await page.fill("#buildingFilter", "notre");
    await page.locator(".filter-hit").first().click();

    await expect(page.locator("#building")).toHaveValue("Notre_Dame");
    await expect(page.locator("#buildingFilter")).toHaveValue("");
    await expect(page.locator("#filterResults")).toBeHidden();
    await expect(page.locator("#rows tr")).toHaveCount(5);
  });

  test("nichts wechselt das Bauwerk ohne Klick", async ({ page }) => {
    await page.selectOption("#building", "Colosseum");
    for (const query of ["a", "ar", "arc", "arch", "arche"]) {
      await page.fill("#buildingFilter", query);
      await expect(page.locator("#building")).toHaveValue("Colosseum");
    }
    await page.fill("#buildingFilter", "");
    await expect(page.locator("#building")).toHaveValue("Colosseum");
  });

  test("Enter nimmt den ersten Treffer", async ({ page }) => {
    await page.fill("#buildingFilter", "turm zu babel");
    await page.locator("#buildingFilter").press("Enter");
    await expect(page.locator("#building")).toHaveValue("Tower_of_Babel");
    await expect(page.locator("#buildingFilter")).toHaveValue("");
  });

  test("jeder Treffer nennt sein Zeitalter", async ({ page }) => {
    await page.fill("#buildingFilter", "titan");
    await expect(page.locator(".filter-hit span")).toHaveText(["Titan", "Titan", "Titan"]);
  });

  test("ein Namenstreffer wird im Namen hervorgehoben", async ({ page }) => {
    await page.fill("#buildingFilter", "leuchtturm");
    await expect(page.locator(".filter-hit b mark")).toHaveText("Leuchtturm");
  });

  test("ein Zeitalter findet alle seine Bauwerke", async ({ page }) => {
    await page.fill("#buildingFilter", "titan");
    await expect(page.locator("#filterCount")).toHaveText("3 Bauwerke gefunden.");
    await expect(hits(page)).toHaveText([
      "Saturn VI Tor PEGASUS", "Saturn VI Tor CENTAURUS", "Saturn VI Tor HYDRA"
    ]);
  });

  test("die Suche ignoriert Groß- und Kleinschreibung sowie Umlaute", async ({ page }) => {
    await page.fill("#buildingFilter", "TURM ZU BABEL");
    await expect(hits(page)).toHaveText(["Turm zu Babel"]);

    await page.fill("#buildingFilter", "arktische");
    const lower = await page.locator("#filterCount").textContent();
    await page.fill("#buildingFilter", "Arktische");
    await expect(page.locator("#filterCount")).toHaveText(lower);
    expect(lower).toMatch(/^3 Bauwerke/);
  });

  test("auch der Kurzname trifft", async ({ page }) => {
    // "Leuchtturm" ist der Kurzname, der volle Name lautet anders.
    await page.fill("#buildingFilter", "leuchtturm");
    await expect(hits(page)).toHaveText(["Leuchtturm von Alexandria"]);
  });

  test("ohne Treffer sagt die Suche das und zeigt nichts an", async ({ page }) => {
    await page.fill("#buildingFilter", "gibtesnicht");
    await expect(page.locator("#filterCount")).toHaveText("Kein Bauwerk gefunden.");
    await expect(page.locator("#filterResults")).toBeHidden();
    await expect(page.locator("#rows tr")).toHaveCount(5);
  });

  test("der aktuell gewählte Treffer ist als solcher erkennbar", async ({ page }) => {
    await page.fill("#buildingFilter", "arche");
    await expect(page.locator(".filter-hit").first()).toHaveAttribute("aria-current", "true");

    await page.selectOption("#building", "Colosseum");
    await page.fill("#buildingFilter", "arche");
    await expect(page.locator(".filter-hit").first()).not.toHaveAttribute("aria-current", "true");
  });

  test("das Kreuz und Escape setzen die Suche zurück", async ({ page }) => {
    await page.fill("#buildingFilter", "arche");
    await expect(page.locator("#filterClear")).toBeVisible();
    await page.click("#filterClear");
    await expect(page.locator("#buildingFilter")).toHaveValue("");
    await expect(page.locator("#filterResults")).toBeHidden();

    await page.fill("#buildingFilter", "arche");
    await page.locator("#buildingFilter").press("Escape");
    await expect(page.locator("#buildingFilter")).toHaveValue("");
    await expect(page.locator("#filterResults")).toBeHidden();
  });

  test("ein Bauwerk mit Apostroph im Schlüssel lässt sich wählen", async ({ page }) => {
    await page.fill("#buildingFilter", "basilius");
    await page.locator(".filter-hit").first().click();
    await expect(page.locator("#building")).toHaveValue("Saint_Basil's_Cathedral");
  });

  test("die Hervorhebung sitzt auch bei Zeichen richtig, die beim Falten wachsen", async ({ page }) => {
    // "ß" wird beim Vergleich zu "ss" — aus einem Zeichen werden zwei, die
    // Stellen verschieben sich also gegeneinander. Im echten Datensatz gibt
    // es kein "ß", darum hier ein eigener.
    await page.route("**/data.js", (route) => route.fulfill({
      contentType: "text/javascript; charset=utf-8",
      body: `window.CIPHER_DATA = {
        generated: "2026-09-19",
        buildings: [
          { id: "Grosse_Strasse", name: "Große Straße", short: "Straße", era: "Bronzezeit",
            base: 400, maxLevel: 50, curve: "Bronzezeit", costs: [10,20,30,40,50,60,70,80,90,100] }
        ],
        curves: { "Bronzezeit": {
          p1: Array.from({ length: 50 }, (_, i) => (i + 1) * 5),
          source: "w".repeat(50)
        } }
      };`
    }));
    await page.goto("/index.html");

    // Der Treffer steht hinter dem "ß" — säße die Zuordnung daneben, wäre
    // die Markierung verschoben.
    await page.fill("#buildingFilter", "strasse");
    await expect(page.locator(".filter-hit mark")).toHaveText("Straße");

    await page.fill("#buildingFilter", "große");
    await expect(page.locator(".filter-hit mark")).toHaveText("Große");
  });

  test("die Suche bleibt für die Tastatur erreichbar", async ({ page }) => {
    await page.locator("#buildingFilter").focus();
    await expect(page.locator("#buildingFilter")).toBeFocused();
    const label = await page.locator('label[for="buildingFilter"]').textContent();
    expect(label.trim()).toBe("Bauwerke durchsuchen");
  });

  test("viele Treffer blähen das Panel nicht auf", async ({ page }) => {
    await page.setViewportSize({ width: 430, height: 900 });
    await page.goto("/index.html");
    const before = await page.locator(".panel").first().evaluate((el) => el.offsetHeight);

    await page.fill("#buildingFilter", "e"); // trifft fast alles
    const after = await page.locator(".panel").first().evaluate((el) => el.offsetHeight);
    const found = await hits(page).count();
    expect(found).toBeGreaterThan(20);

    // Vier Reihen sichtbar plus Trefferzeile, der Rest scrollt. Ungedeckelt
    // wären es bei ~37px je Eintrag über 1700px.
    expect(after - before).toBeLessThan(200);
    expect(after - before).toBeLessThan(found * 37 / 4);
    const scrollable = await page.locator("#filterResults")
      .evaluate((el) => el.scrollHeight > el.clientHeight + 1);
    expect(scrollable).toBe(true);
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
