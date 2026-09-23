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
    "Tower_of_Babel": "Babel",
    "Statue_of_Zeus": "Zeus",

    // Eisenzeit
    "Colosseum": "Kolo",
    "Lighthouse_of_Alexandria": "LT",

    // Frühes Mittelalter
    "Hagia_Sophia": "Hagia",
    "Cathedral_of_Aachen": "Aachen",
    "Galata_Tower": "Galata",

    // Hochmittelalter
    "St._Mark's_Basilica": "Markus",
    "Notre_Dame": "ND",

    // Spätes Mittelalter
    "Saint_Basil's_Cathedral": "Basi",
    "Castel_del_Monte": "CdM",

    // Kolonialzeit
    "Frauenkirche_of_Dresden": "FK",
    "Deal_Castle": "Deal",

    // Industriezeitalter
    "Royal_Albert_Hall": "RAH",
    "Capitol": "Kapi",

    // Jahrhundertwende
    "Château_Frontenac": "CF",
    "Alcatraz": "Alca",

    // Moderne
    "Space_Needle": "SN",
    "Atomium": "Atom",

    // Postmoderne
    "Cape_Canaveral": "CC",
    "The_Habitat": "Habi",

    // Gegenwart
    "Lotus_Temple": "Lotus",
    "Innovation_Tower": "Inno",

    // Morgen
    "Voyager_V1": "Voy",
    "Truce_Tower": "FT",

    // Zukunft
    "The_Arc": "Arche",
    "Rain_Forest_Project": "RWP",

    // Arktische Zukunft
    "Gaea_Statue": "Gaea",
    "Seed_Vault": "Tresor",
    "Arctic_Orangery": "AO",

    // Ozeanische Zukunft
    "Atlantis_Museum": "AM",
    "The_Kraken": "Kraken",
    "The_Blue_Galaxy": "BG",

    // Virtuelle Zukunft
    "Terracotta_Army": "TA",
    "Himeji_Castle": "Himeji",

    // Mars
    "Star_Gazer": "SG",
    "The_Virgo_Project": "Virgo",

    // Asteroidengürtel
    "Space_Carrier": "WF",

    // Venus
    "Flying_Island": "FI",

    // Jupitermond
    "A.I._Core": "KI",

    // Titan
    "Saturn_VI_Gate_PEGASUS": "Pegasus",
    "Saturn_VI_Gate_CENTAURUS": "Centaurus",
    "Saturn_VI_Gate_HYDRA": "Hydra",

    // Raumfahrt-Hub
    "Stellar_Warship": "Stellares",
    "Cosmic_Catalyst": "Katalysator",

    // Stellares Zeitalter
    "Shattered_Horizon_Siphon": "Siphon"
  };
});
