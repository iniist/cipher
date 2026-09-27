/**
 * Browsertests fuer den Umzug von cipher-calc.netlify.app auf die eigene
 * Domain.
 *
 * Die alte Adresse beantwortet jeden Pfad mit umzug.html (netlify.toml).
 * Deren Skript nimmt den localStorage im Link mit, app.js uebernimmt ihn auf
 * der neuen Adresse. Hier laeuft beides auf localhost; der Sprung zur neuen
 * Domain wird abgefangen und nur seine Adresse gelesen.
 */
const { test, expect } = require("@playwright/test");

const NEU = "https://foe-foerderrechner.com";

const STAND = {
  "cipher:state": JSON.stringify({ building: "The_Arc", level: 80, factor: 195, name: "Umzug", theme: "light" }),
  "cipher:favorites": JSON.stringify([{ id: "The_Arc", level: 80 }]),
  "cipher:totals": JSON.stringify({ "The_Arc:80": 12345 })
};

/** Den Sprung zur neuen Domain abfangen, statt ihn ins Netz zu schicken. */
async function neueDomainAbfangen(page) {
  await page.route(NEU + "/**", (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: "<!DOCTYPE html><title>neu</title>" }));
}

/** Den Speicher auf localhost setzen, wie er unter der alten Adresse stuende. */
async function speicherSetzen(page, eintraege) {
  await page.goto("/impressum.html");
  await page.evaluate((werte) => {
    localStorage.clear();
    for (const [key, value] of Object.entries(werte)) localStorage.setItem(key, value);
  }, eintraege);
}

/** Die Umzugsseite oeffnen und die Adresse zurueckgeben, zu der sie springt. */
async function umziehen(page) {
  await neueDomainAbfangen(page);
  await page.goto("/umzug.html");
  await page.waitForURL(NEU + "/**");
  return new URL(page.url());
}

function anhang(ziel) {
  const match = /^#umzug=(.*)$/.exec(ziel.hash);
  return match ? JSON.parse(decodeURIComponent(match[1])) : null;
}

test.describe("Die alte Adresse", () => {
  test("nimmt die cipher-Eintraege mit, und nur die", async ({ page }) => {
    await speicherSetzen(page, { ...STAND, "fremd": "gehoert nicht zu cipher", "lgr-t": "{}" });
    const ziel = await umziehen(page);

    expect(ziel.origin).toBe(NEU);
    expect(ziel.pathname).toBe("/");
    const mitgenommen = anhang(ziel);
    expect(mitgenommen.v).toBe(1);
    expect(Object.keys(mitgenommen.d).sort()).toEqual([...Object.keys(STAND), "lgr-t"].sort());
    expect(mitgenommen.d["cipher:state"]).toBe(STAND["cipher:state"]);
  });

  test("leitet ohne Anhang weiter, wenn nichts gespeichert ist", async ({ page }) => {
    await speicherSetzen(page, {});
    const ziel = await umziehen(page);
    expect(ziel.origin).toBe(NEU);
    expect(ziel.hash).toBe("");
  });

  test("steht nicht im Suchindex und nennt die neue Adresse", async ({ request }) => {
    const response = await request.get("/umzug.html");
    expect(response.headers()["x-robots-tag"]).toBe("noindex");
    const html = await response.text();
    expect(html).toContain('<link rel="canonical" href="https://foe-foerderrechner.com/">');
    expect(html).toContain('href="https://foe-foerderrechner.com/"');
  });
});

test.describe("Die neue Adresse", () => {
  test("uebernimmt den mitgebrachten Stand und raeumt die Adresse auf", async ({ page }) => {
    await speicherSetzen(page, STAND);
    const ziel = await umziehen(page);

    // Jetzt "auf der neuen Adresse": leerer Speicher, derselbe Anhang.
    await page.unrouteAll();
    await speicherSetzen(page, {});
    await page.goto("/index.html" + ziel.hash);

    await expect(page.locator("#playerName")).toHaveValue("Umzug");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect(page.locator("#favList li")).toHaveCount(1);
    await expect(page.locator(".toast")).toContainText("übernommen");
    expect(new URL(page.url()).hash).toBe("");
  });

  test("ueberschreibt nichts, was hier schon steht", async ({ page }) => {
    await speicherSetzen(page, { "cipher:state": JSON.stringify({ name: "Schon hier" }) });
    const mitgebracht = encodeURIComponent(JSON.stringify({ v: 1, d: STAND }));
    await page.goto("/index.html#umzug=" + mitgebracht);

    await expect(page.locator("#playerName")).toHaveValue("Schon hier");
    // Was hier noch fehlte, kommt trotzdem dazu.
    await expect(page.locator("#favList li")).toHaveCount(1);
  });

  test("nimmt nur bekannte Schluessel mit lesbarem Inhalt", async ({ page }) => {
    await speicherSetzen(page, {});
    const mitgebracht = encodeURIComponent(JSON.stringify({
      v: 1,
      d: { "boese": "\"x\"", "cipher:totals": "{kaputt", "cipher:p1": JSON.stringify({ "The_Arc:80": 900 }) }
    }));
    await page.goto("/index.html#umzug=" + mitgebracht);

    const gespeichert = await page.evaluate(() => ({
      boese: localStorage.getItem("boese"),
      totals: localStorage.getItem("cipher:totals"),
      p1: localStorage.getItem("cipher:p1")
    }));
    expect(gespeichert.boese).toBeNull();
    expect(gespeichert.totals).toBeNull();
    expect(JSON.parse(gespeichert.p1)).toEqual({ "The_Arc:80": 900 });
  });

  test("ein kaputter Anhang schadet nicht", async ({ page }) => {
    await speicherSetzen(page, {});
    await page.goto("/index.html#umzug=%E0%A4%A");
    await expect(page.locator("#rows tr")).toHaveCount(5);
    await expect(page.locator(".toast")).toHaveCount(0);
    expect(new URL(page.url()).hash).toBe("");
  });
});
