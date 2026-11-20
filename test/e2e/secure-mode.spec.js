/**
 * Browsertests fuer die Absicherungsspalte.
 *
 * Dieselbe Rechnung, zwei verbreitete Sichtweisen — und beide stehen da,
 * ohne Umschalter: oben der Schritt, den dieser Platz kostet ("+2.660"),
 * klein darunter der Stand deiner eigenen FP, wenn er sicher ist
 * ("Σ 62.061"). Gefragt war gerade die Summe: wie viel insgesamt von dir
 * drin sein muss, um etwa P4 abzusichern.
 */
const { test, expect } = require("./mit-kosten");
const { abwaehlen, schritte, summen } = require("./plaetze");

const spalte = (page) => page.locator("#rows td.pre");
const zahl = (text) => Number(text.replace(/\./g, ""));

/**
 * Atomium auf Stufe 198 mit Faktor 2,00 — eine Kupfer-Stufe mit fuenf
 * Plaetzen (vor dem Prestige-Update stand hier Château Frontenac 198, das
 * ist jetzt Gold).
 */
async function frontenac(page) {
  await page.goto("/index.html");
  await page.locator("#building").selectOption("Atomium", { force: true });
  await page.fill("#level", "198");
  await page.fill("#factor", "2,00");
}

test.describe("Schritt und Summe", () => {
  test("stehen beide in der Spalte", async ({ page }) => {
    await frontenac(page);
    await expect(page.locator("thead th").last()).toHaveText("Sichern");
    expect(await schritte(page)).toEqual(["+59.401", "Sicher", "+2.660", "+1.332", "+400"]);
    expect(await summen(page)).toEqual(["59.401", "59.401", "62.061", "63.393", "63.793"]);
  });

  test("zeigt die Summe das Zeichen Σ und liest sich vor als „insgesamt“", async ({ page }) => {
    await frontenac(page);
    const summe = spalte(page).nth(2).locator(".pre-sum");
    await expect(summe).toHaveText("Σ insgesamt 62.061");
    await expect(summe.locator('[aria-hidden="true"]')).toHaveText("Σ ");
    await expect(summe.locator(".sr-only")).toHaveText("insgesamt ");
  });

  test("steht die Summe auch unter „Sicher“", async ({ page }) => {
    // Gerade dort fehlte sie frueher: wer ablesen wollte, was bis P2 drin
    // sein muss, musste in die Zeile darueber schauen.
    await frontenac(page);
    await expect(spalte(page).nth(1).locator(".safe")).toHaveText("Sicher");
    await expect(spalte(page).nth(1).locator(".pre-sum")).toContainText("59.401");
  });

  test("ist ein Tipp auf die Zelle kein Schalter mehr", async ({ page }) => {
    await frontenac(page);
    const vorher = await spalte(page).allTextContents();
    await spalte(page).nth(2).click();
    expect(await spalte(page).allTextContents()).toEqual(vorher);
    await expect(page.locator("#secureMode")).toHaveCount(0);
  });
});

test.describe("Die Summe stimmt", () => {
  test("endet sie auf dem Betrag aus dem Kasten darunter", async ({ page }) => {
    await frontenac(page);
    const letzte = (await summen(page)).pop().replace(/\./g, "");
    expect(letzte).toBe(await page.locator("#lumpValue").getAttribute("data-value"));
  });

  test("ergibt sie mit dem Rest den Eigenanteil", async ({ page }) => {
    // Die Spalte endet beim Vorabbetrag, nicht beim Eigenanteil — die
    // letzten FP zahlst du ein, wenn alle Plaetze vergeben sind.
    await frontenac(page);
    const letzte = zahl((await summen(page)).pop());
    const eigen = Number(await page.locator("#sumOwn").getAttribute("data-value"));
    const vorab = Number(await page.locator("#lumpValue").getAttribute("data-value"));
    expect(letzte).toBe(vorab);
    expect(eigen).toBeGreaterThan(vorab);
  });

  test("ist sie die Summe der Schritte davor", async ({ page }) => {
    await frontenac(page);
    const schritt = (await schritte(page)).map((text) => (text === "Sicher" ? 0 : zahl(text.slice(1))));
    let laufend = 0;
    const erwartet = schritt.map((n) => (laufend += n).toLocaleString("de-DE"));
    expect(await summen(page)).toEqual(erwartet);
  });
});

test.describe('"Sicher"', () => {
  test("steht bei P2, solange nichts nachzulegen ist", async ({ page }) => {
    await frontenac(page);
    expect((await schritte(page))[1]).toBe("Sicher");
  });

  test("weicht der Zahl, sobald ein eigener Faktor sie noetig macht", async ({ page }) => {
    await frontenac(page);
    await page.locator("#slots summary").click();
    await page.locator('.slot-list li[data-slot="1"] input').fill("1,85");

    await expect.poll(async () => (await schritte(page))[1]).not.toBe("Sicher");
    await expect.poll(async () => (await summen(page))[1]).toBe("60.597");
  });

  test("weicht ihr auch bei einem eigenen Betrag", async ({ page }) => {
    await frontenac(page);
    await page.locator("#slots summary").click();
    await page.click('[data-slot-unit="fp"]');
    await page.locator('.slot-list li[data-slot="1"] input').fill("2500");

    await expect.poll(async () => (await schritte(page))[1]).not.toBe("Sicher");
  });
});

test.describe("Nicht angebotene Plaetze", () => {
  test("bleiben ein Strich ohne Summe", async ({ page }) => {
    await frontenac(page);
    await abwaehlen(page, 2);
    await expect(spalte(page).nth(2)).toHaveText("–");
    expect((await summen(page))[2]).toBeNull();
  });

  test("zaehlen sie nicht in die Summe", async ({ page }) => {
    // Eine laufende Summe auf einem Platz, den du gar nicht ausschreibst,
    // waere eine Zahl, die du nie zahlst.
    await frontenac(page);
    await abwaehlen(page, 2);

    const alle = await summen(page);
    expect(alle[2]).toBeNull();
    // Die Summe laeuft ueber den Strich hinweg weiter.
    expect(zahl(alle[3])).toBeGreaterThan(zahl(alle[0]));
  });
});

test.describe("Darstellung", () => {
  test("steht der Kopf auf derselben Hoehe wie die uebrigen", async ({ page }) => {
    await frontenac(page);
    const oben = await page.locator("thead th").evaluateAll((zellen) =>
      zellen.map((th) => Math.round(th.getBoundingClientRect().top)));
    expect(new Set(oben).size, `Oberkanten: ${oben.join(", ")}`).toBe(1);
  });

  test("steht die Summe unter dem Schritt, nicht daneben", async ({ page }) => {
    await frontenac(page);
    const zelle = spalte(page).nth(2);
    const schritt = await zelle.locator(".pre-step").boundingBox();
    const summe = await zelle.locator(".pre-sum").boundingBox();
    expect(summe.y).toBeGreaterThanOrEqual(schritt.y + schritt.height - 1);
  });
});
