/**
 * Browsertests fuer den Faktor je Platz.
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
