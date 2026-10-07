/**
 * Browsertests fuer Suchmaschinen: Sitemap, robots.txt, Metadaten und
 * strukturierte Daten des Rundgangs, das Vorschaubild — und dass die
 * Projektdateien im Wurzelverzeichnis nicht mit ausgeliefert werden.
 */
const { test, expect } = require("@playwright/test");

const SITE = "https://foe-foerderrechner.com";
const { PAGES } = require("../../tools/build-pages.js");

test.describe("Sitemap und robots.txt", () => {
  test("sitemap.xml ist gueltiges XML und nennt /, /rundgang und die Bauwerksseiten", async ({ request, page }) => {
    const response = await request.get("/sitemap.xml");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("xml");

    const xml = await response.text();
    await page.goto("/index.html");
    const result = await page.evaluate((source) => {
      const doc = new DOMParser().parseFromString(source, "application/xml");
      if (doc.querySelector("parsererror")) return { error: true };
      return {
        root: doc.documentElement.localName,
        locs: Array.from(doc.getElementsByTagNameNS("http://www.sitemaps.org/schemas/sitemap/0.9", "loc"))
          .map((node) => node.textContent.trim()),
        lastmod: Array.from(doc.getElementsByTagNameNS("http://www.sitemaps.org/schemas/sitemap/0.9", "lastmod"))
          .map((node) => node.textContent.trim())
      };
    }, xml);

    expect(result.error).toBeUndefined();
    expect(result.root).toBe("urlset");
    expect(result.locs).toEqual([SITE + "/", SITE + "/rundgang"].concat(PAGES.map((p) => SITE + "/" + p.slug)));
    for (const date of result.lastmod) expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Rechtsseiten stehen auf noindex und gehoeren nicht hinein.
    expect(xml).not.toContain("impressum");
    expect(xml).not.toContain("datenschutz");
  });

  test("jede Adresse aus der Sitemap antwortet mit 200 und traegt sich als canonical", async ({ request, page }) => {
    const xml = await (await request.get("/sitemap.xml")).text();
    const locs = Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g), (match) => match[1]);
    for (const loc of locs) {
      const pathname = new URL(loc).pathname;
      const response = await page.goto(pathname);
      expect(response.status(), loc).toBe(200);
      expect(await page.locator('link[rel="canonical"]').getAttribute("href"), loc).toBe(loc);
      expect(await page.locator('meta[name="robots"]').getAttribute("content") || "", loc).not.toContain("noindex");
    }
  });

  test("robots.txt verweist mit voller Adresse auf die Sitemap", async ({ request }) => {
    const body = await (await request.get("/robots.txt")).text();
    expect(body).toMatch(new RegExp("^Sitemap: " + SITE.replace(/\./g, "\\.") + "/sitemap\\.xml$", "m"));
    // Nichts, was in den Index soll, darf gesperrt sein.
    expect(body).not.toMatch(/^Disallow: \/\s*$/m);
    expect(body).not.toMatch(/^Disallow: \/(bilder|rundgang)/m);
  });
});

test.describe("Rundgang fuer Suchmaschinen", () => {
  test("Titel, Beschreibung, canonical und Vorschaubild", async ({ page }) => {
    await page.goto("/rundgang.html");
    const meta = (selector) => page.locator(selector).getAttribute("content");

    const title = await page.title();
    expect(title.length).toBeLessThanOrEqual(60);
    expect(title).toMatch(/Förderrechner/);
    expect(title).toMatch(/Arche/);

    const description = await meta('meta[name="description"]');
    expect(description.length).toBeGreaterThan(80);
    expect(description.length).toBeLessThanOrEqual(155);
    expect(description).toMatch(/Forge of Empires/);

    expect(await page.locator('link[rel="canonical"]').getAttribute("href")).toBe(SITE + "/rundgang");
    expect(await meta('meta[property="og:url"]')).toBe(SITE + "/rundgang");
    expect(await meta('meta[property="og:image"]')).toBe(SITE + "/bilder/og-cipher.png");
    expect(await meta('meta[property="og:image:width"]')).toBe("1200");
    expect(await meta('meta[property="og:image:height"]')).toBe("630");
    expect(await meta('meta[name="twitter:card"]')).toBe("summary_large_image");
    expect(await meta('meta[name="robots"]')).toMatch(/^index, follow/);
  });

  test("genau eine h1, die Ueberschriften springen nicht", async ({ page }) => {
    await page.goto("/rundgang.html");
    await expect(page.locator("h1")).toHaveCount(1);
    const levels = await page.locator("h1, h2, h3, h4, h5, h6")
      .evaluateAll((elements) => elements.map((element) => Number(element.tagName[1])));
    for (let index = 1; index < levels.length; index++) {
      expect(levels[index] - levels[index - 1], `Stufe ${levels[index - 1]} → ${levels[index]}`).toBeLessThanOrEqual(1);
    }
  });

  test("jedes Bild hat einen Alternativtext, das Video eine Beschriftung", async ({ page }) => {
    await page.goto("/rundgang.html");
    const missing = await page.locator("img").evaluateAll((images) => images
      .filter((image) => !(image.getAttribute("alt") || "").trim())
      .map((image) => image.getAttribute("src")));
    expect(missing).toEqual([]);
    expect(await page.locator("#heroVideo").getAttribute("aria-label")).toMatch(/Arche/);
  });

  test("die strukturierten Daten sind gueltiges JSON mit den erwarteten Typen", async ({ page, request }) => {
    await page.goto("/rundgang.html");
    const blocks = await page.locator('script[type="application/ld+json"]')
      .evaluateAll((elements) => elements.map((element) => element.textContent));
    expect(blocks.length).toBeGreaterThan(0);

    const nodes = blocks.flatMap((block) => {
      const data = JSON.parse(block);
      return data["@graph"] || [data];
    });
    const byType = Object.fromEntries(nodes.map((node) => [node["@type"], node]));
    for (const type of ["WebPage", "VideoObject", "SoftwareApplication", "BreadcrumbList"]) {
      expect(byType[type], type).toBeTruthy();
    }

    expect(byType.WebPage.url).toBe(SITE + "/rundgang");
    const video = byType.VideoObject;
    expect(video.name).toBeTruthy();
    expect(video.description).toBeTruthy();
    expect(video.uploadDate).toMatch(/^\d{4}-\d{2}-\d{2}/);
    expect(video.duration).toMatch(/^PT\d+S$/);
    expect(byType.SoftwareApplication.offers.price).toBe("0");

    // Die Adressen im Datenblock muessen auf echte Dateien zeigen.
    for (const url of [video.thumbnailUrl, video.contentUrl]) {
      expect(url.startsWith(SITE + "/"), url).toBe(true);
      const response = await request.get(new URL(url).pathname);
      expect(response.status(), url).toBe(200);
    }
  });

  test("die Videolaenge im Datenblock stimmt mit der Datei ueberein", async ({ page }) => {
    await page.goto("/rundgang.html");
    const declared = await page.locator('script[type="application/ld+json"]').evaluate((element) => {
      const graph = JSON.parse(element.textContent)["@graph"];
      return Number(graph.find((node) => node["@type"] === "VideoObject").duration.match(/\d+/)[0]);
    });
    const actual = await page.evaluate(() => new Promise((resolve, reject) => {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.muted = true;
      video.onloadedmetadata = () => resolve(video.duration);
      video.onerror = () => reject(new Error("Video nicht lesbar"));
      video.src = "./bilder/rundgang.mp4";
    })).catch(async () => page.evaluate(() => new Promise((resolve) => {
      // Chromium ohne H.264: dieselbe Laenge aus der WebM-Fassung.
      const video = document.createElement("video");
      video.preload = "metadata";
      video.onloadedmetadata = () => resolve(video.duration);
      video.src = "./bilder/rundgang.webm";
    })));
    expect(Math.abs(actual - declared)).toBeLessThan(1.5);
  });

  test("auch unter /rundgang erreichbar, wie auf Netlify", async ({ request }) => {
    const response = await request.get("/rundgang");
    expect(response.status()).toBe(200);
    expect(await response.text()).toContain('<link rel="canonical" href="https://foe-foerderrechner.com/rundgang">');
  });
});

test.describe("Vorschaubild", () => {
  test("og-cipher.png ist ein PNG in 1200 x 630 und bleibt klein", async ({ request, page }) => {
    const response = await request.get("/bilder/og-cipher.png");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toBe("image/png");
    const body = await response.body();
    expect(body.length).toBeLessThan(300 * 1024);
    // Breite und Hoehe stehen im IHDR-Block des PNG.
    expect([body.readUInt32BE(16), body.readUInt32BE(20)]).toEqual([1200, 630]);

    await page.goto("/index.html");
    const size = await page.evaluate(async () => {
      const image = new Image();
      image.src = "/bilder/og-cipher.png";
      await image.decode();
      return [image.naturalWidth, image.naturalHeight];
    });
    expect(size).toEqual([1200, 630]);
  });

  test("Bilder werden zwischengespeichert, aber nicht fuer immer", async ({ request }) => {
    // Die Dateinamen tragen keinen Hash — "immutable" waere falsch.
    const cache = (await request.get("/bilder/og-cipher.png")).headers()["cache-control"];
    expect(cache).toMatch(/max-age=\d+/);
    expect(cache).not.toContain("immutable");
  });
});

test.describe("Projektdateien nicht öffentlich", () => {
  // Liegen durch `publish = "."` im Deploy, gehoeren aber nicht auf die
  // Website — sonst tauchen sie als Suchergebnis neben dem Rechner auf.
  const HIDDEN = ["/README.md", "/package.json", "/package-lock.json", "/playwright.config.js", "/netlify.toml"];

  for (const hidden of HIDDEN) {
    test(`${hidden} antwortet mit 404`, async ({ request }) => {
      const response = await request.get(hidden);
      expect(response.status()).toBe(404);
      expect(await response.text()).toContain("Nichts eingezeichnet");
      expect(response.headers()["x-robots-tag"]).toBe("noindex");
    });
  }

  test("Lizenztexte bleiben erreichbar, aber aus dem Index", async ({ request }) => {
    for (const file of ["/LICENSE", "/NOTICE.md", "/fonts/LICENSE-Barlow.txt"]) {
      const response = await request.get(file);
      expect(response.status(), file).toBe(200);
      expect(response.headers()["x-robots-tag"], file).toBe("noindex");
    }
  });
});
