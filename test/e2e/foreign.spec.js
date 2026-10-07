/**
 * Browsertests fuer "FP von anderen" im Block "Schon im Bauwerk".
 *
 * Der Fall aus der Rueckmeldung: im Château sitzen schon Fremdeinzahler und
 * Sniper. Ihre Betraege werden eingetragen, und cipher setzt jeden auf den
 * Platz, den er mit seinem Betrag behaelt — von Hand einsortieren muss
 * niemand mehr.
 *
 * Château Frontenac 80 bei 1,90 (Vorgabe): die Gilde zahlt 2.043, 1.026,
 * 342, 86 und 19.
 */
const { test, expect } = require("@playwright/test");
const { haekchen, vergeben } = require("./plaetze");

const sichern = (page) => page.locator("#rows .pre").allTextContents();
const kosten = (page) => page.locator("#rows .pay").allTextContents();
const fremd = (page) => page.locator("#foreignList input");
const platz = (page) => page.locator("#foreignList .foreign-place").allTextContents();
const summe = (page, id) => page.locator(`#${id}`).getAttribute("data-value");
const zustand = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("cipher:state")));

async function chateau(page) {
  await page.goto("/index.html");
  await page.locator("#building").selectOption("Château_Frontenac", { force: true });
  await page.fill("#level", "80");
  await page.fill("#factor", "1,90");
  await page.locator("#stand summary").click();
  await expect(page.locator("#stand")).toHaveAttribute("open", "");
}

/** Betraege der Reihe nach in die Liste tippen und sie dann verlassen. */
async function eintragen(page, ...betraege) {
  for (let i = 0; i < betraege.length; i++) {
    await fremd(page).nth(i).fill(String(betraege[i]));
  }
  await page.locator("h2").first().click();
}

test("der Block ist zugeklappt, bis es etwas einzutragen gibt", async ({ page }) => {
  await page.goto("/index.html");
  await expect(page.locator("#stand")).toBeVisible();
  await expect(page.locator("#stand")).not.toHaveAttribute("open", "");
  await expect(page.locator("#standBadge")).toBeHidden();
});

test("jede Fremdeinzahlung landet auf dem Platz, den sie behaelt", async ({ page }) => {
  await chateau(page);
  const ohne = await summe(page, "sumOwn");
  // In beliebiger Reihenfolge: 5 FP reichen fuer keinen Platz, 300 schlagen
  // P4 (86), aber nicht P3 (342), 1.500 schlagen P2 (1.026), nicht P1.
  await eintragen(page, 5, 300, 1500);

  await expect.poll(() => platz(page)).toEqual(["kein Platz", "hält P4", "hält P2", ""]);
  await expect.poll(() => sichern(page)).toEqual(["Sicher", "fremd", "+143", "fremd", "+304"]);
  expect((await kosten(page)).map((text) => text.trim()))
    .toEqual(["2.043", "1.500", "342", "300", "19"]);
  await expect(page.locator("#standBadge")).toHaveText("3 fremd");

  // Ausgeschrieben werden nur die Plaetze, die die Gilde noch bekommt.
  await page.locator('[data-chat-mode="points"]').click();
  await expect(page.locator("#chatPoints")).toContainText("P5(19) P3(342) P1(2043)");
  await expect(page.locator("#lumpText")).toContainText("P1, P3 und P5 sicher");

  // Alle 1.805 FP liegen im Bauwerk, auch die 5 ohne Platz.
  expect(Number(await summe(page, "sumOwn"))).toBeLessThan(Number(ohne));
  const gesamt = Number(await summe(page, "sumTotal"));
  const foerderer = Number(await summe(page, "sumExternal"));
  expect(foerderer).toBe(2043 + 1500 + 342 + 300 + 19 + 5);
  expect(Number(await summe(page, "sumOwn"))).toBe(gesamt - foerderer);
  await expect(page.locator("#bar i")).toHaveCount(7);
});

test("ein fremd gehaltener Platz laesst sich nicht abhaken", async ({ page }) => {
  await chateau(page);
  await eintragen(page, 1500);
  await expect(haekchen(page, 1)).toBeDisabled();
  await expect(page.locator('#rows tr[data-row="1"]')).toHaveClass(/foreign/);
  await expect(page.locator('#rows tr[data-row="1"] .pay-btn')).toBeDisabled();
});

test("ohne eigene Angabe zaehlt dein Stand als 0", async ({ page }) => {
  await chateau(page);
  await eintragen(page, 300);
  await expect(page.locator("#ownPaid")).toHaveAttribute("placeholder", "0");
  await expect(page.locator("#ownPaidHint")).toContainText("leer heißt 0");

  const vorher = await sichern(page);
  await page.locator("#ownPaid").fill("500");
  await page.locator("h2").first().click();
  await expect.poll(() => sichern(page)).not.toEqual(vorher);
  await expect(page.locator("#standBadge")).toHaveText("500 eigen · 1 fremd");
});

test("ein leeres Feld fuer den naechsten Betrag, das Kreuz nimmt einen heraus", async ({ page }) => {
  await chateau(page);
  await expect(fremd(page)).toHaveCount(1);
  await fremd(page).nth(0).fill("300");
  await expect(fremd(page)).toHaveCount(2);
  // Das Feld, in dem getippt wird, behaelt den Fokus.
  await expect(fremd(page).nth(0)).toBeFocused();

  await fremd(page).nth(1).fill("1500");
  await expect(fremd(page)).toHaveCount(3);
  await expect.poll(() => platz(page)).toEqual(["hält P4", "hält P2", ""]);

  await page.locator("#foreignList .foreign-del").nth(0).click();
  await expect(fremd(page)).toHaveCount(2);
  await expect(fremd(page).nth(0)).toHaveValue("1.500");
  expect((await zustand(page)).foreign).toEqual([1500]);
});

test("geleerte Felder fallen weg, sobald die Liste verlassen wird", async ({ page }) => {
  await chateau(page);
  await eintragen(page, 300, 1500);
  await fremd(page).nth(0).fill("");
  // Noch in der Liste: das Feld bleibt, damit dort weitergetippt werden kann.
  await fremd(page).nth(1).click();
  await expect(fremd(page)).toHaveCount(3);

  await page.locator("h2").first().click();
  await expect(fremd(page)).toHaveCount(2);
  await expect(fremd(page).nth(0)).toHaveValue("1.500");
});

test("die Betraege ueberdauern das Neuladen und gelten nur fuer ihre Stufe", async ({ page }) => {
  await chateau(page);
  await eintragen(page, 300);
  await page.reload();
  await expect(page.locator("#stand")).toHaveAttribute("open", "");
  await expect(fremd(page).nth(0)).toHaveValue("300");
  await expect.poll(() => sichern(page)).toContain("fremd");

  await page.locator("#levelUp").click();
  await expect(fremd(page)).toHaveCount(1);
  await expect(fremd(page).nth(0)).toHaveValue("");
  await expect.poll(() => sichern(page)).not.toContain("fremd");
});

test("mehr im Bauwerk als die Stufe kostet, gibt eine Warnung", async ({ page }) => {
  await chateau(page);
  await eintragen(page, 99999);
  await expect(page.locator("#warn")).toContainText("mehr, als die Stufe kostet");
});

test("ein vergebener Platz laesst den Block zu, auch nach dem Neuladen", async ({ page }) => {
  await page.goto("/index.html");
  await expect(page.locator("#stand")).not.toHaveAttribute("open", "");
  await vergeben(page, 0);
  await expect(page.locator("#stand")).not.toHaveAttribute("open", "");
  await page.reload();
  await expect(page.locator("#stand")).not.toHaveAttribute("open", "");
  await page.locator("#stand summary").click();
  await expect(page.locator("#ownPaid")).toBeVisible();
});
