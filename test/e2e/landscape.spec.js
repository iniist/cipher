/**
 * Browsertests fuer das Telefon im Querformat.
 *
 * Die Haelfte dieser Tests prueft nicht, dass quer besser wird, sondern
 * dass hochkant sich dabei nicht veraendert hat.
 */
const { test, expect } = require("@playwright/test");

/** Kennzahlen des Aufbaus, die der Querformat-Block veraendern wuerde. */
const layout = (page) => page.evaluate(() => {
  const main = document.querySelector("main");
  const panels = [...document.querySelectorAll("main > .panel")];
  const box = (el) => el.getBoundingClientRect();
  return {
    display: getComputedStyle(main).display,
    paddingTop: getComputedStyle(main).paddingTop,
    mainWidth: Math.round(box(main).width),
    lefts: panels.map((el) => Math.round(box(el).left)),
    pageHeight: document.documentElement.scrollHeight,
    viewportHeight: window.innerHeight,
    overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    // Nebeneinander heisst: verschiedene linke Kanten und ueberlappende
    // senkrechte Bereiche.
    sideBySide: panels.length >= 2 &&
      Math.round(box(panels[0]).left) !== Math.round(box(panels[1]).left) &&
      box(panels[0]).top < box(panels[1]).bottom &&
      box(panels[1]).top < box(panels[0]).bottom
  };
});

async function open(page, width, height) {
  await page.setViewportSize({ width, height });
  await page.goto("/index.html");
  await page.fill("#level", "80");
  await page.locator("#level").blur();
  return layout(page);
}

test.describe("Telefon quer", () => {
  const PHONES = [
    [844, 390, "iPhone 14"],
    [915, 412, "Pixel"],
    [740, 360, "kleines Android"],
    [568, 320, "iPhone SE"]
  ];

  for (const [width, height, name] of PHONES) {
    test(`${name} quer (${width}×${height}) nutzt die Breite und spart Höhe`, async ({ page }) => {
      const m = await open(page, width, height);

      expect(m.display).toBe("grid");
      // Vorher blieb main bei 560px stehen, egal wie breit das Gerät war.
      expect(m.mainWidth).toBeGreaterThan(560);
      expect(m.sideBySide, "Bauwerk und Förderplan müssen nebeneinander stehen").toBe(true);
      expect(m.overflowX, "kein waagerechtes Scrollen").toBeLessThanOrEqual(0);

      // Vorher waren es rund fünf Bildschirme.
      expect(m.pageHeight / m.viewportHeight).toBeLessThan(4.5);
    });
  }

  test("auf dem breitesten Telefon bleibt die Seite unter drei Bildschirmen", async ({ page }) => {
    const m = await open(page, 915, 412);
    expect(m.pageHeight / m.viewportHeight).toBeLessThan(3);
  });
});

test.describe("Hochformat bleibt unberührt", () => {
  const PORTRAIT = [
    [320, 568], [360, 780], [390, 844], [430, 932]
  ];

  for (const [width, height] of PORTRAIT) {
    test(`${width}×${height} behält den bisherigen Aufbau`, async ({ page }) => {
      const m = await open(page, width, height);

      expect(m.display).toBe("block");
      // Sonde: dieses Polster setzt ausschließlich der Querformat-Block um.
      // Steht hier 10px, ist die Abfrage ins Hochformat durchgeschlagen.
      expect(m.paddingTop).toBe("16px");
      expect(m.mainWidth).toBe(width);
      expect(m.lefts).toEqual([14, 14, 14]);
      expect(m.sideBySide, "die Panels bleiben gestapelt").toBe(false);
    });
  }
});

test.describe("die Abfrage trifft nur Telefone quer", () => {
  test("ein Desktop-Fenster bleibt beim bisherigen Aufbau", async ({ page }) => {
    const m = await open(page, 1280, 800);
    expect(m.display).toBe("block");
    expect(m.mainWidth).toBe(560);
  });

  test("ein Tablet quer bleibt beim bisherigen Aufbau", async ({ page }) => {
    // 768px hoch — Platz genug, die zwei Spalten sind nicht nötig.
    const m = await open(page, 1024, 768);
    expect(m.display).toBe("block");
  });

  test("ein flaches Hochformat-Fenster greift nicht", async ({ page }) => {
    // Ein hochkant gehaltenes Telefon kann durch eine eingeblendete
    // Tastatur flacher als breit werden. Die Mindestbreite fängt das ab.
    const m = await open(page, 390, 380);
    expect(m.display).toBe("block");
  });
});

test.describe("Gemerktes im Querformat", () => {
  /** Neun Favoriten — hochkant drei Reihen, quer sollen es zwei sein. */
  const NINE = ["The_Arc", "Notre_Dame", "Colosseum", "Tower_of_Babel", "Hagia_Sophia",
    "Lighthouse_of_Alexandria", "Deal_Castle", "Cathedral_of_Aachen", "Galata_Tower"]
    .map((id, index) => ({ id, level: 10 + index }));

  /** Wie viele Chipreihen tatsächlich sichtbar sind. */
  const visibleRows = (page) => page.locator("#favList").evaluate((list) => {
    const tops = [...new Set([...list.children].map((e) => e.offsetTop))].sort((a, b) => a - b);
    return tops.filter((top) => top - tops[0] + list.children[0].offsetHeight <= list.clientHeight + 1).length;
  });

  test("quer bekommt der Streifen zwei Reihen statt drei", async ({ page }) => {
    await page.goto("/index.html");
    await page.evaluate((list) =>
      localStorage.setItem("cipher:favorites", JSON.stringify(list)), NINE);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/index.html");
    expect(await visibleRows(page), "hochkant drei Reihen").toBe(3);

    await page.setViewportSize({ width: 844, height: 390 });
    await page.goto("/index.html");
    expect(await visibleRows(page), "quer zwei Reihen").toBe(2);

    // Gekürzt, nicht verloren: der Rest ist weiterhin erreichbar.
    const scrollable = await page.locator("#favList")
      .evaluate((el) => el.scrollHeight > el.clientHeight + 1);
    expect(scrollable).toBe(true);
  });

  test("quer bleibt die Seite trotz Gemerktem unter vier Bildschirmen", async ({ page }) => {
    await page.goto("/index.html");
    await page.evaluate((list) =>
      localStorage.setItem("cipher:favorites", JSON.stringify(list)), NINE);

    const m = await open(page, 844, 390);
    expect(m.pageHeight / m.viewportHeight).toBeLessThan(4);
  });
});
