/**
 * Stufenkosten seit dem Prestige-Update aus dem Forge of Empires Wiki von
 * InnoGames holen und als kosten.js ablegen.
 *
 *   node tools/import-inno.js            holen, pruefen, kosten.js schreiben
 *   node tools/import-inno.js --check    nur holen und pruefen
 *
 * Quelle ist https://de.wiki.forgeofempires.com — nicht das Fandom-Wiki, aus
 * dem data.js stammt. Die Seiten dort sind laut Kopfzeile automatisch aus den
 * Spieldaten erzeugt. Gelesen wird der Wikitext ueber die MediaWiki-API; die
 * Stufentabelle hat je Zeile Stufe, Kosten in FP, Ranglistenpunkte, Kupfer-
 * Bonus, Gildengueter und Gold-Bonus. Gebraucht werden nur Stufe und Kosten.
 *
 * Bevor etwas geschrieben wird, muss jede Tabelle diese Pruefungen bestehen:
 *   - lueckenlos von Stufe 1 an, bis 500 bei Gold-Bauwerken, bis 200 sonst
 *   - die Summe passt zu den Gesamtkosten aus Artikel 7009 von InnoGames:
 *     bei Gold-Bauwerken exakt, bei Kupfer-Bauwerken bis auf die Rundung auf
 *     volle Tausend, die der Artikel angibt
 *   - die Ablesungen aus dem Spiel (STICHPROBEN) stimmen exakt
 * Ausnahme ist der Horizontriss-Siphon: Seine Wiki-Tabelle stimmt mit dem
 * Spiel (Stufe 64: 265.600 FP), ihre Summe aber nicht mit dem Artikel
 * (516.894.950 statt 756.777.300). Dem Spiel wird geglaubt.
 *
 * Gelesen wird mit curl, nicht mit fetch: curl beachtet einen Proxy aus der
 * Umgebung, fetch in Node nicht.
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const DATA = require(path.join(ROOT, "data.js"));
const Calc = require(path.join(ROOT, "calc.js"));
const TARGET = path.join(ROOT, "kosten.js");
const API = "https://de.wiki.forgeofempires.com/api.php";

/** Seitentitel, die nicht einfach der Name mit Unterstrichen sind. */
const TITLES = {
  "A.I._Core": "K.I._Kern"
};

/** Gesamtkosten laut InnoGames-Support, Artikel 7009 (5.11.2026). */
const OFFICIAL = {
  "Statue_of_Zeus": 755725990, "Colosseum": 755740095, "Cathedral_of_Aachen": 755756655,
  "St._Mark's_Basilica": 755774620, "Castel_del_Monte": 755787935, "Deal_Castle": 755802020,
  "Royal_Albert_Hall": 755823150, "Alcatraz": 755832405, "Château_Frontenac": 755832405,
  "Lotus_Temple": 755852635, "The_Arc": 755880935, "Arctic_Orangery": 755929465,
  "Seed_Vault": 755929465, "The_Kraken": 755944845, "The_Blue_Galaxy": 755944845,
  "Terracotta_Army": 755962810, "Himeji_Castle": 755962810, "The_Virgo_Project": 755978095,
  "Space_Carrier": 755993475, "Observatory": 755774620,
  "Tower_of_Babel": 5358000, "Lighthouse_of_Alexandria": 5508000, "Hagia_Sophia": 5674000,
  "Galata_Tower": 5716000, "Notre_Dame": 5835000, "Saint_Basil's_Cathedral": 5997000,
  "Frauenkirche_of_Dresden": 6148000, "Capitol": 6313000, "Space_Needle": 6622000,
  "Atomium": 6622000, "Cape_Canaveral": 6740000, "The_Habitat": 6740000,
  "Innovation_Tower": 6864000, "Voyager_V1": 7024000, "Truce_Tower": 7024000,
  "Rain_Forest_Project": 7178000, "Gaea_Statue": 7412000, "Atlantis_Museum": 7576000,
  "Star_Gazer": 7890000, "Flying_Island": 8210000, "A.I._Core": 8367000,
  "Saturn_VI_Gate_CENTAURUS": 10003000, "Saturn_VI_Gate_PEGASUS": 9406000,
  "Saturn_VI_Gate_HYDRA": 10594000, "Stellar_Warship": 19148000, "Cosmic_Catalyst": 16876000,
  "Temple_of_Relics": 5350000, "Oracle_of_Delphi": 5354000
};

/** Bauwerke, deren Summe vom Artikel abweichen darf (siehe oben). */
const KNOWN_OFF = { "Shattered_Horizon_Siphon": true };

/** Gesamt-FP aus dem Spiel abgelesen (5.11.2026), siehe test/prestige.test.js. */
const STICHPROBEN = [
  ["The_Arc", 189, 136088], ["Castel_del_Monte", 112, 22732],
  ["Saturn_VI_Gate_HYDRA", 89, 28556], ["The_Blue_Galaxy", 103, 13758],
  ["Himeji_Castle", 102, 12781], ["Terracotta_Army", 102, 12781],
  ["Arctic_Orangery", 155, 87593], ["Alcatraz", 122, 38357],
  ["Château_Frontenac", 102, 9237], ["Space_Carrier", 78, 7008],
  ["Observatory", 102, 7604], ["The_Kraken", 112, 26574],
  ["Shattered_Horizon_Siphon", 64, 265600]
];

/** Die Kupfer-Kategorie rundet der Artikel auf volle Tausend. */
const COPPER_ROUNDING = 500;

function titleOf(building) {
  return TITLES[building.id] || building.name.replace(/ /g, "_");
}

function fetchWikitext(title) {
  const url = API + "?action=parse&prop=wikitext&format=json&redirects=1&page=" + encodeURIComponent(title);
  const body = execFileSync("curl", ["-sS", "--fail", "-m", "60", url], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const data = JSON.parse(body);
  if (!data.parse) throw new Error("Seite fehlt: " + title + " (" + JSON.stringify(data.error || data).slice(0, 120) + ")");
  return data.parse.wikitext["*"];
}

/**
 * Die Stufentabelle lesen: Zeilen mit Stufe und Kosten, beide rechtsbuendig.
 * Tausenderpunkte fallen weg.
 * @returns {number[]} Kosten je Stufe, Index 0 = Stufe 1
 */
function parseCosts(wikitext) {
  const pattern = /\|-\s*\n\| style="text-align:right" \| (\d+)\s*\n\| style="text-align:right" \| ([\d.]+)\s*\n/g;
  const costs = [];
  let match;
  while ((match = pattern.exec(wikitext))) {
    const level = Number(match[1]);
    if (level !== costs.length + 1) {
      throw new Error("Stufe " + level + " folgt auf " + costs.length + " — Tabelle hat eine Luecke");
    }
    costs.push(Number(match[2].replace(/\./g, "")));
  }
  return costs;
}

function check(building, costs) {
  const problems = [];
  const expected = Calc.hasGold(building.id) ? 500 : Calc.COPPER_MAX_LEVEL;
  if (costs.length !== expected) problems.push(costs.length + " Stufen statt " + expected);
  if (costs.some((cost) => !(cost > 0))) problems.push("Kosten ohne Wert");

  const sum = costs.reduce((a, b) => a + b, 0);
  const official = OFFICIAL[building.id];
  if (official == null && !KNOWN_OFF[building.id]) problems.push("keine offizielle Summe hinterlegt");
  if (official != null && !KNOWN_OFF[building.id]) {
    const allowed = Calc.hasGold(building.id) ? 0 : COPPER_ROUNDING;
    if (Math.abs(sum - official) > allowed) {
      problems.push("Summe " + sum + " statt " + official + " laut Artikel 7009");
    }
  }
  return { problems, sum };
}

function main() {
  const onlyCheck = process.argv.includes("--check");
  const result = {};
  const errors = [];

  DATA.buildings.forEach((building) => {
    try {
      const costs = parseCosts(fetchWikitext(titleOf(building)));
      const { problems, sum } = check(building, costs);
      if (problems.length) errors.push(building.name + ": " + problems.join("; "));
      result[building.id] = costs;
      process.stdout.write(`  ${building.name.padEnd(26)} ${String(costs.length).padStart(3)} Stufen, Summe ${sum}\n`);
    } catch (error) {
      errors.push(building.name + ": " + error.message);
    }
  });

  STICHPROBEN.forEach(([id, level, cost]) => {
    const value = result[id] && result[id][level - 1];
    if (value !== cost) errors.push(`Stichprobe ${id} Stufe ${level}: ${value} statt ${cost}`);
  });

  if (errors.length) {
    process.stderr.write("\nNicht uebernommen:\n" + errors.map((line) => "  " + line + "\n").join(""));
    process.exit(1);
  }
  process.stdout.write(`\n${Object.keys(result).length} Bauwerke geprueft, ${STICHPROBEN.length} Stichproben exakt.\n`);
  if (onlyCheck) return;

  fs.writeFileSync(TARGET, render(result));
  process.stdout.write("kosten.js geschrieben.\n");
}

/** kosten.js: eine Zeile je Bauwerk, damit ein Diff zeigt, wo sich etwas tut. */
function render(result) {
  const date = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
  const lines = Object.keys(result).map((id) =>
    "      " + JSON.stringify(id) + ": [" + result[id].join(",") + "]");
  return `/*!
 * cipher — Stufenkosten seit dem Prestige-Update (5.11.2026)
 *
 * Quelle: Forge of Empires Wiki, https://de.wiki.forgeofempires.com
 * © InnoGames GmbH. Uebernommen werden nur die Kosten je Stufe.
 *
 * Aufbau: costs[Bauwerk-Schluessel][stufe - 1] = Gesamt-FP der Stufe, die
 * gefoerdert wird. Gold-Bauwerke reichen bis 500, alle anderen bis 200.
 *
 * Erzeugt von tools/import-inno.js — von Hand nichts aendern.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.CIPHER_COSTS = factory();
})(typeof self !== "undefined" ? self : globalThis, function () {
  "use strict";
  return {
    generated: ${JSON.stringify(date)},
    source: "https://de.wiki.forgeofempires.com",
    costs: {
${lines.join(",\n")}
    }
  };
});
`;
}

main();
