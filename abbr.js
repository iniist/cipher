/*!
 * cipher — Kürzel der Legendären Bauwerke
 *
 * So, wie sie im Förderchat getippt werden: "AO" statt "Arktische
 * Orangerie", "Obsi" statt "Observatorium". Sie gelten, sobald oben beim
 * Bauwerk der Schalter "Kürzel" an ist.
 *
 * Diese Datei ist von Hand gepflegt und wird von keinem Import angefasst.
 * Ein Kürzel ändern heißt: den Text rechts ändern, fertig. Links steht der
 * Schlüssel aus data.js (.id), der bleibt, wie er ist.
 *
 * test/abbr.test.js prüft, dass jedes Bauwerk genau ein Kürzel hat, dass
 * keines doppelt vorkommt und dass keines länger als 12 Zeichen ist.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.CIPHER_ABBR = factory();
})(typeof self !== "undefined" ? self : globalThis, function () {
  "use strict";

  return {
    // Ohne Zeitalter
    "Observatory": "Obsi",
    "Temple_of_Relics": "RT",
    "Oracle_of_Delphi": "Orakel",

    // Bronzezeit
    "Tower_of_Babel": "TzB",
    "Statue_of_Zeus": "Zeus",

    // Eisenzeit
    "Colosseum": "Kolosseum",
    "Lighthouse_of_Alexandria": "Leuchti",

    // Frühes Mittelalter
    "Hagia_Sophia": "Hagia",
    "Cathedral_of_Aachen": "AD",
    "Galata_Tower": "Gala",

    // Hochmittelalter
    "St._Mark's_Basilica": "MD",
    "Notre_Dame": "ND",

    // Spätes Mittelalter
    "Saint_Basil's_Cathedral": "Basilius",
    "Castel_del_Monte": "CdM",

    // Kolonialzeit
    "Frauenkirche_of_Dresden": "DF",
    "Deal_Castle": "DC",

    // Industriezeitalter
    "Royal_Albert_Hall": "RAH",
    "Capitol": "Kapitol",

    // Jahrhundertwende
    "Château_Frontenac": "Château",
    "Alcatraz": "Alca",

    // Moderne
    "Space_Needle": "Needle",
    "Atomium": "Atom",

    // Postmoderne
    "Cape_Canaveral": "CC",
    "The_Habitat": "Habitat",

    // Gegenwart
    "Lotus_Temple": "Lotus",
    "Innovation_Tower": "Inno",

    // Morgen
    "Voyager_V1": "Voyager",
    "Truce_Tower": "FT",

    // Zukunft
    "The_Arc": "Arche",
    "Rain_Forest_Project": "Regen",

    // Arktische Zukunft
    "Gaea_Statue": "Gaea",
    "Seed_Vault": "ST",
    "Arctic_Orangery": "AO",

    // Ozeanische Zukunft
    "Atlantis_Museum": "Atlantis",
    "The_Kraken": "Kraken",
    "The_Blue_Galaxy": "BG",

    // Virtuelle Zukunft
    "Terracotta_Army": "TA",
    "Himeji_Castle": "Himeji",

    // Mars
    "Star_Gazer": "Gazer",
    "The_Virgo_Project": "Virgo",

    // Asteroidengürtel
    "Space_Carrier": "WF",

    // Venus
    "Flying_Island": "Insel",

    // Jupitermond
    "A.I._Core": "KI",

    // Titan
    "Saturn_VI_Gate_PEGASUS": "PEGASUS",
    "Saturn_VI_Gate_CENTAURUS": "CENTAURUS",
    "Saturn_VI_Gate_HYDRA": "HYDRA",

    // Raumfahrt-Hub
    "Stellar_Warship": "Stellares",
    "Cosmic_Catalyst": "Katalysator",

    // Stellares Zeitalter
    "Shattered_Horizon_Siphon": "Siphon"
  };
});
