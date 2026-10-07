/**
 * Tests fuer die erzeugten Bauwerksseiten, die Sitemap und den
 * IndexNow-Schluessel.
 */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const DATA = require("../data.js");
const { PAGES, renderPage, SITE } = require("../tools/build-pages.js");
const { ENTRIES } = require("../tools/sitemap.js");

const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

test("jede Bauwerksseite passt zum Datensatz", () => {
  // Schlaegt nach einem neuen data.js an, bis `npm run pages` gelaufen ist.
  for (const page of PAGES) {
    assert.equal(read(page.slug + ".html"), renderPage(page), `${page.slug}.html: npm run pages`);
  }
});

test("jede Bauwerksseite gehoert zu einem Bauwerk und hat Titel und Beschreibung in Suchergebnis-Laenge", () => {
  const slugs = new Set();
  for (const page of PAGES) {
    assert.ok(DATA.buildings.some((building) => building.id === page.id), page.id);
    assert.ok(!slugs.has(page.slug), page.slug);
    slugs.add(page.slug);

    const html = read(page.slug + ".html");
    const title = html.match(/<title>([^<]+)<\/title>/)[1];
    const description = html.match(/<meta name="description" content="([^"]+)">/)[1];
    assert.ok(title.length <= 60, `${page.slug}: Titel ${title.length} Zeichen`);
    assert.ok(description.length > 80 && description.length <= 155, `${page.slug}: Beschreibung ${description.length} Zeichen`);
    assert.match(html, new RegExp(`<link rel="canonical" href="${SITE}/${page.slug}">`));
    assert.match(html, /<meta name="robots" content="index, follow/);
    assert.equal((html.match(/<h1[ >]/g) || []).length, 1, page.slug);
  }
});

test("die Bauwerksseiten zeigen jede Stufe bis zur hoechsten", () => {
  for (const page of PAGES) {
    const building = DATA.buildings.find((entry) => entry.id === page.id);
    const html = read(page.slug + ".html");
    for (const level of [1, 80, building.maxLevel]) {
      assert.match(html, new RegExp(`<tr id="stufe-${level}">`), `${page.slug}: Stufe ${level}`);
    }
    assert.ok(!html.includes("NaN") && !html.includes("undefined") && !html.includes("null"), page.slug);
  }
});

test("der Rechner verlinkt jede Bauwerksseite", () => {
  const html = read("index.html");
  for (const page of PAGES) assert.match(html, new RegExp(`href="/${page.slug}"`), page.slug);
});

test("die Sitemap nennt genau die Seiten, die in den Index sollen", () => {
  const xml = read("sitemap.xml");
  const locs = Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g), (match) => match[1]);
  assert.deepEqual(locs, ENTRIES.map((entry) => SITE + entry.loc));
  for (const entry of ENTRIES) {
    for (const source of entry.sources) assert.ok(fs.existsSync(path.join(ROOT, source)), source);
  }
  const lastmods = Array.from(xml.matchAll(/<lastmod>([^<]+)<\/lastmod>/g), (match) => match[1]);
  assert.equal(lastmods.length, locs.length);
  for (const date of lastmods) {
    assert.match(date, /^\d{4}-\d{2}-\d{2}$/);
    // Kein Datum aus der Zukunft — Suchmaschinen trauen lastmod dann gar nicht mehr.
    assert.ok(new Date(date) <= new Date(Date.now() + 2 * 86400000), date);
  }
});

test("der IndexNow-Schluessel liegt unter seinem eigenen Namen und ist vom Index ausgenommen", () => {
  const files = fs.readdirSync(ROOT).filter((name) => /^[0-9a-f]{32}\.txt$/.test(name));
  assert.equal(files.length, 1);
  assert.equal(read(files[0]).trim() + ".txt", files[0]);
  assert.match(read("netlify.toml"), new RegExp(`for = "/${files[0].replace(".", "\\.")}"\\s+\\[headers.values\\]\\s+X-Robots-Tag = "noindex"`));
});
