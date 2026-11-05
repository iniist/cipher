/**
 * Browsertests fuer den Weltenumschalter.
 *
 * Das Wichtigste zuerst: wer schon Daten hat, verliert beim Umschalten
 * nichts. Die erste Welt behaelt die alten Schluessel, jede weitere bekommt
 * eigene unter "cipher:w:<welt>:".
 */
const { test, expect } = require("@playwright/test");
const { nameEintragen, themaWaehlen } = require("./menue");

/** Ein Stand, wie er vor den Welten im Speicher lag. */
const ALTBESTAND = {
  "cipher:state": JSON.stringify({ building: "Notre_Dame", level: 42, factor: 195, name: "Dani", theme: "light" }),
  "cipher:favorites": JSON.stringify([{ id: "Notre_Dame", level: 42 }]),
  "cipher:collection": JSON.stringify([])
};

async function altbestandLaden(page) {
  await page.goto("/index.html");
  await page.evaluate((werte) => {
    localStorage.clear();
    Object.keys(werte).forEach((key) => localStorage.setItem(key, werte[key]));
  }, ALTBESTAND);
  await page.reload();
}

async function weltWaehlen(page, name) {
  await page.click("#worldPick");
  await expect(page.locator("#worlds")).toBeVisible();
  await page.locator(".world-opt", { hasText: name }).click();
  // Ein Wechsel laedt neu; der Name steht erst danach im Knopf.
  await expect(page.locator("#worldName")).toHaveText(name);
}

const speicher = (page, key) => page.evaluate((k) => localStorage.getItem(k), key);

test("ohne Wahl bleibt alles wie vorher und nichts wird gespeichert", async ({ page }) => {
  await page.goto("/index.html");
  await expect(page.locator("#worldName")).toHaveText("Server");
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);
});

test("die Liste bietet alle 24 deutschen Welten an", async ({ page }) => {
  await page.goto("/index.html");
  await page.click("#worldPick");
  await expect(page.locator(".world-opt")).toHaveCount(24);
  await expect(page.locator(".world-opt").first()).toContainText("Arvahall");
  await expect(page.locator(".world-opt").last()).toContainText("Yorkton");
  await page.click("#worldsClose");
  await expect(page.locator("#worlds")).toBeHidden();
  await expect(page.locator("#worldPick")).toBeFocused();
});

test("die erste Wahl benennt den Altbestand, ohne ihn anzufassen", async ({ page }) => {
  await altbestandLaden(page);
  await weltWaehlen(page, "Brisgard");

  expect(JSON.parse(await speicher(page, "cipher:world"))).toEqual({ home: "de2", active: "de2" });
  for (const key of Object.keys(ALTBESTAND)) {
    expect(await speicher(page, key)).toBe(ALTBESTAND[key]);
  }
  await expect(page.locator("#building")).toHaveValue("Notre_Dame");
  await expect(page.locator("#favList li")).toHaveCount(1);
});

test("eine zweite Welt faengt leer an und laesst die erste in Ruhe", async ({ page }) => {
  await altbestandLaden(page);
  await weltWaehlen(page, "Brisgard");
  await weltWaehlen(page, "Greifental");

  // Eigener Stand: Voreinstellungen, keine Favoriten — Name und Theme gelten ueberall.
  await expect(page.locator("#building")).toHaveValue("The_Arc");
  await expect(page.locator("#level")).toHaveValue("10");
  await expect(page.locator("#favList li")).toHaveCount(0);
  await expect(page.locator("#playerName")).toHaveValue("Dani");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  await page.fill("#level", "77");
  await page.locator("#level").blur();
  await page.click("#favSave");
  await expect(page.locator("#favList li")).toHaveCount(1);

  expect(JSON.parse(await speicher(page, "cipher:w:de7:state"))).toMatchObject({ building: "The_Arc", level: 77 });
  expect(JSON.parse(await speicher(page, "cipher:w:de7:favorites"))).toEqual([{ id: "The_Arc", level: 77 }]);
  // Die erste Welt ist unberuehrt.
  expect(await speicher(page, "cipher:favorites")).toBe(ALTBESTAND["cipher:favorites"]);
  expect(JSON.parse(await speicher(page, "cipher:state"))).toMatchObject({ building: "Notre_Dame", level: 42, factor: 195 });

  // Zurueck: alles wieder da.
  await weltWaehlen(page, "Brisgard");
  await expect(page.locator("#building")).toHaveValue("Notre_Dame");
  await expect(page.locator("#level")).toHaveValue("42");
  await expect(page.locator("#favList li")).toHaveCount(1);
  await expect(page.locator(".fav-go").first()).toContainText("42");

  // Und wieder hin: der Stand dort ist geblieben.
  await weltWaehlen(page, "Greifental");
  await expect(page.locator("#level")).toHaveValue("77");
});

test("Name und Theme gelten in allen Welten", async ({ page }) => {
  await altbestandLaden(page);
  await weltWaehlen(page, "Arvahall");
  await weltWaehlen(page, "Xyr");

  await nameEintragen(page, "Neuer Name");
  await themaWaehlen(page, "contrast");

  await weltWaehlen(page, "Arvahall");
  await expect(page.locator("#playerName")).toHaveValue("Neuer Name");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "contrast");
  // Nur Allgemeines geaendert: die Welt Xyr hat dafuer nichts eigenes angelegt.
  expect(await speicher(page, "cipher:w:de23:state")).toBeNull();
  expect(JSON.parse(await speicher(page, "cipher:state"))).toMatchObject({ name: "Neuer Name", theme: "contrast", level: 42 });
});

test("genutzte Welten sind in der Liste markiert", async ({ page }) => {
  await altbestandLaden(page);
  await weltWaehlen(page, "Brisgard");
  await weltWaehlen(page, "Korch");
  await page.click("#favSave");

  await page.click("#worldPick");
  await expect(page.locator(".world-opt", { hasText: "Korch" })).toHaveAttribute("aria-current", "true");
  await expect(page.locator(".world-opt", { hasText: "Brisgard" })).toContainText("genutzt");
  await expect(page.locator(".world-opt", { hasText: "Arvahall" })).not.toContainText("genutzt");
});

test("der Loeschknopf nimmt auch die Welten mit", async ({ page }) => {
  await altbestandLaden(page);
  await weltWaehlen(page, "Brisgard");
  await weltWaehlen(page, "Korch");
  await page.click("#favSave");

  await page.goto("/datenschutz.html");
  await page.click("#wipe");
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);
});

test.describe("Umbenennen", () => {
  test("die erste Welt bekommt nur einen anderen Namen, die Daten bleiben liegen", async ({ page }) => {
    await altbestandLaden(page);
    await weltWaehlen(page, "Brisgard");

    await page.click("#worldPick");
    await page.click("#worldRename");
    await expect(page.locator("#worldsTitle")).toHaveText("Welt umbenennen");
    // Die offene Welt selbst steht nicht zur Wahl.
    await expect(page.locator(".world-opt", { hasText: "Brisgard" })).toBeDisabled();
    await page.locator(".world-opt", { hasText: "Cirgard" }).click();

    await expect(page.locator("#worldName")).toHaveText("Cirgard");
    expect(JSON.parse(await speicher(page, "cipher:world"))).toEqual({ home: "de3", active: "de3" });
    for (const key of Object.keys(ALTBESTAND)) {
      expect(await speicher(page, key)).toBe(ALTBESTAND[key]);
    }
  });

  test("eine weitere Welt zieht mit ihren Eintraegen um", async ({ page }) => {
    await altbestandLaden(page);
    await weltWaehlen(page, "Brisgard");
    await weltWaehlen(page, "Korch");
    await page.fill("#level", "66");
    await page.locator("#level").blur();
    await page.click("#favSave");

    await page.click("#worldPick");
    await page.click("#worldRename");
    // Schon genutzte Welten sind gesperrt: dort liegt ein eigener Stand.
    await expect(page.locator(".world-opt", { hasText: "Brisgard" })).toBeDisabled();
    await page.locator(".world-opt", { hasText: "Langendorn" }).click();

    await expect(page.locator("#worldName")).toHaveText("Langendorn");
    await expect(page.locator("#level")).toHaveValue("66");
    await expect(page.locator("#favList li")).toHaveCount(1);
    const keys = await page.evaluate(() => Object.keys(localStorage).sort());
    expect(keys.some((key) => key.startsWith("cipher:w:de10:"))).toBe(false);
    expect(keys).toContain("cipher:w:de11:state");
    expect(keys).toContain("cipher:w:de11:favorites");
    expect(JSON.parse(await speicher(page, "cipher:world"))).toEqual({ home: "de2", active: "de11" });
    // Die erste Welt bleibt, wie sie war.
    expect(await speicher(page, "cipher:favorites")).toBe(ALTBESTAND["cipher:favorites"]);
  });

  test("ohne gewaehlte Welt gibt es nichts umzubenennen", async ({ page }) => {
    await page.goto("/index.html");
    await page.click("#worldPick");
    await expect(page.locator("#worldRename")).toBeHidden();
  });

  test("ein zweiter Klick bricht das Umbenennen ab", async ({ page }) => {
    await altbestandLaden(page);
    await weltWaehlen(page, "Brisgard");
    await page.click("#worldPick");
    await page.click("#worldRename");
    await page.click("#worldRename");
    await expect(page.locator("#worldsTitle")).toHaveText("Welt wählen");
    await expect(page.locator(".world-opt:disabled")).toHaveCount(0);
  });
});

test.describe("Abwaehlen", () => {
  test("ohne gewaehlte Welt gibt es nichts abzuwaehlen", async ({ page }) => {
    await page.goto("/index.html");
    await page.click("#worldPick");
    await expect(page.locator("#worldLeave")).toBeHidden();
  });

  test("die erste Welt verliert nur ihren Namen und bekommt ihn zurueck", async ({ page }) => {
    await altbestandLaden(page);
    await weltWaehlen(page, "Brisgard");

    await page.click("#worldPick");
    await page.click("#worldLeave");
    await expect(page.locator("#worlds")).toBeHidden();
    await expect(page.locator("#worldName")).toHaveText("Server");
    expect(JSON.parse(await speicher(page, "cipher:world"))).toEqual({ home: "de2", active: null });
    // Nichts geloescht, nichts verschoben.
    for (const key of Object.keys(ALTBESTAND)) {
      expect(await speicher(page, key)).toBe(ALTBESTAND[key]);
    }
    await expect(page.locator("#building")).toHaveValue("Notre_Dame");

    // Auch nach einem Neustart bleibt es beim Stand ohne Welt.
    await page.reload();
    await expect(page.locator("#worldName")).toHaveText("Server");
    await page.click("#worldPick");
    await expect(page.locator(".world-opt[aria-current]")).toHaveCount(0);
    await expect(page.locator("#worldRename")).toBeHidden();
    await expect(page.locator(".world-opt", { hasText: "Brisgard" })).toContainText("genutzt");
    await page.click("#worldsClose");

    await weltWaehlen(page, "Brisgard");
    expect(JSON.parse(await speicher(page, "cipher:world"))).toEqual({ home: "de2", active: "de2" });
    await expect(page.locator("#favList li")).toHaveCount(1);
  });

  test("eine weitere Welt behaelt ihren Stand, auch wenn sie abgewaehlt wird", async ({ page }) => {
    await altbestandLaden(page);
    await weltWaehlen(page, "Brisgard");
    await weltWaehlen(page, "Korch");
    await page.fill("#level", "66");
    await page.locator("#level").blur();
    await page.click("#favSave");

    await page.click("#worldPick");
    await page.click("#worldLeave");
    await expect(page.locator("#worldName")).toHaveText("Server");
    // Ohne Welt liegt der Stand ohne Namen offen — der der ersten Welt.
    await expect(page.locator("#building")).toHaveValue("Notre_Dame");
    expect(await speicher(page, "cipher:w:de10:favorites")).not.toBeNull();

    await weltWaehlen(page, "Korch");
    await expect(page.locator("#level")).toHaveValue("66");
    await expect(page.locator("#favList li")).toHaveCount(1);
  });

  test("beim Umbenennen steht Abwaehlen nicht zur Wahl", async ({ page }) => {
    await altbestandLaden(page);
    await weltWaehlen(page, "Brisgard");
    await page.click("#worldPick");
    await expect(page.locator("#worldLeave")).toBeVisible();
    await page.click("#worldRename");
    await expect(page.locator("#worldLeave")).toBeHidden();
  });
});
