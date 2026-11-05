/**
 * Erzeugt die Bauwerksseiten (arche.html, atomium.html, …) aus data.js.
 *
 *   node tools/build-pages.js           Seiten schreiben
 *   node tools/build-pages.js --check   nur pruefen, ob sie aktuell sind
 *
 * Jede Seite zeigt fuer ein Legendaeres Bauwerk die Kosten und die
 * Maezenplaetze aller Stufen, gerechnet mit demselben Rechenkern wie der
 * Rechner (calc.js): Kosten aus kosten.js, Belohnungen nach den Regeln seit
 * dem Prestige-Update, Faktor 1,9 auf Kupfer- und 1,0 auf Gold-Stufen —
 * dieselben Vorgaben wie im Rechner. Gedacht fuer die Suche: wer
 * „Arche Stufe 80 Kosten“ eingibt, soll eine Seite finden, die genau das
 * beantwortet — und von dort mit einem Tipp im Rechner landen.
 *
 * Die Seiten sind erzeugt, nicht von Hand gepflegt. Aendert sich data.js
 * (Workflow „Datensatz importieren“), laeuft dieses Skript mit;
 * test/pages.test.js schlaegt an, wenn eine Seite nicht mehr zum Datensatz
 * passt. Danach `node tools/sitemap.js`, damit lastmod mitzieht.
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const SITE = "https://foe-foerderrechner.com";
const DATA = require(path.join(ROOT, "data.js"));
const Calc = require(path.join(ROOT, "calc.js"));
const ABBR = require(path.join(ROOT, "abbr.js"));
const COSTS = require(path.join(ROOT, "kosten.js"));

/** Faktoren der Tabellen, wie im Rechner voreingestellt: Kupfer und Gold. */
const FACTOR = 190;
const GOLD_FACTOR = 100;

/** Die Stufe, an der jede Seite den Foerderplan ausfuehrlich vorrechnet. */
const EXAMPLE_LEVEL = 80;


/**
 * Die Bauwerke mit eigener Seite. `about` ist der einzige Text, der von
 * Hand dazukommt — darin nur, was sicher stimmt; alles andere rechnet das
 * Skript aus dem Datensatz.
 */
const PAGES = [
  {
    id: "The_Arc",
    slug: "arche",
    short: "Arche",
    about: "Die Arche erhöht die Belohnungen, die du für Förderungen an fremden Legendären Bauwerken bekommst, und bringt Güter für die Schatzkammer deiner Gilde. Von ihrem Bonus kommt die Faustregel der Fördergruppen, mit dem 1,9-Fachen der Belohnung einzuzahlen."
  },
  {
    id: "Atomium",
    slug: "atomium",
    short: "Atomium",
    about: "Das Atomium steigert die Zufriedenheit in deiner Stadt und bringt jeden Tag Güter, die nach dem Einsammeln in die Schatzkammer deiner Gilde gehen."
  },
  {
    id: "Seed_Vault",
    slug: "saatgut-tresor",
    short: "Saatgut-Tresor",
    about: "Der Saatgut-Tresor stammt aus der Arktischen Zukunft und gehört zu den Bauwerken mit Gold-Kategorie: Ab Stufe 101 kommen neue Boni dazu, und er lässt sich über Stufe 200 hinaus ausbauen."
  },
  {
    id: "Saturn_VI_Gate_PEGASUS",
    slug: "saturn-vi-tor-pegasus",
    short: "PEGASUS",
    about: "Das Saturn VI Tor PEGASUS ist eines der drei Saturn-VI-Tore aus dem Zeitalter Titan. Ab Stufe 11 braucht es zum Ausbau zusätzlich Titan-Güter und Münzen; die Forge-Punkte fürs Fördern stehen unten."
  },
  {
    id: "Saturn_VI_Gate_CENTAURUS",
    slug: "saturn-vi-tor-centaurus",
    short: "CENTAURUS",
    about: "Das Saturn VI Tor CENTAURUS ist eines der drei Saturn-VI-Tore aus dem Zeitalter Titan. Ab Stufe 11 braucht es zum Ausbau zusätzlich Titan-Güter und Münzen; die Forge-Punkte fürs Fördern stehen unten."
  },
  {
    id: "Saturn_VI_Gate_HYDRA",
    slug: "saturn-vi-tor-hydra",
    short: "HYDRA",
    about: "Das Saturn VI Tor HYDRA ist eines der drei Saturn-VI-Tore aus dem Zeitalter Titan. Ab Stufe 11 braucht es zum Ausbau zusätzlich Titan-Güter und Münzen; die Forge-Punkte fürs Fördern stehen unten."
  }
];

// ------------------------------------------------------------------ Helfer

const esc = (text) => String(text)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** 12345 -> "12.345", ohne sich auf die ICU-Daten von Node zu verlassen. */
const num = (value) => String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

/** "2026-09-28" -> "28.9.2026", wie im Rechner. */
const date = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d}.${m}.${y}`;
};

/** Link in den Rechner, der Bauwerk und Stufe gleich einstellt (app.js). */
const calcLink = (id, level) => `/#lg=${encodeURIComponent(id)}&amp;stufe=${level}`;

/** Eine Stufe so rechnen, wie der Rechner sie mit allen Plaetzen zeigt. */
function levelPlan(building, level) {
  const total = COSTS.costs[building.id] && COSTS.costs[building.id][level - 1];
  if (!(total > 0)) return null;
  const gold = Calc.isGold(building.id, level);
  const rewards = Calc.rewardsFromCost(total, level, gold);
  const plan = Calc.buildPlan({
    total,
    rewards,
    p1: rewards[0],
    factor: gold ? GOLD_FACTOR : FACTOR,
    enabled: rewards.map(() => true)
  });
  return { level, total, gold, plan };
}

/** Faktor als Text, wie im Rechner: 190 -> "1,9", 100 -> "1,0". */
const factorText = (value) => (value / 100).toFixed(2).replace(/0$/, "").replace(".", ",");

// ------------------------------------------------------------------- Seite

function renderPage(page) {
  const building = DATA.buildings.find((entry) => entry.id === page.id);
  if (!building) throw new Error(`Bauwerk ${page.id} fehlt in data.js`);

  const url = `${SITE}/${page.slug}`;
  const levels = [];
  const top = COSTS.costs[building.id].length;
  for (let level = 1; level <= top; level++) {
    const row = levelPlan(building, level);
    if (row) levels.push(row);
  }
  const last = levels[levels.length - 1];
  const example = levels.find((row) => row.level === EXAMPLE_LEVEL) || last;
  const sumTo = (level) => levels.filter((row) => row.level <= level)
    .reduce((sum, row) => sum + row.total, 0);
  const hasGold = Calc.hasGold(building.id);
  const slotCount = hasGold ? 7 : 5;
  const places = hasGold ? "P1–P7" : "P1–P5";

  const name = building.name;
  // Hoechstens 60 Zeichen, sonst kuerzt Google; die Tore tragen ihren
  // vollen Namen, weil genau der gesucht wird.
  const title = name.length > 15
    ? `${name} fördern: Kosten je Stufe – cipher`
    : `${name.replace(/^Die /, "")} fördern: Kosten und Plätze je Stufe – cipher`;
  const description = `${name} in Forge of Empires fördern: Gesamt-FP, Mäzenplätze ${places} und Einzahlung je Platz für alle ${top} Stufen.`;

  const ex = example.plan;
  const exRows = ex.rows;

  const milestones = [10, 50, 80, 100, 150, 200, 300, 400, 500]
    .filter((level) => level <= last.level)
    .concat(last.level % 50 && last.level > 10 ? [last.level] : []);

  const otherLinks = PAGES.filter((other) => other.id !== page.id).map((other) => {
    const entry = DATA.buildings.find((b) => b.id === other.id);
    return `<a href="/${other.slug}">${esc(entry.name)}</a>`;
  }).join("\n      ");

  const tableRows = levels.map((row) => {
    const cells = [];
    for (let index = 0; index < slotCount; index++) {
      const slot = row.plan.rows[index];
      cells.push(slot && slot.offered
        ? `<td>${num(slot.reward)}<small>${num(slot.contribution)}</small></td>`
        : `<td class="off">–</td>`);
    }
    const mark = row.gold ? ` class="gold"` : "";
    return `<tr id="stufe-${row.level}"${mark}><th scope="row"><a href="${calcLink(building.id, row.level)}">${row.level}</a></th>` +
      `<td>${num(row.total)}</td>${cells.join("")}<td class="own">${num(row.plan.ownShare)}</td></tr>`;
  }).join("\n");
  const slotHeads = Array.from({ length: slotCount }, (_, index) => `<th scope="col">P${index + 1}</th>`).join("");

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${url}#webpage`,
        url,
        name: title,
        description,
        inLanguage: "de",
        dateModified: COSTS.generated,
        isPartOf: { "@id": `${SITE}/#website` },
        about: { "@id": `${SITE}/#app` },
        breadcrumb: { "@id": `${url}#breadcrumb` }
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${url}#breadcrumb`,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "cipher", item: `${SITE}/` },
          { "@type": "ListItem", position: 2, name: `${name} fördern`, item: url }
        ]
      }
    ]
  };

  return `<!DOCTYPE html>
<!-- Erzeugt von tools/build-pages.js aus data.js und kosten.js — Aenderungen dort, nicht hier. -->
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="referrer" content="no-referrer">
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#183c30">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large">
<link rel="canonical" href="${url}">
<meta property="og:type" content="website">
<meta property="og:url" content="${url}">
<meta property="og:site_name" content="cipher">
<meta property="og:locale" content="de_DE">
<meta property="og:title" content="${esc(name)} fördern — Kosten und Mäzenplätze je Stufe">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${SITE}/bilder/og-cipher.png">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="cipher, der Förderrechner für Legendäre Bauwerke: Förderplan mit den Mäzen-Plätzen">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">
${JSON.stringify(jsonLd, null, 2)}
</script>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' fill='%231f4a7a'/%3E%3Cpath d='M22 10.5a7.5 7.5 0 1 0 0 11' fill='none' stroke='%23f0c24f' stroke-width='3.2' stroke-linecap='square'/%3E%3C/svg%3E">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="stylesheet" href="./fonts.css">
<link rel="stylesheet" href="./lg.css">
</head>
<body>

<header class="top">
  <nav aria-label="Brotkrumen"><a href="/">cipher</a> <span aria-hidden="true">›</span> ${esc(name)}</nav>
</header>

<main>
  <h1>${esc(name)} fördern: Kosten und Mäzenplätze je Stufe</h1>
  <p class="lead">${esc(page.about)} Hier stehen für jede Stufe bis ${top} die Gesamtkosten in Forge-Punkten, die Belohnungen der Mäzenplätze ${places} und was ein Förderer einzahlt — mit dem Stand nach dem Prestige-Update vom 5. November 2026.</p>
  <p><a class="btn" href="${calcLink(building.id, example.level)}">${esc(page.short)} im Förderrechner öffnen</a></p>

  <section aria-labelledby="beispiel">
    <h2 id="beispiel">Beispiel: ${esc(name)} auf Stufe ${example.level}</h2>
    <p>Stufe ${example.level} kostet ${num(example.total)} FP. Bietest du alle Plätze mit Faktor ${factorText(example.gold ? GOLD_FACTOR : FACTOR)} an, zahlen die Förderer zusammen ${num(ex.external)} FP ein; dein Eigenanteil liegt bei ${num(ex.ownShare)} FP. Davon zahlst du ${num(ex.upfront)} FP vorab, damit dir niemand einen Platz wegschnappen kann.</p>
    <div class="scroll">
      <table class="example">
        <thead><tr><th scope="col">Platz</th><th scope="col">Belohnung</th><th scope="col">Einzahlung (${factorText(example.gold ? GOLD_FACTOR : FACTOR)})</th><th scope="col">Vorher sichern</th></tr></thead>
        <tbody>
${exRows.map((slot) => `          <tr><th scope="row">P${slot.slot}</th><td>${num(slot.reward)} FP</td><td>${slot.offered ? num(slot.contribution) + " FP" : "–"}</td><td>${slot.offered && slot.secure != null ? num(slot.secure) + " FP" : "–"}</td></tr>`).join("\n")}
        </tbody>
      </table>
    </div>
    <p>„Vorher sichern“ ist, was du vor dem jeweiligen Förderer selbst einzahlst: Danach ist höchstens noch das Doppelte seiner Einzahlung offen, und niemand kann ihn mehr überbieten. Die Zeile für den Förderchat lautet dann etwa „Dani ${esc(ABBR[building.id] || page.short)} P5 P4 P3 P2 P1“.</p>
  </section>

  <section aria-labelledby="summe">
    <h2 id="summe">Was der Ausbau insgesamt kostet</h2>
    <ul class="sums">
${milestones.map((level) => `      <li>Bis Stufe ${level}: <b>${num(sumTo(level))} FP</b></li>`).join("\n")}
    </ul>
    <p>Gezählt sind die Gesamtkosten aller Stufen von 1 an — also das, was im Bauwerk landet, egal ob von dir oder von den Förderern.</p>
  </section>

  <section aria-labelledby="tabelle">
    <h2 id="tabelle">Alle Stufen von ${esc(name)}</h2>
    <p>Die Stufe ist die, die gefördert wird: „${example.level}“ heißt von ${example.level - 1} auf ${example.level}. Je Platz steht oben die Belohnung, darunter die Einzahlung mit Faktor 1,9${hasGold ? " — auf Gold-Stufen ab 101 mit 1,0, weil dort nur der Gold-Mäzen-Bonus zählt" : ""}. Ein Tipp auf die Stufe öffnet sie im Rechner, dort lässt sich jeder Faktor von 1,00 bis 2,00 einstellen.</p>
    <div class="scroll">
      <table class="levels">
        <thead><tr><th scope="col">Stufe</th><th scope="col">Kosten</th>${slotHeads}<th scope="col">Eigen</th></tr></thead>
        <tbody>
${tableRows}
        </tbody>
      </table>
    </div>
    <p class="fine">„Eigen“ ist dein Eigenanteil, wenn alle Plätze vergeben werden. „–“ heißt: Diesen Platz gibt es auf der Stufe nicht${hasGold ? " (P6 und P7 nur auf Gold-Stufen)" : ""}, er bringt keine FP, oder die Gesamtkosten reichen nicht für ihn.</p>
  </section>

  <section aria-labelledby="weitere">
    <h2 id="weitere">Weitere Bauwerke</h2>
    <p class="links">
      ${otherLinks}
    </p>
    <p>Alle anderen Legendären Bauwerke findest du direkt im <a href="/">Förderrechner</a>.</p>
  </section>
</main>

<footer class="foot">
  <p>Kosten: <a href="https://de.wiki.forgeofempires.com/" rel="noopener noreferrer">Forge of Empires Wiki</a> (© InnoGames GmbH), Stand ${date(COSTS.generated)}. Belohnungen nach den Regeln seit dem Prestige-Update aus den Kosten berechnet. Alle Angaben ohne Gewähr — im Zweifel gilt das Spiel.</p>
  <p>cipher ist ein inoffizielles Fan-Projekt und steht in keiner Verbindung zur InnoGames GmbH. „Forge of Empires“ ist eine Marke der InnoGames GmbH.</p>
  <nav class="foot-links" aria-label="Weiteres">
    <a href="/">Förderrechner</a>
    <a href="/rundgang">Rundgang</a>
    <a href="./impressum.html">Impressum</a>
    <a href="./datenschutz.html">Datenschutz</a>
  </nav>
</footer>

</body>
</html>
`;
}

// ------------------------------------------------------------------- Lauf

if (require.main === module) {
  const check = process.argv.includes("--check");
  let stale = 0;
  for (const page of PAGES) {
    const file = path.join(ROOT, page.slug + ".html");
    const html = renderPage(page);
    const before = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
    if (before === html) continue;
    stale++;
    if (check) process.stdout.write(`${page.slug}.html ist nicht aktuell.\n`);
    else {
      fs.writeFileSync(file, html);
      process.stdout.write(`${page.slug}.html geschrieben.\n`);
    }
  }
  if (check && stale) process.exit(1);
}

module.exports = { PAGES, renderPage, SITE };
