/**
 * Browsertests fuer das, was Suchmaschinen und Link-Vorschauen vom Rechner
 * lesen: Titel, Beschreibung, Ueberschrift, strukturierte Daten, Vorschaubild.
 *
 * Die FAQ steht zweimal im Dokument — sichtbar unter dem Rechner und als
 * JSON-LD im <head>. Google verlangt, dass beides uebereinstimmt; der Test
 * haelt es fest, damit eine Textaenderung nicht nur an einer Stelle landet.
 */
const { test, expect } = require("@playwright/test");

const SITE = "https://foe-foerderrechner.com/";
const OG_IMAGE = SITE + "bilder/og-cipher.png";

/** Leerraum zusammenfassen, wie ihn auch ein Crawler liest. */
const norm = (text) => text.replace(/\s+/g, " ").trim();

/** Alle JSON-LD-Knoten der Seite, @graph aufgeloest. */
async function jsonLd(page) {
  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  expect(blocks.length).toBeGreaterThan(0);
  return blocks.flatMap((block) => {
    const data = JSON.parse(block); // wirft bei ungueltigem JSON
    return data["@graph"] || [data];
  });
}

test.beforeEach(async ({ page }) => {
  await page.goto("/index.html");
});

test("Titel und Beschreibung sind da und passen ins Suchergebnis", async ({ page }) => {
  const title = await page.title();
  expect(title.length).toBeGreaterThan(20);
  expect(title.length).toBeLessThanOrEqual(60);
  expect(title).toMatch(/Förderrechner/);

  const description = await page.locator('meta[name="description"]').getAttribute("content");
  expect(description.length).toBeGreaterThan(80);
  expect(description.length).toBeLessThanOrEqual(155);
  expect(description).toMatch(/Forge of Empires/);
  // Der Hinweis auf das Fan-Projekt gehoert auch ins Suchergebnis.
  expect(description).toMatch(/Inoffizielles Fan-Tool/);
});

test("die Seite ist zur Indexierung freigegeben und traegt ihre Adresse", async ({ page }) => {
  expect(await page.locator('meta[name="robots"]').getAttribute("content")).toMatch(/^index, follow/);
  expect(await page.locator('link[rel="canonical"]').getAttribute("href")).toBe(SITE);
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
  // Nutzlos fuer Google, darum gar nicht erst da.
  await expect(page.locator('meta[name="keywords"]')).toHaveCount(0);
});

test("genau eine H1, die sagt, was die Seite ist — die Wortmarke bleibt", async ({ page }) => {
  const h1 = page.locator("h1");
  await expect(h1).toHaveCount(1);
  expect(norm(await h1.textContent())).toMatch(/^cipher — Förderrechner für Legendäre Bauwerke in Forge of Empires$/);
  // Der Knopf fuer das Easter Egg traegt weiter nur die Wortmarke.
  await expect(page.locator("#wordmark")).toHaveText("cipher");
});

test("die Ueberschriften steigen nicht ueber eine Stufe hinweg", async ({ page }) => {
  const levels = await page.evaluate(() =>
    [...document.querySelectorAll("h1, h2, h3, h4, h5, h6")].map((h) => Number(h.tagName[1])));
  expect(levels[0]).toBe(1);
  for (let i = 1; i < levels.length; i++) {
    expect(levels[i] - levels[i - 1]).toBeLessThanOrEqual(1);
  }
});

test("Erklaerung und Fragen stehen als Text im Dokument", async ({ page }) => {
  await expect(page.locator("#howTitle")).toHaveText("So funktioniert der Förderrechner");
  await expect(page.locator("#faqTitle")).toHaveText("Häufige Fragen");
  const questions = page.locator(".faq summary");
  expect(await questions.count()).toBeGreaterThanOrEqual(5);
  expect(await questions.count()).toBeLessThanOrEqual(8);

  // Zugeklappt, aber mit einem Tipp lesbar.
  const first = page.locator(".faq details").first();
  await expect(first.locator("p")).toBeHidden();
  await first.locator("summary").click();
  await expect(first.locator("p")).toBeVisible();
});

test("das JSON-LD ist gueltig und beschreibt Website, Anwendung und FAQ", async ({ page }) => {
  const nodes = await jsonLd(page);
  const byType = (type) => nodes.find((node) => node["@type"] === type);

  const site = byType("WebSite");
  expect(site).toBeTruthy();
  expect(site.url).toBe(SITE);

  const app = byType("WebApplication");
  expect(app).toBeTruthy();
  expect(app.url).toBe(SITE);
  expect(app.applicationCategory).toBe("GameApplication");
  expect(app.operatingSystem).toBe("Web");
  expect(app.inLanguage).toBe("de");
  expect(app.isAccessibleForFree).toBe(true);
  expect(app.offers).toMatchObject({ "@type": "Offer", price: "0", priceCurrency: "EUR" });
  // Auch hier: kein Anschein eines offiziellen Angebots.
  expect(app.description).toContain("Inoffizielles Fan-Projekt");

  expect(byType("FAQPage")).toBeTruthy();
});

test("die FAQ im JSON-LD ist wortgleich mit der sichtbaren", async ({ page }) => {
  const nodes = await jsonLd(page);
  const faq = nodes.find((node) => node["@type"] === "FAQPage");
  const structured = faq.mainEntity.map((q) => ({ q: q.name, a: q.acceptedAnswer.text }));

  const visible = await page.locator(".faq details").evaluateAll((items) => items.map((item) => ({
    q: item.querySelector("summary").textContent,
    a: item.querySelector("p").textContent
  })));

  expect(structured).toEqual(visible.map(({ q, a }) => ({ q: norm(q), a: norm(a) })));
});

test("das Vorschaubild ist angegeben, absolut und vorhanden", async ({ page, request }) => {
  const meta = (selector) => page.locator(selector).getAttribute("content");

  expect(await meta('meta[property="og:image"]')).toBe(OG_IMAGE);
  expect(await meta('meta[property="og:image:width"]')).toBe("1200");
  expect(await meta('meta[property="og:image:height"]')).toBe("630");
  expect((await meta('meta[property="og:image:alt"]')).length).toBeGreaterThan(20);
  expect(await meta('meta[name="twitter:card"]')).toBe("summary_large_image");
  expect(await meta('meta[name="twitter:image"]')).toBe(OG_IMAGE);
  expect(await meta('meta[property="og:title"]')).toMatch(/Förderrechner/);

  // Ein og:image, das ins Leere zeigt, erzeugt eine kaputte Karte: die
  // Datei muss da sein und die angegebene Groesse haben.
  const path = new URL(OG_IMAGE).pathname;
  const response = await request.get(path);
  expect(response.status(), path).toBe(200);
  expect(response.headers()["content-type"]).toBe("image/png");
  const size = await page.evaluate(async (src) => {
    const image = new Image();
    image.src = src;
    await image.decode();
    return [image.naturalWidth, image.naturalHeight];
  }, path);
  expect(size).toEqual([1200, 630]);
});

test("alle Bilder tragen einen Alternativtext", async ({ page }) => {
  const missing = await page.locator("img:not([alt])").count();
  expect(missing).toBe(0);
});

test.describe("Zwischenstopp vor der Erklaerung", () => {
  /** Scrollposition, bei der das Chat-Panel unten buendig steht. */
  const stopAt = (page) => page.evaluate(() => {
    const pad = parseFloat(getComputedStyle(document.documentElement).scrollPaddingBottom) || 0;
    const chat = document.getElementById("chatPanel");
    return Math.round(chat.getBoundingClientRect().bottom + scrollY + pad - innerHeight);
  });

  /** Eine Wischgeste nachstellen: Finger auf, (Ziehen,) los, Schwung. */
  const swipe = (page, { dragTo = null, flingTo }) => page.evaluate(async ({ dragTo, flingTo }) => {
    const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
    window.dispatchEvent(new Event("touchstart"));
    if (dragTo != null) { window.scrollTo(0, dragTo); await frame(); await frame(); }
    window.dispatchEvent(new Event("touchend"));
    window.scrollTo(0, flingTo);
    await frame(); await frame(); await frame();
    return window.scrollY;
  }, { dragTo, flingTo });

  test("das Snap-CSS sitzt: Rasten in der Naehe, ein Halt am Chat-Ende", async ({ page }) => {
    const css = await page.evaluate(() => {
      const html = getComputedStyle(document.documentElement);
      const chat = getComputedStyle(document.getElementById("chatPanel"));
      return {
        type: html.scrollSnapType,
        align: chat.scrollSnapAlign,
        stop: chat.scrollSnapStop,
        info: getComputedStyle(document.querySelector(".info")).scrollSnapAlign
      };
    });
    // proximity ist der Vorgabewert und wird darum als "y" gemeldet;
    // mandatory stuende ausdruecklich da und darf es nicht.
    expect(css.type).toBe("y");
    expect(css.align).toBe("end");
    expect(css.stop).toBe("always");
    expect(css.info).toBe("start");
  });

  test("ein Wisch von oben haelt am Ende des Foerderchats", async ({ page }) => {
    const stop = await stopAt(page);
    expect(stop).toBeGreaterThan(0);

    const landed = await swipe(page, { flingTo: stop + 700 });
    expect(Math.abs(landed - stop)).toBeLessThanOrEqual(2);
    // Die Kopierknoepfe stehen vollstaendig im Bild.
    await expect(page.locator('#chatPanel [data-copy="chatPoints"]')).toBeInViewport({ ratio: 1 });

    // Der zweite Wisch vom Halt aus laeuft frei weiter in die Fragen.
    const further = await swipe(page, { flingTo: stop + 700 });
    expect(further).toBeGreaterThan(stop + 300);
  });

  test("wer mit dem Finger ueber den Halt zieht, wird nicht gebremst", async ({ page }) => {
    const stop = await stopAt(page);
    // Weit genug ueber den Halt, dass das Rasten (proximity) nicht zurueckzieht.
    const landed = await swipe(page, { dragTo: stop + 450, flingTo: stop + 700 });
    expect(landed).toBeGreaterThan(stop + 300);
  });

  test("Mausrad und Sprungmarken bleiben unberuehrt", async ({ page }) => {
    const stop = await stopAt(page);
    // Ohne Beruehrung kein Bremsen, auch nicht bei grossem Sprung.
    await page.evaluate((y) => window.scrollTo(0, y), stop + 700);
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(stop + 300);

    // Eine aufgeklappte Frage laesst die Seite nicht springen.
    await page.evaluate(() => window.scrollTo(0, 0));
    const faq = page.locator(".faq details").nth(3);
    await faq.locator("summary").scrollIntoViewIfNeeded();
    await faq.locator("summary").click();
    await expect(faq.locator("p")).toBeInViewport();
  });
});
