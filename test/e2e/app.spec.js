/**
 * Browsertests fuer die Anwendung.
 * Ausfuehren mit: npm run test:e2e
 */
const { test, expect } = require("@playwright/test");
const DATA = require("../../data.js");
const { mitTestdaten, OHNE_DATEN } = require("./testdaten");

test.beforeEach(async ({ page }) => {
  await page.goto("/index.html");
});

test("zeigt Wortmarke und Untertitel", async ({ page }) => {
  await expect(page).toHaveTitle(/^cipher —/);
  await expect(page.locator("#wordmark")).toHaveText("cipher");
  await expect(page.locator(".sub")).toHaveText("Das Förder-Dashboard für Mäzen-Plätze & FP-Einsatz.");
});

test("rechnet beim Laden einen vollstaendigen Plan", async ({ page }) => {
  await expect(page.locator("#rows tr")).toHaveCount(5);
  await expect(page.locator("#sumTotal")).not.toHaveText("–");
  await expect(page.locator("#sumExternal")).not.toHaveText("–");
  await expect(page.locator("#sumOwn")).not.toHaveText("–");
  await expect(page.locator("#bar i")).toHaveCount(6);
});

test("Gesamt entspricht Fremd plus Eigenanteil", async ({ page }) => {
  const read = async (id) => Number((await page.locator(`#${id}`).textContent()).replace(/\./g, ""));
  // Die Zahlen zaehlen animiert hoch — auf den Endwert warten.
  await expect.poll(async () => {
    const [total, external, own] = await Promise.all([read("sumTotal"), read("sumExternal"), read("sumOwn")]);
    return total - external - own;
  }).toBe(0);
});

test("die Stufe laesst sich ueber die Knoepfe aendern", async ({ page }) => {
  await page.fill("#level", "40");
  await page.locator("#level").blur();
  await expect(page.locator("#level")).toHaveValue("40");

  await page.click("#levelUp");
  await expect(page.locator("#level")).toHaveValue("41");

  await page.click("#levelDown");
  await page.click("#levelDown");
  await expect(page.locator("#level")).toHaveValue("39");
});

test("die Stufe wird erst weit oberhalb des Dokumentierten begrenzt", async ({ page }) => {
  // Die Stufe aus dem Wiki ist keine Wand mehr — Bauwerke im Spiel stehen
  // hoeher. Abgefangen wird nur, was kein Spielstand hergibt.
  await page.selectOption("#building", "Tower_of_Babel");
  await page.fill("#level", "260");
  await page.locator("#level").blur();
  await expect(page.locator("#level")).toHaveValue("260");

  await page.fill("#level", "9999");
  await page.locator("#level").blur();
  await expect(page.locator("#level")).toHaveValue("1000");
});

test("der Faktor laesst sich ueber die Schnellwahl setzen", async ({ page }) => {
  await page.locator('#factorChips button[data-factor="200"]').click();
  await expect(page.locator("#factor")).toHaveValue("2,00");
  await expect(page.locator('#factorChips button[data-factor="200"]')).toHaveClass(/on/);
});

test("ein abgewaehlter Platz verschwindet aus dem Foerderchat", async ({ page }) => {
  // Stufe 40 ist hoch genug, dass auch P5 noch eine Belohnung abwirft.
  await page.fill("#level", "40");
  await page.locator("#level").blur();
  await page.fill("#playerName", "Dani");
  await expect(page.locator("#chatPlain")).toHaveText(/Dani .* P5 P4 P3 P2 P1$/);

  await page.locator('#rows input[data-slot="4"]').uncheck();
  await expect(page.locator("#chatPlain")).toHaveText(/Dani .* P4 P3 P2 P1$/);
  await expect(page.locator("#rows tr").nth(4)).toHaveClass(/off/);
});

test("der Foerderchat nennt auf Wunsch die Einzahlungen", async ({ page }) => {
  await page.fill("#level", "40");
  await page.locator("#level").blur();
  await page.fill("#playerName", "Dani");
  await expect(page.locator("#chatPoints")).toHaveText(/P5\(\d+\) P4\(\d+\) P3\(\d+\) P2\(\d+\) P1\(\d+\)$/);
});

test("das Theme laesst sich wechseln und ueberlebt einen Neuladen", async ({ page }) => {
  await page.click('.modes button[data-mode="light"]');
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator('.modes button[data-mode="light"]')).toHaveAttribute("aria-pressed", "true");
});

test("Bauwerk, Stufe und Name ueberleben einen Neuladen", async ({ page }) => {
  await page.selectOption("#building", "Notre_Dame");
  await page.fill("#level", "63");
  await page.locator("#level").blur();
  await page.fill("#playerName", "Testspielerin");
  await expect(page.locator("#chatPlain")).toContainText("Testspielerin");

  await page.reload();
  await expect(page.locator("#building")).toHaveValue("Notre_Dame");
  await expect(page.locator("#level")).toHaveValue("63");
  await expect(page.locator("#playerName")).toHaveValue("Testspielerin");
});

test("fehlende Daten fuehren zur Eingabeaufforderung, eigene Werte rechnen weiter", async ({ page }) => {
  // Der Leerzustand braucht ein Bauwerk ohne Kosten und ohne Kurve. Statt
  // auf eine Luecke im echten Datensatz zu hoffen, liefern die Testdaten
  // eines mit.
  await mitTestdaten(page);
  await page.goto("/index.html");
  await page.selectOption("#building", OHNE_DATEN);
  await page.fill("#level", "20");
  await page.locator("#level").blur();

  await expect(page.locator("td.empty")).toBeVisible();
  await expect(page.locator("#inputTotal")).toBeVisible();
  await expect(page.locator("#inputP1")).toBeVisible();

  await page.fill("#inputTotal", "2500");
  await page.fill("#inputP1", "300");
  await page.click("#applyInput");

  await expect(page.locator("td.empty")).toHaveCount(0);
  await expect(page.locator("#rows tr")).toHaveCount(5);
  await expect(page.locator(".note.man")).toContainText("Gesamt und P1");

  // Eine hoehere Stufe wird aus dem Eintrag hochgerechnet
  await page.fill("#level", "25");
  await page.locator("#level").blur();
  await expect(page.locator(".note")).toContainText("aus deinem Eintrag auf Stufe 20 hochgerechnet");

  // Zuruecksetzen raeumt den Eintrag wieder weg
  await page.fill("#level", "20");
  await page.locator("#level").blur();
  await page.click("#resetInput");
  await expect(page.locator("td.empty")).toBeVisible();
});

test("ein widerspruechlicher Wiki-Wert bittet um Bestaetigung, nicht um Rettung", async ({ page }) => {
  // Stufe 84 des Observatoriums: Die Kosten stehen fest, nur die P1-Angaben
  // des Wikis widersprechen sich. Der Plan rechnet trotzdem mit dem Wert,
  // der zur Kurve passt — der Kasten darf also nicht warnen.
  await page.selectOption("#building", "Observatory");
  await page.fill("#level", "84");
  await page.locator("#level").blur();

  await expect(page.locator("#rows tr")).toHaveCount(5);
  await expect(page.locator("td.empty")).toHaveCount(0);

  const note = page.locator(".note.chk");
  await expect(note).toContainText("mehr als eine Zahl");
  await expect(page.locator("#inputTotal")).toHaveCount(0);
  await expect(page.locator("#inputP1")).toHaveValue("890");
  await expect(page.locator("#applyInput")).toHaveText("Bestätigen");

  // Bestaetigen heisst: einmal antippen, und der Hinweis ist erledigt.
  await page.click("#applyInput");
  await expect(page.locator(".note.chk")).toHaveCount(0);
  await expect(page.locator(".note.man")).toContainText("P1");
});

test("ein wackliges Zeitalter sagt, wie weit es danebenliegen kann", async ({ page }) => {
  // Gegenstueck zur Bronzezeit: die Virtuelle Zukunft verfehlt im
  // Ausblendtest etliche Stufen deutlich. Über der Wiki-Grenze steht darum
  // eine Zeile — eine Zeile, kein Kasten, und die Gesamtkosten kommen nicht
  // vor: die Kostenformel ist geprueft.
  await page.selectOption("#building", "Terracotta_Army");
  await page.fill("#level", "210");
  await page.locator("#level").blur();

  const note = page.locator(".note.quiet");
  await expect(note).toContainText("hochgerechnet");
  await expect(note).toContainText(/bis auf \d+ FP genau/);
  await expect(note).not.toContainText("Gesamt");
  await expect(page.locator(".note.chk")).toHaveCount(0);

  // Das Feld ist da, es draengt sich nur nicht auf.
  await expect(page.locator("#inputP1")).toBeHidden();
  await page.click("#noteReveal");
  await expect(page.locator("#inputP1")).toBeVisible();
  await expect(page.locator("#inputP1")).toHaveValue("4980");
  await expect(page.locator("#inputTotal")).toHaveCount(0);

  await page.click("#applyInput");
  await expect(page.locator(".note.quiet")).toHaveCount(0);
  await expect(page.locator(".note.man")).toContainText("P1");
});

test("eine ungueltige P1-Eingabe wird abgelehnt", async ({ page }) => {
  await mitTestdaten(page);
  await page.goto("/index.html");
  await page.selectOption("#building", OHNE_DATEN);
  await page.fill("#level", "20");
  await page.locator("#level").blur();

  await page.fill("#inputTotal", "2500");
  await page.fill("#inputP1", "302"); // nicht durch 5 teilbar
  await page.click("#applyInput");

  await expect(page.locator("#inputP1")).toBeFocused();
  await expect(page.locator("td.empty")).toBeVisible();
});

test("der Kopierknopf quittiert den Kopiervorgang", async ({ page, context, browserName }) => {
  test.skip(browserName !== "chromium", "Zwischenablage-Rechte gibt es hier nur in Chromium");
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);

  await page.fill("#playerName", "Dani");
  const expected = await page.locator("#chatPlain").textContent();

  const button = page.locator('button[data-copy="chatPlain"]');
  await button.click();
  await expect(button).toHaveText("Kopiert");

  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toBe(expected);

  await expect(button).toHaveText("Nur Plätze kopieren", { timeout: 3000 });
});

test.describe("Datum der Datenquelle", () => {
  // Ein ISO-Datum ueber new Date("2026-09-19") gelesen ist UTC-Mitternacht —
  // westlich von Greenwich stand dann der Vortag im Fuss. Der Test laeuft
  // darum in einer Zeitzone, in der das sichtbar wuerde.
  test.use({ timezoneId: "America/Los_Angeles" });

  test("wird auch westlich von Greenwich nicht zum Vortag", async ({ page }) => {
    // Erwartet wird das Datum des Datensatzes, nicht ein festes. Frueher
    // stand hier "19.9.2026" — der damalige Stand als Sollwert, den jeder
    // Importlauf gebrochen haette. Geprueft gehoert die Zeitzone, nicht der
    // Tag: die Ziffern kommen darum aus derselben Quelle wie in der
    // Anwendung, nur die Umrechnung wird nachgestellt.
    const [jahr, monat, tag] = DATA.generated.split("-").map(Number);
    const erwartet = `${tag}.${monat}.${jahr}`;

    await page.goto("/index.html");
    await expect(page.locator("#dataDate")).toHaveText(erwartet);
  });
});

test.describe("Stufen-Stepper an den Grenzen", () => {
  test("bei Stufe 1 ist Minus aus, beim Maximum Plus", async ({ page }) => {
    await page.goto("/index.html");
    await page.selectOption("#building", "Tower_of_Babel");

    await page.fill("#level", "1");
    await page.locator("#level").blur();
    await expect(page.locator("#levelDown")).toBeDisabled();
    await expect(page.locator("#levelUp")).toBeEnabled();

    // Die Grenze ist nicht mehr die dokumentierte Stufe des Bauwerks,
    // sondern der Schutzwert des Feldes.
    await page.fill("#level", "200");
    await page.locator("#level").blur();
    await expect(page.locator("#levelUp")).toBeEnabled();

    await page.fill("#level", "1000");
    await page.locator("#level").blur();
    await expect(page.locator("#levelUp")).toBeDisabled();
    await expect(page.locator("#levelDown")).toBeEnabled();
  });

  test("ueber der dokumentierten Stufe rechnet cipher weiter", async ({ page }) => {
    await page.goto("/index.html");
    await page.selectOption("#building", "Statue_of_Zeus");

    // Stufe 202 gibt es im Wiki nicht mehr — im Spiel schon.
    await page.fill("#level", "202");
    await page.locator("#level").blur();
    await expect(page.locator("#level")).toHaveValue("202");

    await expect(page.locator("td.empty")).toHaveCount(0);
    await expect(page.locator("#rows tr")).toHaveCount(5);
    await expect(page.locator("#sumTotal")).toHaveText("58.419");

    // Die Kurve der Bronzezeit besteht den Ausblendtest ohne Fehlschuss:
    // hier ist nichts zu beteuern, der Plan steht einfach da.
    await expect(page.locator("#note .note")).toHaveCount(0);
  });

  test("in der Lesart „aktuell“ gilt die Grenze bei angezeigter Stufe 0", async ({ page }) => {
    await page.goto("/index.html");
    await page.locator('#levelMode button[data-level-mode="current"]').click();
    await page.fill("#level", "0");
    await page.locator("#level").blur();
    await expect(page.locator("#level")).toHaveValue("0");
    await expect(page.locator("#levelDown")).toBeDisabled();
  });
});
