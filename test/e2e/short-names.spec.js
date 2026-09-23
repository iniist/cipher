/**
 * Browsertests fuer selbst vergebene Kuerzel.
 *
 * Der Datensatz bringt je Bauwerk ein `short` mit, unstrittig verkuerzt:
 * "Leuchtturm von Alexandria" wird zu "Leuchtturm". Was eine Gilde daraus
 * macht, ist es nicht — "AO" fuer die Arktische Orangerie versteht die eine
 * Runde sofort und die naechste gar nicht. Darum laesst sich das Kuerzel je
 * Bauwerk selbst setzen; leer heisst "das aus dem Datensatz".
 */
const { test, expect } = require("@playwright/test");

const feld = (page) => page.locator("#buildingShort");
const chat = (page) => page.locator("#chatPlain");
const merken = (page) => page.locator("#favSaveText");
const gespeichert = (page) =>
  page.evaluate(() => localStorage.getItem("cipher:shorts"));

/** Arktische Orangerie mit einem Namen davor — die Lage aus dem Beispiel. */
async function orangerie(page) {
  await page.goto("/index.html");
  await page.selectOption("#building", "Arctic_Orangery");
  await page.fill("#playerName", "Dani");
}

test.describe("Ohne eigenes Kuerzel", () => {
  test("gilt ueberall der Name aus dem Datensatz", async ({ page }) => {
    await orangerie(page);
    await expect(chat(page)).toContainText("Dani Orangerie");
    await expect(merken(page)).toContainText("Orangerie · Stufe");
  });

  test("steht die Vorgabe als Platzhalter im leeren Feld", async ({ page }) => {
    await orangerie(page);
    await expect(feld(page)).toHaveValue("");
    await expect(feld(page)).toHaveAttribute("placeholder", "Orangerie");
  });

  test("legt der blosse Aufruf keinen Speicher an", async ({ page }) => {
    await orangerie(page);
    expect(await gespeichert(page)).toBe(null);
  });
});

test.describe("Ein Kuerzel vergeben", () => {
  test("wirkt es in der Chat-Zeile und am Merken-Knopf", async ({ page }) => {
    await orangerie(page);
    await feld(page).fill("AO");

    await expect(chat(page)).toContainText("Dani AO");
    await expect(chat(page)).not.toContainText("Orangerie");
    await expect(merken(page)).toContainText("AO · Stufe");
    expect(JSON.parse(await gespeichert(page))).toEqual({ Arctic_Orangery: "AO" });
  });

  test("wirkt es auf dem Favoriten-Chip", async ({ page }) => {
    await orangerie(page);
    await feld(page).fill("AO");
    await page.click("#favSave");

    await expect(page.locator("#favList li").first()).toContainText("AO");
  });

  test("wirkt es auf dem Eintrag in der Sammlung", async ({ page }) => {
    await orangerie(page);
    await feld(page).fill("AO");
    await page.click('[data-copy="chatPlain"]');

    await expect(page.locator(".coll-del").first())
      .toHaveAttribute("aria-label", "AO aus der Sammlung entfernen");
  });

  test("gilt es nur fuer dieses eine Bauwerk", async ({ page }) => {
    await orangerie(page);
    await feld(page).fill("AO");

    await page.selectOption("#building", "Temple_of_Relics");
    await expect(feld(page)).toHaveValue("");
    await expect(feld(page)).toHaveAttribute("placeholder", "Relikttempel");
    await expect(chat(page)).toContainText("Dani Relikttempel");

    await feld(page).fill("RT");
    await page.selectOption("#building", "Arctic_Orangery");
    await expect(feld(page)).toHaveValue("AO");
    expect(JSON.parse(await gespeichert(page)))
      .toEqual({ Arctic_Orangery: "AO", Temple_of_Relics: "RT" });
  });

  test("ueberdauert es das Neuladen", async ({ page }) => {
    await orangerie(page);
    await feld(page).fill("AO");
    await page.reload();

    await expect(feld(page)).toHaveValue("AO");
    await expect(chat(page)).toContainText("Dani AO");
  });
});

test.describe("Zuruecknehmen", () => {
  test("leeren stellt die Vorgabe wieder her und raeumt den Speicher", async ({ page }) => {
    await orangerie(page);
    await feld(page).fill("AO");
    await feld(page).fill("");

    await expect(feld(page)).toHaveAttribute("placeholder", "Orangerie");
    await expect(chat(page)).toContainText("Dani Orangerie");
    // Kein leerer Schluessel bleibt stehen.
    expect(await gespeichert(page)).toBe(null);
  });

  test("zaehlen blosse Leerzeichen als leer", async ({ page }) => {
    await orangerie(page);
    await feld(page).fill("   ");

    await expect(chat(page)).toContainText("Dani Orangerie");
    expect(await gespeichert(page)).toBe(null);
    // Und beim Verlassen steht wieder da, was wirklich gespeichert ist.
    await feld(page).blur();
    await expect(feld(page)).toHaveValue("");
  });

  test("raeumt der Knopf auf der Datenschutzseite die Kuerzel mit weg", async ({ page }) => {
    await orangerie(page);
    await feld(page).fill("AO");

    await page.goto("/datenschutz.html");
    await page.click("#wipe");
    await expect(page.locator("#wipeResult")).toContainText("gelöscht");
    expect(await gespeichert(page)).toBe(null);
  });
});

test.describe("Kaputtes im Speicher", () => {
  test("werden unbekannte Bauwerke und leere Werte ausgesiebt", async ({ page }) => {
    await page.goto("/index.html");
    await page.evaluate(() => localStorage.setItem("cipher:shorts", JSON.stringify({
      Arctic_Orangery: "AO",
      Gibt_Es_Nicht: "XX",
      Temple_of_Relics: "   ",
      The_Arc: 42
    })));
    await page.reload();

    await page.selectOption("#building", "Arctic_Orangery");
    await expect(feld(page)).toHaveValue("AO");
    await page.selectOption("#building", "Temple_of_Relics");
    await expect(feld(page)).toHaveValue("");
    await page.selectOption("#building", "The_Arc");
    await expect(feld(page)).toHaveValue("");
  });

  test("wird ein zu langes Kuerzel gekappt", async ({ page }) => {
    await page.goto("/index.html");
    await page.evaluate(() => localStorage.setItem("cipher:shorts", JSON.stringify({
      Arctic_Orangery: "A".repeat(80)
    })));
    await page.reload();
    await page.selectOption("#building", "Arctic_Orangery");

    expect((await feld(page).inputValue()).length).toBe(24);
  });
});

test.describe("Die Suche kennt das Kuerzel", () => {
  test("findet sie das Bauwerk darueber", async ({ page }) => {
    await orangerie(page);
    await feld(page).fill("AO");
    await page.fill("#buildingFilter", "AO");

    await expect(page.locator("#filterResults li").first()).toContainText("Arktische Orangerie");
  });

  test("nennt der Treffer das Kuerzel, weil es im Namen nicht vorkommt", async ({ page }) => {
    // Sonst stuende der Treffer ohne Begruendung da — dieselbe Sorge wie bei
    // den Zeitalter-Treffern, wo "ho" den Markusdom findet.
    await orangerie(page);
    await feld(page).fill("AO");
    await page.fill("#buildingFilter", "AO");

    await expect(page.locator("#filterResults li").first().locator("mark")).toHaveText("AO");
  });

  test("bleibt ein Namenstreffer im Namen hervorgehoben", async ({ page }) => {
    await orangerie(page);
    await feld(page).fill("AO");
    await page.fill("#buildingFilter", "orangerie");

    const treffer = page.locator("#filterResults li").first();
    await expect(treffer.locator("b mark")).toHaveText("Orangerie");
    await expect(treffer.locator("span mark")).toHaveCount(0);
  });
});

test("das Feld traegt eine Beschriftung", async ({ page }) => {
  await page.goto("/index.html");
  // Sichtbar kurz, fuer Screenreader vollstaendig.
  await expect(page.locator('label[for="buildingShort"]')).toContainText("Im Chat als");
  await expect(feld(page)).toHaveAccessibleName(/eigener Name für das gewählte Bauwerk/);
});
