/**
 * Browsertests fuer die eigene Bauwerksauswahl (#picker).
 *
 * Sie ersetzt die native Liste des Browsers. Was ein <select> von Haus aus
 * kann, muss sie selbst koennen — genau das halten diese Tests fest:
 * Tastatur, Esc, Zurueck-Geste, Fokus, gesperrter Hintergrund.
 */
const { test, expect } = require("@playwright/test");

const dialog = (page) => page.locator("#picker");
const options = (page) => page.locator("#pickerList [role=option]");

test.beforeEach(async ({ page }) => {
  await page.goto("/index.html");
  await page.locator("#building").selectOption("Notre_Dame", { force: true });
});

test.describe("Knopf", () => {
  test("zeigt Name und Zeitalter des gewählten Bauwerks", async ({ page }) => {
    await expect(page.locator("#buildingPickName")).toHaveText("Notre Dame");
    await expect(page.locator("#buildingPickEra")).toHaveText("Hochmittelalter");
  });

  test("ist beschriftet und meldet, dass er ein Fenster öffnet", async ({ page }) => {
    const pick = page.locator("#buildingPick");
    await expect(pick).toHaveAccessibleName(/Legendäres Bauwerk/);
    await expect(pick).toHaveAttribute("aria-haspopup", "dialog");
    await expect(pick).toHaveAttribute("aria-expanded", "false");
  });

  test("das native Auswahlfeld ist unsichtbar und aus der Tab-Reihenfolge", async ({ page }) => {
    await expect(page.locator("#building")).toBeHidden();
    await expect(page.locator("#building")).toHaveAttribute("tabindex", "-1");
  });
});

test.describe("Öffnen", () => {
  test("zeigt alle Bauwerke, nach Zeitalter gruppiert", async ({ page }) => {
    await page.click("#buildingPick");
    await expect(dialog(page)).toBeVisible();
    await expect(page.locator("#buildingPick")).toHaveAttribute("aria-expanded", "true");
    await expect(options(page)).toHaveCount(49);
    const eras = await page.locator(".picker-era").allTextContents();
    expect(eras.length).toBeGreaterThan(5);
    expect(new Set(eras).size).toBe(eras.length);
  });

  test("das gewählte Bauwerk ist markiert und sichtbar", async ({ page }) => {
    await page.click("#buildingPick");
    const selected = page.locator('#pickerList [aria-selected="true"]');
    await expect(selected).toHaveCount(1);
    await expect(selected.locator("b")).toHaveText("Notre Dame");
    await expect(selected).toBeInViewport();
  });

  test("die Seite dahinter scrollt nicht mit", async ({ page }) => {
    await page.click("#buildingPick");
    await expect(page.locator("html")).toHaveClass(/picker-open/);
    const overflow = await page.evaluate(() => getComputedStyle(document.documentElement).overflow);
    expect(overflow).toBe("hidden");
  });

  test("mit der Maus geöffnet steht der Fokus im Suchfeld", async ({ page, isMobile }) => {
    test.skip(isMobile, "Auf dem Telefon wird getippt, nicht geklickt");
    await page.click("#buildingPick");
    await expect(page.locator("#pickerFilter")).toBeFocused();
  });

  test("mit dem Finger geöffnet steht der Fokus auf der Liste, die Tastatur bleibt zu", async ({ page, isMobile }) => {
    test.skip(!isMobile, "Nur Touch-Geräte");
    await page.tap("#buildingPick");
    await expect(page.locator("#pickerList")).toBeFocused();
  });

  test("Pfeil runter auf dem Knopf öffnet die Liste", async ({ page }) => {
    await page.locator("#buildingPick").focus();
    await page.keyboard.press("ArrowDown");
    await expect(dialog(page)).toBeVisible();
  });
});

test.describe("Wählen", () => {
  test("ein Tipp wählt, schließt und gibt den Fokus zurück", async ({ page }) => {
    await page.click("#buildingPick");
    await page.locator('#pickerList [role=option]', { hasText: "Kolosseum" }).click();

    await expect(dialog(page)).toBeHidden();
    await expect(page.locator("#building")).toHaveValue("Colosseum");
    await expect(page.locator("#buildingPickName")).toHaveText("Kolosseum");
    await expect(page.locator("#buildingPick")).toBeFocused();
    await expect(page.locator("#buildingPick")).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator("html")).not.toHaveClass(/picker-open/);
    await expect(page.locator("#rows tr")).toHaveCount(5);
  });

  test("die Wahl wird gespeichert", async ({ page }) => {
    await page.click("#buildingPick");
    await page.locator('#pickerList [role=option]', { hasText: "Kolosseum" }).click();
    await expect(dialog(page)).toBeHidden();
    await page.reload();
    await expect(page.locator("#buildingPickName")).toHaveText("Kolosseum");
  });

  test("der Verlauf ist danach so lang wie vorher", async ({ page }) => {
    const before = await page.evaluate(() => history.length);
    await page.click("#buildingPick");
    await page.locator('#pickerList [role=option]', { hasText: "Kolosseum" }).click();
    await expect(dialog(page)).toBeHidden();
    // Der eigene Eintrag wird wieder abgeraeumt — das naechste "zurueck"
    // fuehrt also dorthin, wo es ohne die Auswahl auch hingefuehrt haette.
    await page.waitForFunction(() => !history.state || !history.state.cipherPicker);
    expect(await page.evaluate(() => history.length)).toBeGreaterThanOrEqual(before);
    expect(await page.evaluate(() => history.state && history.state.cipherPicker)).toBeFalsy();
  });
});

test.describe("Suche", () => {
  test("filtert die Liste und hebt die Fundstelle hervor", async ({ page }) => {
    await page.click("#buildingPick");
    await page.fill("#pickerFilter", "Ho");
    await expect(page.locator("#pickerCount")).toHaveText("3 Bauwerke gefunden.");
    await expect(options(page).locator("b")).toHaveText(["Horizontriss-Siphon", "Markusdom", "Notre Dame"]);
    await expect(options(page).nth(0).locator("b mark")).toHaveText("Ho");
    await expect(options(page).nth(1).locator("span mark")).toHaveText("Ho");
  });

  test("Enter nimmt den ersten Treffer", async ({ page }) => {
    await page.click("#buildingPick");
    await page.fill("#pickerFilter", "turm zu babel");
    await page.keyboard.press("Enter");
    await expect(dialog(page)).toBeHidden();
    await expect(page.locator("#building")).toHaveValue("Tower_of_Babel");
  });

  test("ohne Treffer sagt die Suche das", async ({ page }) => {
    await page.click("#buildingPick");
    await page.fill("#pickerFilter", "xyzxyz");
    await expect(page.locator("#pickerCount")).toHaveText("Kein Bauwerk gefunden.");
    await expect(options(page)).toHaveCount(0);
    await page.keyboard.press("Enter");
    await expect(dialog(page)).toBeVisible();
  });

  test("Lostippen in der Liste springt ins Suchfeld", async ({ page }) => {
    await page.click("#buildingPick");
    await page.locator("#pickerList").focus();
    await page.keyboard.type("arche");
    await expect(page.locator("#pickerFilter")).toBeFocused();
    await expect(page.locator("#pickerFilter")).toHaveValue("arche");
  });

  test("das Kreuz leert die Suche", async ({ page }) => {
    await page.click("#buildingPick");
    await page.fill("#pickerFilter", "arche");
    await page.click("#pickerFilterClear");
    await expect(page.locator("#pickerFilter")).toHaveValue("");
    await expect(options(page)).toHaveCount(49);
  });

  test("die Suche beginnt bei jedem Öffnen leer", async ({ page }) => {
    await page.click("#buildingPick");
    await page.fill("#pickerFilter", "arche");
    await page.click("#pickerClose");
    await page.click("#buildingPick");
    await expect(page.locator("#pickerFilter")).toHaveValue("");
    await expect(options(page)).toHaveCount(49);
  });
});

test.describe("Tastatur", () => {
  test("Pfeile bewegen die Markierung, Enter wählt", async ({ page }) => {
    await page.click("#buildingPick");
    const input = page.locator("#pickerFilter");
    const startId = await input.getAttribute("aria-activedescendant");
    await expect(page.locator("#" + startId + " b")).toHaveText("Notre Dame");

    await page.keyboard.press("ArrowDown");
    const nextId = await input.getAttribute("aria-activedescendant");
    expect(nextId).not.toBe(startId);
    const nextName = await page.locator("#" + nextId + " b").textContent();

    await page.keyboard.press("Enter");
    await expect(dialog(page)).toBeHidden();
    await expect(page.locator("#buildingPickName")).toHaveText(nextName);
  });

  test("Pos1 und Ende springen in der Liste an Anfang und Ende", async ({ page }) => {
    await page.click("#buildingPick");
    await page.locator("#pickerList").focus();
    await page.keyboard.press("End");
    const last = await page.locator("#pickerList").getAttribute("aria-activedescendant");
    await expect(options(page).last()).toHaveAttribute("id", last);
    await page.keyboard.press("Home");
    const first = await page.locator("#pickerList").getAttribute("aria-activedescendant");
    await expect(options(page).first()).toHaveAttribute("id", first);
  });

  test("Esc leert erst die Suche, dann schließt es", async ({ page }) => {
    await page.click("#buildingPick");
    await page.fill("#pickerFilter", "arche");
    await page.keyboard.press("Escape");
    await expect(dialog(page)).toBeVisible();
    await expect(page.locator("#pickerFilter")).toHaveValue("");

    await page.keyboard.press("Escape");
    await expect(dialog(page)).toBeHidden();
    await expect(page.locator("#building")).toHaveValue("Notre_Dame");
    await expect(page.locator("#buildingPick")).toBeFocused();
  });

  test("der Fokus erreicht die Seite dahinter nicht", async ({ page }) => {
    await page.click("#buildingPick");
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press("Tab");
      // Hinter dem letzten Element darf der Fokus in die Browserleiste
      // wandern (dann steht er auf <body>), aber nie auf der Seite landen.
      const where = await page.evaluate(() => {
        const active = document.activeElement;
        if (!active || active === document.body) return "browser";
        return document.getElementById("picker").contains(active) ? "picker" : active.id || active.tagName;
      });
      expect(["picker", "browser"]).toContain(where);
    }
  });
});

test.describe("Schließen", () => {
  test("die Zurück-Geste schließt das Fenster und bleibt auf der Seite", async ({ page }) => {
    await page.click("#buildingPick");
    await expect(dialog(page)).toBeVisible();
    await page.goBack();
    await expect(dialog(page)).toBeHidden();
    await expect(page).toHaveURL(/index\.html/);
    await expect(page.locator("#building")).toHaveValue("Notre_Dame");
    await expect(page.locator("html")).not.toHaveClass(/picker-open/);
  });

  test("ein Tipp daneben schließt ohne Änderung", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.click("#buildingPick");
    await expect(dialog(page)).toBeVisible();
    // Oben ist nur Hintergrund: das Blatt kommt von unten.
    await page.mouse.click(195, 20);
    await expect(dialog(page)).toBeHidden();
    await expect(page.locator("#building")).toHaveValue("Notre_Dame");
  });

  test("das Kreuz schließt", async ({ page }) => {
    await page.click("#buildingPick");
    await page.click("#pickerClose");
    await expect(dialog(page)).toBeHidden();
  });

  test("am Kopf nach unten ziehen schließt das Blatt", async ({ page, isMobile }) => {
    test.skip(!isMobile, "Wischen gibt es nur auf dem Blatt am Telefon");
    await page.tap("#buildingPick");
    await expect(dialog(page)).toBeVisible();
    const box = await page.locator("#pickerHead").boundingBox();
    const x = box.x + box.width / 2;
    const y = box.y + 12;
    await page.locator("#pickerHead").evaluate((head, { x, y }) => {
      const fire = (type, dy) => head.dispatchEvent(new PointerEvent(type, {
        bubbles: true, pointerId: 7, pointerType: "touch", clientX: x, clientY: y + dy, isPrimary: true
      }));
      fire("pointerdown", 0);
      fire("pointermove", 60);
      fire("pointermove", 160);
      fire("pointerup", 160);
    }, { x, y });
    await expect(dialog(page)).toBeHidden();
  });

  test("kurz gezogen springt das Blatt zurück", async ({ page, isMobile }) => {
    test.skip(!isMobile, "Wischen gibt es nur auf dem Blatt am Telefon");
    await page.tap("#buildingPick");
    const box = await page.locator("#pickerHead").boundingBox();
    await page.locator("#pickerHead").evaluate((head, { x, y }) => {
      const fire = (type, dy, t) => head.dispatchEvent(new PointerEvent(type, {
        bubbles: true, pointerId: 8, pointerType: "touch", clientX: x, clientY: y + dy, isPrimary: true
      }));
      fire("pointerdown", 0);
      return new Promise((resolve) => setTimeout(() => {
        fire("pointermove", 20);
        fire("pointerup", 20);
        resolve();
      }, 300));
    }, { x: box.x + box.width / 2, y: box.y + 12 });
    await expect(dialog(page)).toBeVisible();
  });
});

test.describe("Darstellung", () => {
  test("auf dem Telefon kommt das Blatt von unten und lässt oben Luft", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.click("#buildingPick");
    await page.waitForTimeout(350);
    const box = await page.locator("#pickerSheet").boundingBox();
    expect(Math.round(box.y + box.height)).toBe(800);
    expect(box.y).toBeGreaterThan(40);
    // Volle Breite; auf dem Desktop bleibt die Rinne der Bildlaufleiste frei.
    expect(box.x).toBe(0);
    expect(box.width).toBeGreaterThanOrEqual(390 - 16);
  });

  test("auf breiten Bildschirmen steht es als Fenster in der Mitte", async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 900 });
    await page.click("#buildingPick");
    await page.waitForTimeout(300);
    const box = await page.locator("#pickerSheet").boundingBox();
    expect(box.width).toBeLessThanOrEqual(460);
    // Mittig — bis auf die halbe Rinne der Bildlaufleiste.
    expect(Math.abs(box.x + box.width / 2 - 600)).toBeLessThan(10);
    expect(box.y).toBeGreaterThan(0);
  });

  test("bei 320px läuft nichts waagerecht über", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.click("#buildingPick");
    const overflow = await page.locator("#pickerList").evaluate((list) => list.scrollWidth - list.clientWidth);
    expect(overflow).toBe(0);
  });

  for (const theme of ["light", "dark", "contrast", "writer", "space", "forge"]) {
    test(`das Blatt ist im Theme ${theme} deckend`, async ({ page }) => {
      await page.evaluate((t) => { document.documentElement.dataset.theme = t; }, theme);
      await page.click("#buildingPick");
      // Das Zeitalter laeuft ueber die Optionen hinweg; es darf nicht
      // durchscheinen.
      const background = await page.locator(".picker-era").first().evaluate((el) => getComputedStyle(el).backgroundImage);
      expect(background).toContain("gradient");
    });
  }
});
