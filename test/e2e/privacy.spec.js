/**
 * Browsertests zu Datenschutz, Rechtstexten und Barrierefreiheit.
 * Der wichtigste Test hier ist der erste: cipher darf keine einzige
 * Anfrage an einen fremden Host stellen.
 */
const { test, expect } = require("@playwright/test");

const PAGES = ["/index.html", "/impressum.html", "/datenschutz.html"];

test.describe("keine externen Anfragen", () => {
  for (const path of PAGES) {
    test(`${path} laedt ausschliesslich vom eigenen Host`, async ({ page, baseURL }) => {
      const foreign = [];
      page.on("request", (request) => {
        const url = request.url();
        if (!url.startsWith(baseURL) && !url.startsWith("data:") && !url.startsWith("blob:")) {
          foreign.push(url);
        }
      });

      await page.goto(path, { waitUntil: "networkidle" });
      // Etwas herumklicken, damit auch spaet nachgeladene Dinge auffallen
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(300);

      expect(foreign, `fremde Anfragen: ${foreign.join(", ")}`).toEqual([]);
    });
  }
});

test("es werden keine Cookies gesetzt", async ({ page, context }) => {
  await page.goto("/index.html");
  await page.fill("#playerName", "Dani");
  await page.click("#favSave");
  expect(await context.cookies()).toEqual([]);
});

test("die Schrift kommt aus dem eigenen Verzeichnis", async ({ page, baseURL }) => {
  const fontRequests = [];
  page.on("request", (request) => {
    if (request.resourceType() === "font") fontRequests.push(request.url());
  });

  await page.goto("/index.html", { waitUntil: "networkidle" });

  expect(fontRequests.length).toBeGreaterThan(0);
  for (const url of fontRequests) {
    expect(url.startsWith(`${baseURL}/fonts/`)).toBe(true);
    expect(url).toMatch(/\.woff2$/);
  }

  const family = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
  expect(family).toContain("Barlow Semi Condensed");
  const loaded = await page.evaluate(() => document.fonts.check('700 17px "Barlow Semi Condensed"'));
  expect(loaded).toBe(true);
});

test("cipher speichert nur unter eigenen Schluesseln", async ({ page }) => {
  await page.goto("/index.html");
  await page.fill("#playerName", "Dani");
  await page.click("#favSave");

  const keys = await page.evaluate(() => Object.keys(localStorage).sort());
  expect(keys.every((key) => key.startsWith("cipher:"))).toBe(true);
  expect(keys).toContain("cipher:state");
  expect(keys).toContain("cipher:favorites");
});

test("Daten des Vorgaengers werden einmalig uebernommen", async ({ page }) => {
  await page.goto("/index.html");
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("lgr-state", JSON.stringify({
      lg: "Notre_Dame", lvl: 55, f: 195, name: "Altbestand", off: [true, true, false, true, true], mode: "light"
    }));
    localStorage.setItem("lgr-t", JSON.stringify({ "Notre_Dame:55": 4321 }));
  });
  await page.reload();

  await expect(page.locator("#building")).toHaveValue("Notre_Dame");
  await expect(page.locator("#level")).toHaveValue("55");
  await expect(page.locator("#playerName")).toHaveValue("Altbestand");
  await expect(page.locator("#factorValue")).toHaveText("1,95");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator('#rows input[data-slot="2"]')).not.toBeChecked();
  await expect(page.locator(".note.man")).toContainText("Gesamt");

  const keys = await page.evaluate(() => Object.keys(localStorage));
  expect(keys.some((key) => key.startsWith("lgr-"))).toBe(false);
});

test("die Anwendung laeuft auch ohne nutzbaren localStorage", async ({ page }) => {
  await page.addInitScript(() => {
    const boom = () => { throw new Error("localStorage gesperrt"); };
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get: () => ({ getItem: boom, setItem: boom, removeItem: boom, clear: boom, key: boom, length: 0 })
    });
  });
  await page.goto("/index.html");

  await expect(page.locator("#rows tr")).toHaveCount(5);
  await page.click("#favSave");
  await expect(page.locator("#favList li")).toHaveCount(1);
  await page.click('.modes button[data-mode="light"]');
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test.describe("Rechtstexte", () => {
  test("der Haftungsausschluss steht auf der Startseite", async ({ page }) => {
    await page.goto("/index.html");
    const footer = page.locator(".site-foot");
    await expect(footer).toContainText("Ohne Gewähr");
    await expect(footer).toContainText("Haftung für Richtigkeit, Vollständigkeit und Aktualität ist ausgeschlossen");
  });

  test("der Fan-Hinweis steht auf der Startseite", async ({ page }) => {
    await page.goto("/index.html");
    const footer = page.locator(".site-foot");
    await expect(footer).toContainText("inoffizielles Fan-Projekt");
    await expect(footer).toContainText("keiner Verbindung zur InnoGames GmbH");
    await expect(footer).toContainText("Marken der InnoGames GmbH");
  });

  test("Impressum und Datenschutz sind von jeder Seite erreichbar", async ({ page }) => {
    for (const path of PAGES) {
      await page.goto(path);
      await expect(page.locator('.foot-links a[href="./impressum.html"]')).toBeVisible();
      await expect(page.locator('.foot-links a[href="./datenschutz.html"]')).toBeVisible();
    }
  });

  test("das Impressum nennt Anbieter, Kontakt und Fan-Status", async ({ page }) => {
    await page.goto("/impressum.html");
    await expect(page.locator("h1")).toHaveText("Impressum");
    await expect(page.locator("main")).toContainText("Daniel Scholz");
    await expect(page.locator("main")).toContainText("79111 Freiburg im Breisgau");
    await expect(page.locator('a[href^="mailto:"]')).toBeVisible();
    await expect(page.locator("main")).toContainText("§ 5 Digitale-Dienste-Gesetz");
    await expect(page.locator("main")).toContainText("keiner Verbindung zur InnoGames GmbH");
    await expect(page.locator("main")).toContainText("Haftungsausschluss und Gewährleistung");
  });

  test("die Datenschutzerklaerung beschreibt die lokale Speicherung", async ({ page }) => {
    await page.goto("/datenschutz.html");
    await expect(page.locator("h1")).toHaveText("Datenschutzerklärung");
    const main = page.locator("main");
    await expect(main).toContainText("keine Cookies");
    await expect(main).toContainText("cipher:favorites");
    await expect(main).toContainText("Verantwortlicher");
    await expect(main).toContainText("Server-Logfiles");
  });

  test("der Loeschknopf raeumt den lokalen Speicher auf", async ({ page }) => {
    await page.goto("/index.html");
    await page.fill("#playerName", "Dani");
    await page.click("#favSave");
    expect((await page.evaluate(() => Object.keys(localStorage))).length).toBeGreaterThan(0);

    await page.goto("/datenschutz.html");
    await page.click("#wipe");
    await expect(page.locator("#wipeResult")).toContainText("gelöscht");

    const leftovers = await page.evaluate(() =>
      Object.keys(localStorage).filter((key) => key.startsWith("cipher:") || key.startsWith("lgr-")));
    expect(leftovers).toEqual([]);

    // Zweiter Klick meldet sauber, dass nichts mehr da ist
    await page.click("#wipe");
    await expect(page.locator("#wipeResult")).toHaveText("Es war nichts gespeichert.");
  });

  test("externe Links oeffnen sicher und ohne Referrer", async ({ page }) => {
    for (const path of PAGES) {
      await page.goto(path);
      await expect(page.locator('meta[name="referrer"]')).toHaveAttribute("content", "no-referrer");

      const external = page.locator('a[href^="http"]');
      for (let i = 0; i < await external.count(); i++) {
        const link = external.nth(i);
        await expect(link).toHaveAttribute("target", "_blank");
        await expect(link).toHaveAttribute("rel", /noopener/);
        await expect(link).toHaveAttribute("rel", /noreferrer/);
      }
    }
  });
});

test.describe("Barrierefreiheit", () => {
  test("jede Seite hat genau eine H1 und eine Sprache", async ({ page }) => {
    for (const path of PAGES) {
      await page.goto(path);
      await expect(page.locator("html")).toHaveAttribute("lang", "de");
      await expect(page.locator("h1")).toHaveCount(1);
    }
  });

  test("alle Bedienelemente tragen eine Beschriftung", async ({ page }) => {
    await page.goto("/index.html");
    const unlabelled = await page.evaluate(() =>
      [...document.querySelectorAll("button, input, select")]
        .filter((element) => {
          if (element.getAttribute("aria-label")) return false;
          if (element.labels && element.labels.length) return false;
          if (element.getAttribute("aria-labelledby")) return false;
          return !element.textContent.trim();
        })
        .map((element) => element.outerHTML.slice(0, 80)));
    expect(unlabelled).toEqual([]);
  });

  test("der Kontrastmodus schaltet auf Schwarz auf Weiss", async ({ page }) => {
    await page.goto("/index.html");
    await page.click('.modes button[data-mode="contrast"]');
    await expect(page.locator("html")).toHaveAttribute("data-theme", "contrast");

    const colors = await page.evaluate(() => {
      const style = getComputedStyle(document.body);
      return { color: style.color, background: style.backgroundColor };
    });
    expect(colors.color).toBe("rgb(0, 0, 0)");
    expect(colors.background).toBe("rgb(255, 255, 255)");
  });

  test("die Seite laesst sich mit der Tastatur bedienen", async ({ page }) => {
    await page.goto("/index.html");
    await page.locator("#wordmark").focus();
    await expect(page.locator("#wordmark")).toBeFocused();

    await page.keyboard.press("Tab");
    const next = await page.evaluate(() => document.activeElement.dataset.mode);
    expect(next).toBe("light");
  });
});
