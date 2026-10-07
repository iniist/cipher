/**
 * Schreibt sitemap.xml, lastmod aus Git.
 *
 *   node tools/sitemap.js
 *
 * Jede Adresse kennt die Dateien, aus denen sie besteht. Ihr lastmod ist das
 * juengste Datum darunter: der letzte Commit einer Datei, oder heute, wenn
 * sie gerade geaendert und noch nicht committet ist. So kann das Skript vor
 * dem Commit laufen (Workflow „Datensatz importieren“) wie danach
 * (Workflow „Suchmaschinen benachrichtigen“ nach jedem Push auf main).
 *
 * lastmod wandert nie zurueck: In einem flachen Klon kennt Git nur den
 * letzten Commit, und ein aelteres Datum als das eingetragene waere dort
 * schlicht falsch. Gerechnet wird in deutscher Zeit, wie die Commits.
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { PAGES, SITE } = require("./build-pages.js");

const ROOT = path.resolve(__dirname, "..");
const FILE = path.join(ROOT, "sitemap.xml");
const TZ = "Europe/Berlin";

const OG_IMAGE = `${SITE}/bilder/og-cipher.png`;

/** Was in den Index soll. Rechtsseiten stehen auf noindex und fehlen. */
const ENTRIES = [
  {
    loc: "/",
    sources: ["index.html", "app.js", "calc.js", "data.js", "abbr.js", "styles.css", "fonts.css"],
    extra: `    <image:image>
      <image:loc>${OG_IMAGE}</image:loc>
    </image:image>`
  },
  {
    loc: "/rundgang",
    sources: ["rundgang.html", "rundgang.css", "rundgang.js", "bilder/rundgang.mp4", "bilder/rundgang.webm", "bilder/rundgang-poster.webp"],
    extra: `    <image:image>
      <image:loc>${OG_IMAGE}</image:loc>
    </image:image>
    <video:video>
      <video:thumbnail_loc>${SITE}/bilder/rundgang-poster.webp</video:thumbnail_loc>
      <video:title>cipher in 40 Sekunden</video:title>
      <video:description>Der Förderrechner cipher für Forge of Empires: die Arche wählen, Stufe und Arche-Faktor setzen, den Förderplan mit den Mäzenplätzen sichern und die Chat-Zeile kopieren.</video:description>
      <video:content_loc>${SITE}/bilder/rundgang.mp4</video:content_loc>
      <video:duration>40</video:duration>
      <video:family_friendly>yes</video:family_friendly>
    </video:video>`
  }
].concat(PAGES.map((page) => ({
  loc: "/" + page.slug,
  sources: [page.slug + ".html", "lg.css"],
  extra: ""
})));

/** Heute in deutscher Zeit als JJJJ-MM-TT. */
function today() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date());
}

function git(args) {
  try {
    return execFileSync("git", args, { cwd: ROOT, encoding: "utf8", env: Object.assign({}, process.env, { TZ }) }).trim();
  } catch (error) {
    return null;
  }
}

/** Datum der letzten Aenderung einer Datei, oder null, wenn Git nichts weiss. */
function changedOn(file) {
  const status = git(["status", "--porcelain", "--", file]);
  if (status) return today(); // geaendert oder neu, noch nicht committet
  return git(["log", "-1", "--format=%cd", "--date=format-local:%Y-%m-%d", "--", file]) || null;
}

/** lastmod-Werte der bestehenden Sitemap, je Adresse. */
function previous() {
  const result = {};
  if (!fs.existsSync(FILE)) return result;
  const xml = fs.readFileSync(FILE, "utf8");
  for (const match of xml.matchAll(/<loc>([^<]+)<\/loc>\s*<lastmod>([^<]+)<\/lastmod>/g)) {
    result[match[1]] = match[2];
  }
  return result;
}

function build() {
  const before = previous();
  const urls = ENTRIES.map((entry) => {
    const loc = SITE + entry.loc;
    const dates = entry.sources.map(changedOn).filter(Boolean);
    if (before[loc]) dates.push(before[loc]);
    const lastmod = dates.sort().pop() || today();
    return `  <url>
    <loc>${loc}</loc>
    <lastmod>${lastmod}</lastmod>
${entry.extra ? entry.extra + "\n" : ""}  </url>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- Erzeugt von tools/sitemap.js — Adressen und lastmod dort, nicht hier.
     Nur die Seiten, die in den Index sollen. Impressum und Datenschutz
     stehen auf noindex und fehlen darum hier. -->
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"
        xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">
${urls.join("\n")}
</urlset>
`;
}

if (require.main === module) {
  const xml = build();
  const old = fs.existsSync(FILE) ? fs.readFileSync(FILE, "utf8") : "";
  if (xml === old) {
    process.stdout.write("sitemap.xml ist aktuell.\n");
  } else {
    fs.writeFileSync(FILE, xml);
    process.stdout.write("sitemap.xml geschrieben.\n");
  }
}

module.exports = { ENTRIES, build };
