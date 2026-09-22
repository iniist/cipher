/**
 * Browsertests fuer den Block "Je Platz".
 *
 * Das Modell dahinter in zwei Saetzen: ein Platz *folgt* dem Wert oben, bis
 * jemand ihn anfasst — danach ist er *eigen* und bleibt stehen, wenn der
 * Wert oben sich bewegt. "Alle wieder angleichen" nimmt alle fuenf zurueck.
 * Der obere Wert zeigt dadurch immer etwas Wahres und wird nie ausgegraut.
 */
const { test, expect } = require("@playwright/test");

const row = (page, slot) => page.locator(`.slot-list li[data-slot="${slot}"]`);
const value = (page, slot) => row(page, slot).locator("input");
const state = (page, slot) => row(page, slot).locator(".slot-state");
const step = (page, slot, direction) =>
  row(page, slot).locator(`[data-slot-step="${direction}"]`);
const hint = (page, slot) => row(page, slot).locator(".slot-hint");
const unit = (page, name) => page.locator(`[data-slot-unit="${name}"]`);

/** Was der Plan gerade ausrechnet — die Endwerte, nicht der laufende Zaehler. */
const summe = (page, id) => page.locator(`#${id}`).getAttribute("data-value");
const sichern = (page) => page.locator("#rows .pre").allTextContents();

/** Alle fuenf Werte, so wie sie in den Feldern stehen. */
const shown = (page) => page.locator(".slot-list input").evaluateAll(
  (inputs) => inputs.map((input) => input.value));

async function open(page) {
  await page.goto("/index.html");
  await page.locator("#slots summary").click();
  await expect(page.locator("#slots")).toHaveAttribute("open", "");
}

test.describe("Aufklappen", () => {
  test("der Block ist zu, solange kein Platz einen eigenen Wert hat", async ({ page }) => {
    await page.goto("/index.html");
    await expect(page.locator("#slots")).not.toHaveAttribute("open", "");
    await expect(page.locator("#slotList")).toBeHidden();
    // Zugeklappt liegen die fuenf Felder auch nicht im Tabulator-Weg.
    await expect(page.locator("#slotsBadge")).toBeHidden();
    await expect(page.locator("#slotsReset")).toBeHidden();
  });

  test("einmal aufgeklappt bleibt er es auch nach einem Neuladen", async ({ page }) => {
    await open(page);
    await page.reload();
    await expect(page.locator("#slots")).toHaveAttribute("open", "");
  });

  test("ein gespeicherter eigener Wert klappt den Block von selbst auf", async ({ page }) => {
    await page.goto("/index.html");
    await page.evaluate(() => {
      const stored = JSON.parse(localStorage.getItem("cipher:state") || "{}");
      stored.slotFactors = [null, null, 185, null, null];
      stored.slotsOpen = false;
      localStorage.setItem("cipher:state", JSON.stringify(stored));
    });
    await page.reload();

    await expect(page.locator("#slots")).toHaveAttribute("open", "");
    await expect(value(page, 2)).toHaveValue("1,85");
  });
});

test.describe("Folgen und eigen werden", () => {
  test("am Anfang folgen alle fuenf dem Wert oben", async ({ page }) => {
    await open(page);
    expect(await shown(page)).toEqual(["1,90", "1,90", "1,90", "1,90", "1,90"]);
    for (let slot = 0; slot < 5; slot++) {
      await expect(state(page, slot)).toHaveText("folgt");
      await expect(row(page, slot).locator(".slot-reset")).toBeHidden();
    }
    await expect(page.locator("#slotsBadge")).toBeHidden();
  });

  test("ein Platz wird eigen, sobald man ihn anfasst", async ({ page }) => {
    await open(page);
    await step(page, 2, -1).click();

    await expect(value(page, 2)).toHaveValue("1,89");
    await expect(state(page, 2)).toHaveText("eigen");
    await expect(row(page, 2).locator(".slot-reset")).toBeVisible();
    await expect(row(page, 2)).toHaveClass(/own/);

    // Die anderen bleiben unberuehrt
    await expect(state(page, 1)).toHaveText("folgt");
    await expect(value(page, 1)).toHaveValue("1,90");
  });

  test("die Spanne steht im Kopf, auch wenn der Block zu ist", async ({ page }) => {
    await open(page);
    await step(page, 0, 1).click();   // P1 auf 1,91
    await step(page, 4, -1).click();  // P5 auf 1,89

    const badge = page.locator("#slotsBadge");
    await expect(badge).toBeVisible();
    await expect(badge).toHaveText("1,89–1,91");

    await page.locator("#slots summary").click();
    await expect(page.locator("#slotList")).toBeHidden();
    await expect(badge, "die Spanne bleibt sichtbar").toBeVisible();
  });

  test("bei nur einem abweichenden Wert nennt der Kopf keine Spanne", async ({ page }) => {
    await open(page);
    // Alle fuenf auf denselben eigenen Wert: min und max sind gleich.
    for (let slot = 0; slot < 5; slot++) await step(page, slot, 1).click();
    await expect(page.locator("#slotsBadge")).toHaveText("1,91");
  });
});

test.describe("Der Wert oben bewegt nur die Folger", () => {
  test("ein eigener Platz bleibt stehen, die anderen ziehen mit", async ({ page }) => {
    await open(page);
    await value(page, 2).fill("1,85");
    await value(page, 2).blur();

    await page.locator('#factorChips button[data-factor="200"]').click();

    expect(await shown(page)).toEqual(["2,00", "2,00", "1,85", "2,00", "2,00"]);
    await expect(state(page, 2)).toHaveText("eigen");
  });

  test("auch der Stepper oben laesst den eigenen Wert in Ruhe", async ({ page }) => {
    await open(page);
    await step(page, 0, -1).click(); // P1 eigen auf 1,89

    await page.click("#factorUp");
    await page.click("#factorUp");

    await expect(page.locator("#factor")).toHaveValue("1,92");
    expect(await shown(page)).toEqual(["1,89", "1,92", "1,92", "1,92", "1,92"]);
  });

  test("der Wert oben bleibt bedienbar und zeigt nie etwas Falsches", async ({ page }) => {
    await open(page);
    await value(page, 0).fill("1,80");
    await value(page, 0).blur();

    // Nicht ausgegraut: er ist weiter die Vorgabe fuer alle Folger.
    await expect(page.locator("#factor")).toBeEnabled();
    await expect(page.locator("#factorUp")).toBeEnabled();
    await expect(page.locator("#factor")).toHaveValue("1,90");
    await expect(value(page, 1), "ein Folger zeigt genau den Wert oben").toHaveValue("1,90");
  });
});

test.describe("Zuruecknehmen", () => {
  test("das Kreuz laesst einen Platz wieder folgen", async ({ page }) => {
    await open(page);
    await value(page, 3).fill("1,82");
    await value(page, 3).blur();
    await expect(state(page, 3)).toHaveText("eigen");

    await row(page, 3).locator(".slot-reset").click();

    await expect(state(page, 3)).toHaveText("folgt");
    await expect(value(page, 3)).toHaveValue("1,90");
    await expect(row(page, 3).locator(".slot-reset")).toBeHidden();
  });

  test("„Alle wieder angleichen“ nimmt alle fuenf zurueck", async ({ page }) => {
    await open(page);
    await value(page, 0).fill("1,80");
    await value(page, 0).blur();
    await value(page, 2).fill("1,95");
    await value(page, 2).blur();
    await expect(page.locator("#slotsReset")).toBeVisible();

    await page.click("#slotsReset");

    expect(await shown(page)).toEqual(["1,90", "1,90", "1,90", "1,90", "1,90"]);
    for (let slot = 0; slot < 5; slot++) await expect(state(page, slot)).toHaveText("folgt");
    await expect(page.locator("#slotsBadge")).toBeHidden();
    // Nichts mehr zurueckzunehmen, also ist der Knopf weg statt ausgegraut.
    await expect(page.locator("#slotsReset")).toBeHidden();
  });
});

test.describe("Eingabe", () => {
  test("die Grenzen gelten je Platz genauso", async ({ page }) => {
    await open(page);

    await value(page, 1).fill("3,00");
    await value(page, 1).blur();
    await expect(value(page, 1)).toHaveValue("2,00");
    await expect(step(page, 1, 1)).toBeDisabled();
    await expect(step(page, 1, -1)).toBeEnabled();

    await value(page, 1).fill("1,00");
    await value(page, 1).blur();
    await expect(value(page, 1)).toHaveValue("1,80");
    await expect(step(page, 1, -1)).toBeDisabled();
  });

  for (const [eingabe, erwartet] of [
    ["1,83", "1,83"], ["1.83", "1,83"], ["1,8", "1,80"], ["183", "1,83"], ["183 %", "1,83"]
  ]) {
    test(`„${eingabe}“ wird als ${erwartet} gelesen`, async ({ page }) => {
      await open(page);
      await value(page, 0).fill(eingabe);
      await value(page, 0).blur();
      await expect(value(page, 0)).toHaveValue(erwartet);
    });
  }

  test("Unsinn laesst den letzten gueltigen Wert stehen", async ({ page }) => {
    await open(page);
    await value(page, 0).fill("1,85");
    await value(page, 0).blur();
    await value(page, 0).fill("abc");
    await value(page, 0).blur();
    await expect(value(page, 0)).toHaveValue("1,85");
  });

  test("die Pfeiltasten aendern den Wert des Platzes", async ({ page }) => {
    await open(page);
    await value(page, 4).focus();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await expect(value(page, 4)).toHaveValue("1,88");
    await expect(state(page, 4)).toHaveText("eigen");

    await page.keyboard.press("ArrowUp");
    await expect(value(page, 4)).toHaveValue("1,89");
  });
});

test.describe("Wirkung auf den Plan", () => {
  test.beforeEach(async ({ page }) => {
    await open(page);
    // Stufe 40: hier wirft auch P5 noch eine Belohnung ab.
    await page.fill("#level", "40");
    await page.locator("#level").blur();
  });

  const cell = (page, slot, column) =>
    page.locator("#rows tr").nth(slot).locator(`td.${column}`);

  test("ein schwaecherer Faktor senkt die Einzahlung dieses Platzes", async ({ page }) => {
    const before = await cell(page, 2, "pay").textContent();

    await value(page, 2).fill("1,80");
    await value(page, 2).blur();

    const after = await cell(page, 2, "pay").textContent();
    expect(Number(after.replace(/\./g, ""))).toBeLessThan(Number(before.replace(/\./g, "")));
  });

  test("und verlangt dafuer, weiter vorher zu sichern", async ({ page }) => {
    // Das ist keine zusaetzliche Regel, sondern faellt aus der bestehenden
    // Formel: needed = remaining − 2 × Einzahlung. Wer weniger einzahlt, ist
    // leichter zu ueberbieten und braucht mehr Vorlauf.
    //
    // Gemessen wird an P5, weil P1 bis P3 auf dieser Stufe ohnehin schon
    // "Sicher" sind — dort waere die Aussage nicht zu sehen.
    const zahl = (text) => Number(text.replace(/[^\d]/g, ""));
    const vorher = zahl(await cell(page, 4, "pre").textContent());
    const oben = await page.locator("#rows tr").evaluateAll((trs) =>
      trs.slice(0, 4).map((tr) => tr.textContent));

    await value(page, 4).fill("1,80");
    await value(page, 4).blur();

    expect(zahl(await cell(page, 4, "pre").textContent())).toBeGreaterThan(vorher);

    // Und nur P5: die Plaetze darueber werden vor ihm vergeben.
    expect(await page.locator("#rows tr").evaluateAll((trs) =>
      trs.slice(0, 4).map((tr) => tr.textContent))).toEqual(oben);
  });

  test("die Foerderchat-Zeile nennt die Betraege je Platz", async ({ page }) => {
    await page.fill("#playerName", "Dani");
    const before = await page.locator("#chatPoints").textContent();

    await value(page, 1).fill("1,80");
    await value(page, 1).blur();

    await expect(page.locator("#chatPoints")).not.toHaveText(before);
    await expect(page.locator("#chatPoints"))
      .toHaveText(/P5\(\d+\) P4\(\d+\) P3\(\d+\) P2\(\d+\) P1\(\d+\)$/);
  });

  test("der Block allein aendert am Plan nichts", async ({ page }) => {
    const offen = await page.locator("#chatPoints").textContent();
    const zeilen = await page.locator("#rows").textContent();

    await page.locator("#slots summary").click(); // wieder zuklappen
    await expect(page.locator("#slotList")).toBeHidden();

    expect(await page.locator("#chatPoints").textContent()).toBe(offen);
    expect(await page.locator("#rows").textContent()).toBe(zeilen);
    await expect(page.locator("#slotsReset"), "nichts zurueckzunehmen").toBeHidden();
  });
});

test.describe("Speichern", () => {
  test("eigene Werte ueberleben einen Neuladen", async ({ page }) => {
    await open(page);
    await value(page, 1).fill("1,84");
    await value(page, 1).blur();
    await value(page, 3).fill("1,97");
    await value(page, 3).blur();

    await page.reload();

    expect(await shown(page)).toEqual(["1,90", "1,84", "1,90", "1,97", "1,90"]);
    await expect(state(page, 1)).toHaveText("eigen");
    await expect(state(page, 2)).toHaveText("folgt");
  });

  test("ein abgewaehlter Platz behaelt seinen Faktor", async ({ page }) => {
    await open(page);
    await page.fill("#level", "40");
    await page.locator("#level").blur();
    await value(page, 3).fill("1,83");
    await value(page, 3).blur();

    await page.locator('#rows input[data-slot="3"]').uncheck();
    await expect(value(page, 3)).toHaveValue("1,83");
    await expect(state(page, 3)).toHaveText("eigen");

    await page.locator('#rows input[data-slot="3"]').check();
    await expect(value(page, 3)).toHaveValue("1,83");
  });

  test("kaputte Werte im Speicher werden verworfen", async ({ page }) => {
    await page.goto("/index.html");
    await page.evaluate(() => {
      const stored = JSON.parse(localStorage.getItem("cipher:state") || "{}");
      stored.slotFactors = [999, "abc", 185, null, { }];
      localStorage.setItem("cipher:state", JSON.stringify(stored));
    });
    await page.reload();

    // 999 wird auf 2,00 begrenzt, Unsinn faellt auf "folgt" zurueck.
    expect(await shown(page)).toEqual(["2,00", "1,90", "1,85", "1,90", "1,90"]);
    await expect(state(page, 1)).toHaveText("folgt");
  });
});

test("alle Bedienelemente im Block tragen eine Beschriftung", async ({ page }) => {
  await open(page);
  const unlabelled = await page.locator("#slots").evaluate((block) =>
    [...block.querySelectorAll("button, input")]
      .filter((element) => !element.getAttribute("aria-label") && !element.textContent.trim())
      .map((element) => element.outerHTML.slice(0, 60)));
  expect(unlabelled).toEqual([]);
});

// ------------------------------------------------------------ Betrag je Platz
//
// Dieselbe Zahl, zwei Einheiten: der Arche-Faktor eines Foerderers oder die
// Summe, die er einzahlt. Gebraucht wird die zweite, wenn jemand einen Platz
// wegschnappt — seine Einzahlung passt dann zu keinem Faktor im zulaessigen
// Bereich, und die Plaetze darunter verschieben sich dadurch.

/** Chateau Frontenac auf Stufe 198 mit Faktor 2,00 — die Lage aus dem Beispiel. */
async function frontenac(page) {
  await page.goto("/index.html");
  await page.selectOption("#building", "Château_Frontenac");
  await page.fill("#level", "198");
  await page.fill("#factor", "2,00");
  await page.locator("#slots summary").click();
  await expect(page.locator("#slots")).toHaveAttribute("open", "");
}

test.describe("Einheit umschalten", () => {
  test("in FP stehen die Einzahlungen, die der Plan ausrechnet", async ({ page }) => {
    await frontenac(page);
    expect(await shown(page)).toEqual(["2,00", "2,00", "2,00", "2,00", "2,00"]);

    await unit(page, "fp").click();
    expect(await shown(page)).toEqual(["6.400", "3.200", "1.070", "270", "50"]);
    // Dieselben Zahlen wie in der Spalte "Einzahlen" — es ist dieselbe Zahl.
    expect(await page.locator("#rows .pay").allTextContents())
      .toEqual(["6.400", "3.200", "1.070", "270", "50"]);
  });

  test("der Nachsatz nennt immer die andere Einheit", async ({ page }) => {
    await frontenac(page);
    await expect(hint(page, 0)).toHaveText("≙ 6.400 FP");

    await unit(page, "fp").click();
    await expect(hint(page, 0)).toHaveText("≙ Faktor 2,00");
  });

  test("umschalten allein aendert keine einzige Zahl im Plan", async ({ page }) => {
    await frontenac(page);
    const vorher = [await summe(page, "sumOwn"), await summe(page, "sumExternal")];
    const gesichert = await sichern(page);

    await unit(page, "fp").click();
    expect([await summe(page, "sumOwn"), await summe(page, "sumExternal")]).toEqual(vorher);
    expect(await sichern(page)).toEqual(gesichert);
  });

  test("die Wahl ueberdauert das Neuladen", async ({ page }) => {
    await frontenac(page);
    await unit(page, "fp").click();
    await expect(unit(page, "fp")).toHaveAttribute("aria-pressed", "true");

    await page.reload();
    await expect(unit(page, "fp")).toHaveAttribute("aria-pressed", "true");
    await expect(value(page, 0)).toHaveValue("6.400");
  });
});

test.describe("Einen Betrag eintragen", () => {
  test("ein Betrag verschiebt die Plaetze darunter und senkt den Eigenanteil", async ({ page }) => {
    await frontenac(page);
    expect(await sichern(page)).toEqual(["+73.333", "Sicher", "+1.060", "+530", "+170"]);
    expect(await summe(page, "sumOwn")).toBe("75143");

    // Jemand nimmt P1 und zahlt 10.000 statt der gerechneten 6.400.
    await unit(page, "fp").click();
    await value(page, 0).fill("10000");

    expect(await sichern(page)).toEqual(["+66.133", "+3.600", "+1.060", "+530", "+170"]);
    expect(await summe(page, "sumOwn")).toBe("71543");
    // Die 3.600 mehr Fremdkapital sind genau der Betrag, den du weniger zahlst.
    expect(await summe(page, "sumExternal")).toBe("14590");
  });

  test("ein Betrag macht den Platz eigen und laesst sich zuruecknehmen", async ({ page }) => {
    await frontenac(page);
    await unit(page, "fp").click();
    await value(page, 0).fill("10000");

    await expect(state(page, 0)).toHaveText("eigen");
    await expect(state(page, 1)).toHaveText("folgt");
    await expect(row(page, 0).locator(".slot-reset")).toBeVisible();

    await row(page, 0).locator(".slot-reset").click();
    await expect(state(page, 0)).toHaveText("folgt");
    await expect(value(page, 0)).toHaveValue("6.400");
    expect(await summe(page, "sumOwn")).toBe("75143");
  });

  test("ein eingestellter Platz behaelt seine Einheit beim Umschalten", async ({ page }) => {
    // Sonst muesste der Betrag in einen Faktor uebersetzt werden, und
    // 10.000 FP auf eine Belohnung von 3.200 waeren 3,13 — ausserhalb des
    // zulaessigen Bereichs, also nicht darstellbar.
    await frontenac(page);
    await unit(page, "fp").click();
    await value(page, 0).fill("10000");

    await unit(page, "factor").click();
    expect(await shown(page)).toEqual(["10.000", "2,00", "2,00", "2,00", "2,00"]);
    // Der Nachsatz nennt jetzt beide Einheiten, denn im Feld steht eine
    // andere als im Umschalter — sonst laese man die 10.000 als Faktor.
    await expect(hint(page, 0)).toHaveText("10.000 FP ≙ Faktor 3,13");
    await expect(state(page, 0)).toHaveText("eigen");
  });

  test("Faktor und Betrag verdraengen einander, ein Platz traegt eine Zahl", async ({ page }) => {
    await frontenac(page);
    await value(page, 2).fill("1,85");
    await expect(state(page, 2)).toHaveText("eigen");

    // In FP-Einheit zeigt der Platz weiter seinen Faktor und nimmt auch
    // weiter einen an: getippt wird in der Einheit, die im Feld steht.
    // Andersherum wuerde ein Klick ins Feld einen Betrag zerschiessen, der
    // dann als Faktor gelesen und auf 2,00 gestutzt wird.
    await unit(page, "fp").click();
    await expect(value(page, 2)).toHaveValue("1,85");
    await expect(hint(page, 2)).toHaveText("Faktor 1,85 ≙ 990 FP");
    await value(page, 2).fill("1,95");
    await expect(value(page, 2)).toHaveValue("1,95");

    // Das Kreuz gibt den Platz frei, danach nimmt er den Betrag — und der
    // Faktor faellt dabei weg, ein Platz traegt eine Zahl.
    await row(page, 2).locator(".slot-reset").click();
    await value(page, 2).fill("2000");

    const gespeichert = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("cipher:state")));
    expect(gespeichert.slotPays[2]).toBe(2000);
    expect(gespeichert.slotFactors[2]).toBe(null);
  });

  test("der Stepper faellt weg, wo kein Faktor steht", async ({ page }) => {
    // Eine abgelesene Summe hat keine Faktorstufen, um die man sie schieben
    // koennte. Beim Faktor bleibt er.
    await frontenac(page);
    await expect(step(page, 0, 1)).toBeVisible();

    await unit(page, "fp").click();
    await expect(step(page, 0, 1)).toBeHidden();
    await expect(step(page, 0, -1)).toBeHidden();
  });

  test("ein getippter Betrag ueberdauert das Neuladen und klappt den Block auf", async ({ page }) => {
    await frontenac(page);
    await unit(page, "fp").click();
    await value(page, 0).fill("10000");

    await page.reload();
    await expect(page.locator("#slots")).toHaveAttribute("open", "");
    await expect(value(page, 0)).toHaveValue("10.000");
    expect(await summe(page, "sumOwn")).toBe("71543");
  });

  test('"Alle wieder angleichen" nimmt auch Betraege zurueck', async ({ page }) => {
    await frontenac(page);
    await unit(page, "fp").click();
    await value(page, 0).fill("10000");
    await value(page, 3).fill("400");
    await expect(page.locator("#slotsBadge")).toHaveText("2 eigene");

    await page.click("#slotsReset");
    for (let slot = 0; slot < 5; slot++) await expect(state(page, slot)).toHaveText("folgt");
    await expect(page.locator("#slotsBadge")).toBeHidden();
    expect(await summe(page, "sumOwn")).toBe("75143");
  });

  test("das Abzeichen zaehlt, sobald Betraege im Spiel sind", async ({ page }) => {
    // Eine Faktorspanne ist aussagekraeftig, weil alle fuenf dasselbe messen.
    // Eine Betragsspanne waere es nicht: 50 bis 10.000 ist zwischen P5 und P1
    // voellig normal.
    await frontenac(page);
    await value(page, 0).fill("1,90");
    await expect(page.locator("#slotsBadge")).toHaveText("1,90–2,00");

    await unit(page, "fp").click();
    await value(page, 3).fill("400");
    await expect(page.locator("#slotsBadge")).toHaveText("2 eigene");
  });
});

test.describe("Wenn der Betrag nicht passt", () => {
  test("ein Platz, der einen ueber sich ueberholt, wird gemeldet", async ({ page }) => {
    await frontenac(page);
    await expect(page.locator("#warn .warnline")).toHaveCount(0);

    // P4 schuettet weniger aus als P3, kostet hier aber mehr. Aus Faktoren
    // zwischen 1,80 und 2,00 kann das nicht entstehen, aus einer getippten
    // Zahl schon.
    await unit(page, "fp").click();
    await value(page, 3).fill("2000");
    await expect(page.locator("#warn")).toContainText("besser bezahlter über ihm");

    await row(page, 3).locator(".slot-reset").click();
    await expect(page.locator("#warn .warnline")).toHaveCount(0);
  });

  test("ein hoher Betrag auf einem hohen Platz ist keine Warnung wert", async ({ page }) => {
    await frontenac(page);
    await unit(page, "fp").click();
    await value(page, 0).fill("10000");
    await expect(page.locator("#warn .warnline")).toHaveCount(0);
  });

  test("Unsinn im Feld aendert den Plan nicht", async ({ page }) => {
    await frontenac(page);
    await unit(page, "fp").click();
    await value(page, 0).fill("abc");
    expect(await summe(page, "sumOwn")).toBe("75143");
    await expect(state(page, 0)).toHaveText("folgt");

    // Und beim Verlassen steht der gerechnete Wert wieder da.
    await value(page, 0).blur();
    await expect(value(page, 0)).toHaveValue("6.400");
  });
});

test.describe("Der Block passt auch auf schmale Telefone", () => {
  // Beim Bauen zweimal danebengegangen: der Nachsatz lag erst als
  // umbrechendes Glied in der Flex-Zeile, und ein Umbruch greift vor dem
  // Schrumpfen — bei 320 Pixeln fiel dadurch das Kreuz auf eine eigene
  // Zeile. Seitdem steht er ausserhalb der Zeile, und das hier misst nach.
  for (const breite of [320, 360, 390]) {
    test(`bei ${breite} Pixeln steht jede Zeile auf einer Zeile`, async ({ page }) => {
      await page.setViewportSize({ width: breite, height: 900 });
      await frontenac(page);
      await value(page, 0).fill("1,85");
      await unit(page, "fp").click();
      await value(page, 1).fill("10000");
      await page.locator("#playerName").click();

      const ueberbreite = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(ueberbreite, "die Seite laesst sich nicht quer schieben").toBe(0);

      const hoehen = await page.locator("#slotList .slot-row").evaluateAll(
        (rows) => rows.map((element) => Math.round(element.getBoundingClientRect().height)));
      expect(new Set(hoehen).size, "keine Zeile ist umgebrochen").toBe(1);

      // Und der Nachsatz steht unter der Zeile, nicht daneben. Gemessen an
      // der Zeilenmitte, nicht an ihrer Unterkante: der Nachsatz rueckt per
      // negativem Rand ein Pixel hoch, und daran soll der Test nicht haengen.
      const zeile = await page.locator("#slotList .slot-row").first().boundingBox();
      const nachsatz = await hint(page, 0).boundingBox();
      expect(nachsatz.y - zeile.y).toBeGreaterThan(zeile.height / 2);
    });
  }
});
