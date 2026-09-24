/**
 * Browsertests fuer die beiden Lesarten der Absicherungsspalte.
 *
 * Dieselbe Zahl, zwei verbreitete Sichtweisen: der Schritt, den dieser Platz
 * kostet ("+1.060"), oder der Stand, den du erreicht hast, wenn er sicher ist
 * ("74.393"). Wie bei der Stufenzahl entscheidet ein Umschalter, welche
 * dasteht — und die Beschriftung nennt sie, damit niemand die falsche liest.
 */
const { test, expect } = require("@playwright/test");

const kopf = (page) => page.locator("#secureModeLabel");
const spalte = (page) => page.locator("#rows .pre");
const werte = (page) => spalte(page).allTextContents();

/** Chateau Frontenac auf Stufe 198 mit Faktor 2,00. */
async function frontenac(page) {
  await page.goto("/index.html");
  await page.locator("#building").selectOption("Château_Frontenac", { force: true });
  await page.fill("#level", "198");
  await page.fill("#factor", "2,00");
}

test.describe("Die Vorgabe", () => {
  test("ist der Schritt je Platz", async ({ page }) => {
    await frontenac(page);
    await expect(kopf(page)).toHaveText("Sichern");
    expect(await werte(page)).toEqual(["+73.333", "Sicher", "+1.060", "+530", "+170"]);
  });
});

test.describe("Umschalten", () => {
  test("macht aus den Schritten die laufende Summe", async ({ page }) => {
    await frontenac(page);
    await page.click("#secureMode");

    await expect(kopf(page)).toHaveText("Summe");
    expect(await werte(page)).toEqual(["73.333", "Sicher", "74.393", "74.923", "75.093"]);
  });

  test("schaltet auch ein Klick auf die Zahl", async ({ page }) => {
    await frontenac(page);
    await spalte(page).nth(2).click();
    await expect(kopf(page)).toHaveText("Summe");

    await spalte(page).nth(2).click();
    await expect(kopf(page)).toHaveText("Sichern");
  });

  test("schaltet ein Klick auf das Häkchen gerade nicht", async ({ page }) => {
    // Die Haekchen liegen in der ersten Spalte; wer einen Platz abwaehlt,
    // will nicht nebenbei die Lesart wechseln.
    await frontenac(page);
    await page.uncheck('#rows input[data-slot="2"]');

    await expect(kopf(page)).toHaveText("Sichern");
  });

  test("ueberdauert die Wahl das Neuladen", async ({ page }) => {
    await frontenac(page);
    await page.click("#secureMode");
    await page.reload();

    await expect(kopf(page)).toHaveText("Summe");
  });

  test("bleibt der Plan darunter unveraendert", async ({ page }) => {
    await frontenac(page);
    const vorher = [
      await page.locator("#sumOwn").getAttribute("data-value"),
      await page.locator("#sumExternal").getAttribute("data-value"),
      await page.locator("#lumpValue").getAttribute("data-value")
    ];
    await page.click("#secureMode");

    expect([
      await page.locator("#sumOwn").getAttribute("data-value"),
      await page.locator("#sumExternal").getAttribute("data-value"),
      await page.locator("#lumpValue").getAttribute("data-value")
    ]).toEqual(vorher);
  });
});

test.describe("Die Summe stimmt", () => {
  test("endet sie auf dem Betrag aus dem Kasten darunter", async ({ page }) => {
    await frontenac(page);
    await page.click("#secureMode");

    const letzte = (await werte(page)).pop().replace(/\./g, "");
    expect(letzte).toBe(await page.locator("#lumpValue").getAttribute("data-value"));
  });

  test("ergibt sie mit dem Rest den Eigenanteil", async ({ page }) => {
    // Die Spalte endet beim Vorabbetrag, nicht beim Eigenanteil — die
    // letzten FP zahlst du ein, wenn alle Plaetze vergeben sind.
    await frontenac(page);
    await page.click("#secureMode");

    const letzte = Number((await werte(page)).pop().replace(/\./g, ""));
    const eigen = Number(await page.locator("#sumOwn").getAttribute("data-value"));
    const vorab = Number(await page.locator("#lumpValue").getAttribute("data-value"));
    expect(letzte).toBe(vorab);
    expect(eigen).toBeGreaterThan(vorab);
  });
});

test.describe('"Sicher" in beiden Lesarten', () => {
  test("bleibt P2 ohne Zahl, solange nichts nachzulegen ist", async ({ page }) => {
    // Nach P1 ist P2 von selbst sicher — und wo sich nichts bewegt, sagt das
    // Wort mehr als eine wiederholte Zahl.
    await frontenac(page);
    await expect(spalte(page).nth(1)).toHaveText("Sicher");
    await page.click("#secureMode");
    await expect(spalte(page).nth(1)).toHaveText("Sicher");
  });

  test("erscheint die Zahl, sobald ein eigener Faktor sie noetig macht", async ({ page }) => {
    await frontenac(page);
    await page.locator("#slots summary").click();
    await page.locator('.slot-list li[data-slot="1"] input').fill("1,85");

    await expect(spalte(page).nth(1)).not.toHaveText("Sicher");
    await page.click("#secureMode");
    await expect(spalte(page).nth(1)).toHaveText("73.813");
  });

  test("erscheint sie auch bei einem eigenen Betrag", async ({ page }) => {
    await frontenac(page);
    await page.locator("#slots summary").click();
    await page.click('[data-slot-unit="fp"]');
    await page.locator('.slot-list li[data-slot="1"] input').fill("2500");

    await expect(spalte(page).nth(1)).not.toHaveText("Sicher");
  });
});

test.describe("Nicht angebotene Plaetze", () => {
  test("bleiben in beiden Lesarten ein Strich", async ({ page }) => {
    await frontenac(page);
    await page.uncheck('#rows input[data-slot="2"]');
    await expect(spalte(page).nth(2)).toHaveText("–");

    await page.click("#secureMode");
    await expect(spalte(page).nth(2)).toHaveText("–");
  });

  test("zaehlen sie nicht in die Summe", async ({ page }) => {
    // Eine laufende Summe auf einem Platz, den du gar nicht ausschreibst,
    // waere eine Zahl, die du nie zahlst.
    await frontenac(page);
    await page.uncheck('#rows input[data-slot="2"]');
    await page.click("#secureMode");

    const alle = await werte(page);
    expect(alle[2]).toBe("–");
    // Die Summe laeuft ueber den Strich hinweg weiter.
    expect(Number(alle[3].replace(/\./g, ""))).toBeGreaterThan(Number(alle[0].replace(/\./g, "")));
  });
});

test.describe("Bedienbarkeit", () => {
  test("traegt der Kopf eine Beschriftung, die die Lesart nennt", async ({ page }) => {
    await frontenac(page);
    await expect(page.locator("#secureMode"))
      .toHaveAttribute("aria-label", /^Sichern — umschalten auf die laufende Summe$/);

    await page.click("#secureMode");
    await expect(page.locator("#secureMode"))
      .toHaveAttribute("aria-label", /^Summe — umschalten auf das, was dieser Platz kostet$/);
  });

  test("steht der Kopf auf derselben Hoehe wie die uebrigen", async ({ page }) => {
    // Er ist ein Knopf, die anderen sind blosser Text. Zuerst trug der Knopf
    // das Polster und die Zelle keins — dadurch sass die Beschriftung drei
    // Pixel tiefer als "Platz", "Belohnung" und "Einzahlen" daneben.
    await frontenac(page);
    const oben = await page.locator("thead th").evaluateAll((zellen) =>
      zellen.map((th) => Math.round(
        (th.querySelector("button") || th).getBoundingClientRect().top)));

    expect(new Set(oben).size, `Oberkanten: ${oben.join(", ")}`).toBe(1);
  });

  test("ist der Kopf mit der Tastatur erreichbar", async ({ page }) => {
    await frontenac(page);
    await page.locator("#secureMode").focus();
    await page.keyboard.press("Enter");

    await expect(kopf(page)).toHaveText("Summe");
  });
});
