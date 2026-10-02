/*!
 * cipher — Oberflaeche
 *
 * Bindet den Rechenkern (calc.js) an das DOM. Die Datei ist in Abschnitte
 * geteilt: Speicher, Zustand, Rendern, Ereignisse, Easter Eggs.
 *
 * Es werden keinerlei Daten an einen Server geschickt. Alles, was cipher
 * merkt, liegt im localStorage des Browsers und laesst sich dort loeschen.
 */
(function (window, document) {
  "use strict";

  var DATA = window.CIPHER_DATA;
  var Calc = window.CipherCalc;
  // Kuerzel je Bauwerk, von Hand gepflegt in abbr.js. Fehlt die Datei oder
  // ein Eintrag, gilt der volle Name.
  var ABBR = window.CIPHER_ABBR || {};

  // ---------------------------------------------------------------- Konstanten

  /** Schluessel im localStorage. */
  var KEY = {
    state: "cipher:state",           // Auswahl, Faktor, Name, Theme
    favorites: "cipher:favorites",   // Gemerkte Bauwerk/Stufe-Paare
    totals: "cipher:totals",         // Selbst eingetragene Gesamtkosten
    p1: "cipher:p1",                 // Selbst eingetragene P1-Belohnungen
    collection: "cipher:collection", // Gesammelte Chat-Zeilen mehrerer Bauwerke
    shorts: "cipher:shorts"          // Selbst vergebene Kuerzel je Bauwerk
  };

  /** Aeltere Schluessel aus dem Vorgaenger, werden einmalig uebernommen. */
  var LEGACY_KEY = { state: "lgr-state", totals: "lgr-t", p1: "lgr-p1" };

  /** Faktoren, die als Schnellwahl angeboten werden. */
  var FACTOR_PRESETS = [180, 185, 190, 192, 195, 200];

  /** Grenzen des Arche-Faktors, als Ganzzahl in Prozent. */
  var FACTOR_MIN = 180;
  var FACTOR_MAX = 200;

  /**
   * Hoechste Stufe, die das Stufenfeld annimmt.
   *
   * Frueher war hier die maxLevel des Bauwerks die Wand. Die stammt aber aus
   * dem Wiki und sagt nur, bis wohin dort Stufen dokumentiert sind — nicht,
   * wo das Spiel aufhoert. Wer sein Bauwerk darueber hinaus gezogen hat,
   * konnte seine Stufe nicht einmal eintippen: das Feld sprang wortlos
   * zurueck. Die Kostenformel und die Kurve des Zeitalters rechnen beliebig
   * weit, also darf das Feld das auch. Die Grenze hier ist nur noch ein
   * Schutz gegen Zahlen, die kein Spielstand hergibt.
   */
  var LEVEL_MAX = 1000;

  var THEMES = ["light", "dark", "contrast", "writer", "space", "forge"];
  var DEFAULT_BUILDING = "The_Arc";
  var MAX_FAVORITES = 12;

  /**
   * Wie viele Zeilen die Sammlung haelt. Mehr als ein gutes Dutzend
   * Bauwerke stellt niemand auf einmal in die Foerdergruppe; die Grenze
   * ist vor allem ein Schutz gegen eine Liste, die keiner mehr uebersieht.
   * Laeuft sie ueber, faellt die aelteste Zeile heraus.
   */
  var MAX_COLLECTED = 15;

  /**
   * Obergrenze fuer einen getippten Betrag. Die teuerste bekannte Stufe
   * liegt bei gut 86.000 FP, ein Platz darin bei knapp 10.000 — eine
   * Million ist reichlich Luft und faengt trotzdem ab, wenn jemand eine
   * Stelle zu viel tippt.
   */
  var AMOUNT_MAX = 1000000;

  /**
   * Hoechstlaenge eines selbst vergebenen Kuerzels. Der laengste Name im
   * Datensatz ist "Basilius-Kathedrale" mit 19 Zeichen; 24 laesst Luft und
   * haelt die Chat-Zeile trotzdem kurz — darum geht es bei einem Kuerzel.
   */
  var SHORT_MAX = 24;

  /** Quellen, die keinen Hinweis ausloesen — sie gelten als belastbar. */
  var TRUSTED_SOURCES = { table: true, formula: true, manual: true };

  /**
   * Quellen, deren P1 danebenliegen kann. Ein zu hohes P1 ist die
   * gefaehrliche Richtung, weil die Absicherung dann zu niedrig ausfaellt.
   * Darum rechnet sie bei diesen Quellen mit P1 minus einem Zuschlag, der
   * mit dem Abstand zur naechsten gesicherten Stufe waechst (Calc.p1Slack,
   * dort auch die Messung); angezeigt wird weiter das echte P1.
   */
  var UNSURE_P1_SOURCES = { derived: true, conflict: true };

  var prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ------------------------------------------------------------------ Helfer

  function $(id) { return document.getElementById(id); }

  /** Zahl in deutscher Schreibweise, z. B. 12.345. */
  function formatNumber(value) { return value.toLocaleString("de-DE"); }

  /**
   * "JJJJ-MM-TT" als deutsches Datum. Nicht ueber new Date(text): das laese
   * den Text als UTC-Mitternacht, und westlich von Greenwich stuende dann
   * der Vortag da.
   */
  function formatDate(iso) {
    var parts = String(iso).split("-").map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) return String(iso);
    return new Date(parts[0], parts[1] - 1, parts[2]).toLocaleDateString("de-DE");
  }

  /** Faktor als Dezimalzahl, z. B. 190 -> "1,90". */
  function formatFactor(factor) { return (factor / 100).toFixed(2).replace(".", ","); }

  /** Auf den gueltigen Bereich begrenzen; 0 heisst "unbrauchbar". */
  function clampFactor(value) {
    if (!(value > 0)) return 0;
    return Math.min(FACTOR_MAX, Math.max(FACTOR_MIN, Math.round(value)));
  }

  /**
   * Eine Eingabe als Faktor lesen. Zugelassen ist, was Leute tatsaechlich
   * tippen: "1,90", "1.90", "1,9", "190" und "190 %".
   * @returns {number} Faktor in Prozent, oder 0 wenn nichts Brauchbares drinstand
   */
  function parseFactor(text) {
    var cleaned = String(text).replace(/\s|%/g, "").replace(",", ".");
    var value = parseFloat(cleaned);
    if (isNaN(value)) return 0;
    // Unter 10 ist es als Dezimalzahl gemeint (1,9), darueber als Prozent (190).
    return clampFactor(value < 10 ? value * 100 : value);
  }

  /**
   * Einen getippten Betrag lesen. Punkte, Leerzeichen und ein angehaengtes
   * "FP" duerfen drinstehen — 10.000, 10000 und "10.000 FP" sind dasselbe.
   * @returns {number} 0 heisst "unbrauchbar"
   */
  function parseAmount(text) {
    var digits = String(text).replace(/[^0-9]/g, "");
    var value = parseInt(digits, 10);
    return value > 0 && value <= AMOUNT_MAX ? value : 0;
  }

  /** Text so einsetzen, dass er nie als HTML gelesen wird. */
  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
    });
  }

  // ----------------------------------------------------------------- Speicher

  function read(key, fallback) {
    try {
      var raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function write(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      // Privater Modus oder voller Speicher: cipher laeuft weiter, merkt sich
      // fuer diesen Besuch nur nichts.
    }
  }

  function remove(key) {
    try { window.localStorage.removeItem(key); } catch (error) { /* egal */ }
  }

  /** Einmalig die Daten des Vorgaengers uebernehmen, dann dessen Schluessel loeschen. */
  function migrateLegacyStorage() {
    if (read(KEY.state, null) !== null) return;

    var legacy = read(LEGACY_KEY.state, null);
    if (legacy) {
      write(KEY.state, {
        building: legacy.lg,
        level: legacy.lvl,
        factor: legacy.f,
        name: legacy.name,
        // Der Vorgaenger nannte das Feld "off", meinte aber "angeboten":
        // es stand dort als `checked` an der Checkbox. Also NICHT invertieren.
        enabled: legacy.off,
        theme: legacy.mode
      });
    }
    var totals = read(LEGACY_KEY.totals, null);
    if (totals) write(KEY.totals, totals);
    var p1 = read(LEGACY_KEY.p1, null);
    if (p1) write(KEY.p1, p1);

    if (legacy || totals || p1) {
      remove(LEGACY_KEY.state);
      remove(LEGACY_KEY.totals);
      remove(LEGACY_KEY.p1);
    }
  }

  /** Obergrenze fuer den mitgebrachten Speicher, gegen absurde Links. */
  var MOVE_LIMIT = 500000;

  /**
   * Daten von der alten Adresse uebernehmen.
   *
   * cipher lief zuerst unter cipher-calc.netlify.app. Browser trennen den
   * Speicher je Adresse; umzug.js haengt ihn dort beim Weiterleiten hinter
   * "#umzug=". Hier wird er einmal uebernommen und der Anhang sofort aus
   * der Adresse entfernt — er soll weder in Lesezeichen noch beim Teilen
   * landen.
   *
   * Nur bekannte Schluessel und nur, wo hier noch nichts steht: wer die neue
   * Adresse schon benutzt hat, behaelt seinen Stand. Die Werte laufen danach
   * durch dieselben Pruefungen wie alles, was aus dem Speicher kommt.
   * @returns {boolean} ob etwas uebernommen wurde
   */
  function importMovedStorage() {
    var match = /^#umzug=(.*)$/.exec(window.location.hash);
    if (!match) return false;
    try {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    } catch (error) { /* Dann bleibt der Anhang stehen — schadet nicht. */ }
    if (match[1].length > MOVE_LIMIT) return false;

    var payload;
    try { payload = JSON.parse(decodeURIComponent(match[1])); } catch (error) { return false; }
    if (!payload || payload.v !== 1 || !payload.d || typeof payload.d !== "object") return false;

    var known = Object.keys(KEY).map(function (name) { return KEY[name]; })
      .concat(Object.keys(LEGACY_KEY).map(function (name) { return LEGACY_KEY[name]; }));
    var moved = false;
    known.forEach(function (key) {
      var value = payload.d[key];
      if (typeof value !== "string") return;
      try { JSON.parse(value); } catch (error) { return; }
      try {
        if (window.localStorage.getItem(key) !== null) return;
        window.localStorage.setItem(key, value);
        moved = true;
      } catch (error) { /* Speicher gesperrt — dann eben nicht. */ }
    });
    return moved;
  }

  // ------------------------------------------------------------------ Zustand

  var movedIn = importMovedStorage();
  migrateLegacyStorage();

  // ------------------------------------------------------------------ Welten

  /**
   * Die deutschen Spielwelten. Wer auf mehreren spielt, foerdert dort andere
   * Bauwerke mit einem anderen Faktor — darum hat jede Welt ihren eigenen
   * Stand. Seit Yorkton im Juli 2024 ist keine dazugekommen; kommt eine,
   * reicht eine Zeile hier.
   */
  var WORLDS = [
    { id: "de1", name: "Arvahall" }, { id: "de2", name: "Brisgard" },
    { id: "de3", name: "Cirgard" }, { id: "de4", name: "Dinegu" },
    { id: "de5", name: "Eldenborough" }, { id: "de6", name: "Fel Dranghyr" },
    { id: "de7", name: "Greifental" }, { id: "de8", name: "Houndsmoor" },
    { id: "de9", name: "Jaims" }, { id: "de10", name: "Korch" },
    { id: "de11", name: "Langendorn" }, { id: "de12", name: "Mount Killmore" },
    { id: "de13", name: "Noarsil" }, { id: "de14", name: "Odhrorvar" },
    { id: "de15", name: "Parkog" }, { id: "de16", name: "Qunrir" },
    { id: "de17", name: "Rugnir" }, { id: "de18", name: "Sinerania" },
    { id: "de19", name: "Tuulech" }, { id: "de20", name: "Uceria" },
    { id: "de21", name: "Vingrid" }, { id: "de22", name: "Walstrand" },
    { id: "de23", name: "Xyr" }, { id: "de24", name: "Yorkton" }
  ];
  var worldById = {};
  WORLDS.forEach(function (world) { worldById[world.id] = world; });

  /** Welche Welt gerade offen ist und welcher die alten Schluessel gehoeren. */
  var WORLD_KEY = "cipher:world";

  /**
   * Die Felder von `cipher:state`, die zur Welt gehoeren — auch, ob die
   * Chat-Zeile mit FP kopiert wird: das haelt jede Gilde anders. Alles andere —
   * Theme, Spielername, Kuerzel-Schalter, die Lesarten von Stufe, Sichern
   * und Plaetzen — gilt ueberall gleich.
   */
  var WORLD_FIELDS = ["building", "level", "factor", "enabled", "taken", "slotsFor",
    "slotFactors", "slotPays", "ownPaid", "ownPaidFor", "foreign", "chatMode"];

  /**
   * Die Welt, die zuerst gewaehlt wurde ("home"), behaelt die Schluessel, die
   * es schon vor den Welten gab. Nichts wird dafuer umkopiert: wer nie eine
   * zweite Welt aufmacht, hat genau den Speicher wie vorher, und fiele der
   * Umschalter wieder weg, laege alles noch an seinem Platz. Jede weitere
   * Welt legt ihren Teil unter "cipher:w:<welt>:" ab.
   *
   * Ohne Eintrag ist noch keine Welt gewaehlt; dann laeuft alles wie immer.
   * Wer eine Welt wieder abwaehlt, landet mit `active: null` genau dort:
   * die alten Schluessel ohne Namen. Die erste Welt bleibt dabei vermerkt,
   * damit die anderen Welten ihren Stand behalten und die erste ihn bei der
   * naechsten Wahl zurueckbekommt — Abwaehlen loescht nie etwas.
   */
  function normaliseWorld(value) {
    if (!value || !worldById[value.home]) return null;
    if (value.active === null) return { home: value.home, active: null };
    return { home: value.home, active: worldById[value.active] ? value.active : value.home };
  }

  var world = normaliseWorld(read(WORLD_KEY, null));

  /** Liegt die offene Welt unter eigenen Schluesseln? */
  var awayFromHome = Boolean(world && world.active && world.active !== world.home);

  function worldPrefix(id) { return "cipher:w:" + id + ":"; }

  /** Der Schluessel, unter dem die offene Welt `key` ablegt. */
  function inWorld(key) {
    return awayFromHome ? worldPrefix(world.active) + key.slice("cipher:".length) : key;
  }

  /** Schluessel fuer Favoriten und Sammlung der offenen Welt. */
  var HERE = { favorites: inWorld(KEY.favorites), collection: inWorld(KEY.collection) };

  /** Hat diese Welt schon etwas gespeichert? Fuer den Hinweis in der Liste. */
  function worldInUse(id) {
    if (world && world.home === id) return true;
    try {
      return window.localStorage.getItem(worldPrefix(id) + "state") !== null ||
        window.localStorage.getItem(worldPrefix(id) + "favorites") !== null ||
        window.localStorage.getItem(worldPrefix(id) + "collection") !== null;
    } catch (error) {
      return false;
    }
  }

  /** Die gespeicherten Felder der offenen Welt mit den allgemeinen vereinen. */
  function readStoredState() {
    var shared = read(KEY.state, {});
    if (!awayFromHome) return shared;
    var own = read(inWorld(KEY.state), {});
    var merged = {};
    Object.keys(shared).forEach(function (field) {
      if (WORLD_FIELDS.indexOf(field) < 0) merged[field] = shared[field];
    });
    WORLD_FIELDS.forEach(function (field) {
      if (own && field in own) merged[field] = own[field];
    });
    return merged;
  }

  /** Teil des Zustands, der nur zur Welt oder nur nicht zur Welt gehoert. */
  function pickFields(source, ofWorld) {
    var part = {};
    Object.keys(source).forEach(function (field) {
      if ((WORLD_FIELDS.indexOf(field) >= 0) === ofWorld) part[field] = source[field];
    });
    return part;
  }

  var byId = {};
  DATA.buildings.forEach(function (building) { byId[building.id] = building; });

  var stored = readStoredState();
  var state = {
    // Zuletzt gewaehltes Bauwerk, sonst die Voreinstellung — und falls es
    // die im Datensatz einmal nicht geben sollte, das erste ueberhaupt.
    building: byId[stored.building] ? stored.building
      : byId[DEFAULT_BUILDING] ? DEFAULT_BUILDING
      : DATA.buildings[0].id,
    level: Number(stored.level) > 0 ? Math.floor(stored.level) : 10,
    factor: clampFactor(Number(stored.factor)) || 190,
    name: typeof stored.name === "string" ? stored.name : "",
    enabled: normaliseEnabled(stored.enabled),
    // Schon vergebene Plaetze: nicht mehr ausschreiben, aber weiter als
    // Fremdkapital rechnen. Zaehlt nur, wo der Platz auch angeboten ist.
    taken: normaliseTaken(stored.taken),
    // Zu welchem Bauwerk und welcher Stufe die Haekchen gehoeren. Auf einem
    // anderen Bauwerk oder einer anderen Stufe ist wieder alles angeboten.
    // null heisst: alles angeboten, das gilt ueberall.
    slotsFor: null,
    theme: THEMES.indexOf(stored.theme) >= 0 ? stored.theme : "dark",
    // Wie die Zahl im Stufenfeld zu lesen ist. "next" ist die Vorgabe und
    // das, was cipher vorher ohne Wahl getan hat.
    levelMode: stored.levelMode === "current" ? "current" : "next",
    // Wie die Spalte "Sichern" zu lesen ist: als Schritt je Platz
    // oder als laufende Summe. "step" ist die Vorgabe.
    secureMode: stored.secureMode === "total" ? "total" : "step",
    // Eigener Faktor je Platz; null heisst "folgt dem Wert oben".
    slotFactors: normaliseSlotFactors(stored.slotFactors),
    // Getippter Betrag je Platz; null heisst "aus dem Faktor gerechnet".
    slotPays: normaliseSlotPays(stored.slotPays),
    // In welcher Einheit die Zeilen des Blocks gelesen und getippt werden.
    slotUnit: stored.slotUnit === "fp" ? "fp" : "factor",
    slotsOpen: stored.slotsOpen === true,
    // Was du selbst schon im Bauwerk hast; null heisst "der Reihe nach
    // gesichert" wie bisher. Gilt nur fuer das Bauwerk und die Stufe in
    // ownPaidFor — auf der naechsten Stufe faengt der Stand wieder bei null an.
    ownPaid: Number(stored.ownPaid) >= 0 && stored.ownPaid !== null && stored.ownPaid !== "" ? Math.floor(stored.ownPaid) : null,
    ownPaidFor: typeof stored.ownPaidFor === "string" ? stored.ownPaidFor : "",
    // Einzahlungen anderer, die schon im Bauwerk liegen: Fremdeinzahler und
    // Sniper. Je Eintrag ein Betrag, in der Reihenfolge, in der sie getippt
    // wurden; null ist ein Feld, das gerade leer ist. Gehoert wie ownPaid
    // zu der Stufe in ownPaidFor.
    foreign: normaliseForeign(stored.foreign),
    standOpen: stored.standOpen === true,
    // Ob Bauwerke mit ihrem Kuerzel aus abbr.js genannt werden ("AO") oder
    // mit vollem Namen ("Arktische Orangerie"). Aus ist die Vorgabe.
    useAbbr: stored.useAbbr === true,
    // Welche Fassung der Chat-Zeile kopiert wird: nur die Plaetze oder
    // mit den FP je Platz. "points" ist die Vorgabe — die meisten Gilden
    // wollen die Betraege sehen.
    chatMode: stored.chatMode === "plain" ? "plain" : "points"
  };
  state.slotsFor = slotsForOf(stored);

  // Ein Platz traegt entweder einen Faktor oder einen Betrag, nie beides —
  // es ist eine Zahl in zwei Einheiten, und zwei Quellen fuer dieselbe Zahl
  // koennten sich widersprechen. Die Bedienung haelt das ein; hier steht es
  // fuer alles, was aus dem Speicher kommt.
  state.slotPays.forEach(function (pay, index) {
    if (pay != null) state.slotFactors[index] = null;
  });

  /**
   * Immer genau fuenf Eintraege: ein gueltiger Faktor oder null.
   * clampFactor liefert 0 fuer alles Unbrauchbare, daraus wird null.
   */
  function normaliseSlotFactors(value) {
    var result = [];
    for (var i = 0; i < Calc.SLOTS; i++) {
      var own = Array.isArray(value) ? clampFactor(Number(value[i])) : 0;
      result.push(own || null);
    }
    return result;
  }

  /**
   * Immer genau fuenf Eintraege: ein getippter Betrag oder null.
   * Betraege sind ganze Forge-Punkte und groesser als null; alles andere
   * waere keine Einzahlung.
   */
  function normaliseSlotPays(value) {
    var result = [];
    for (var i = 0; i < Calc.SLOTS; i++) {
      var own = Array.isArray(value) ? Math.floor(Number(value[i])) : 0;
      result.push(own > 0 && isFinite(own) ? own : null);
    }
    return result;
  }

  /**
   * Fremdeinzahlungen aus dem Speicher: nur ganze Betraege ueber null.
   * Leere Felder ueberleben das Neuladen nicht, sie sind nur waehrend des
   * Tippens da.
   */
  function normaliseForeign(value) {
    if (!Array.isArray(value)) return [];
    return value.map(function (amount) { return Math.floor(Number(amount)); })
      .filter(function (amount) { return amount > 0 && isFinite(amount); });
  }

  /** Die Fremdeinzahlungen, mit denen gerechnet wird — ohne leere Felder. */
  function foreignAmounts() {
    return state.foreign.filter(function (amount) { return amount > 0; });
  }

  /**
   * In welcher Einheit eine Zeile gelesen wird.
   *
   * Grundsaetzlich die des Blocks — auch fuer einen eingestellten Faktor,
   * denn jeder Faktor ergibt einen Betrag, den man zeigen kann. Wer dort in
   * FP tippt, stellt den Platz damit auf einen Betrag um.
   *
   * Nur ein getippter Betrag bleibt immer in FP: er muesste sonst in einen
   * Faktor uebersetzt werden, und 10.000 FP auf eine Belohnung von 3.200
   * ergeben 3,13 — ausserhalb des zulaessigen Bereichs, also nicht
   * darstellbar.
   * @returns {"factor"|"fp"}
   */
  function slotUnitFor(index) {
    if (state.slotPays[index] != null) return "fp";
    return state.slotUnit;
  }

  /** Ob dieser Platz einen eigenen Wert traegt, in welcher Einheit auch immer. */
  function slotIsOwn(index) {
    return state.slotPays[index] != null || state.slotFactors[index] != null;
  }

  /**
   * Einen Platz auf einen eigenen Faktor stellen. Ein Betrag, der vorher
   * dort stand, faellt damit weg: der Platz traegt eine Zahl, nicht zwei.
   */
  function setSlotFactor(index, factor) {
    state.slotFactors[index] = factor;
    state.slotPays[index] = null;
  }

  /** Dasselbe andersherum: ein Betrag verdraengt den eigenen Faktor. */
  function setSlotPay(index, amount) {
    state.slotPays[index] = amount;
    state.slotFactors[index] = null;
  }

  /** Einen Platz wieder dem Wert oben folgen lassen. */
  function clearSlot(index) {
    state.slotFactors[index] = null;
    state.slotPays[index] = null;
  }

  /** Der Faktor, der fuer jeden Platz tatsaechlich gilt. */
  function effectiveFactors() {
    return state.slotFactors.map(function (own) {
      return own == null ? state.factor : own;
    });
  }

  /**
   * Gerechnet wird immer mit der Stufe, die gefoerdert wird — state.level
   * ist also unabhaengig von der Anzeige. Dieser Versatz uebersetzt zwischen
   * beidem: 1, wenn im Feld die aktuelle Stufe steht, sonst 0.
   * @returns {number}
   */
  function levelOffset() { return state.levelMode === "current" ? 1 : 0; }

  /** Immer genau fuenf Wahrheitswerte, egal was im Speicher lag. */
  function normaliseEnabled(value) {
    var result = [];
    for (var i = 0; i < Calc.SLOTS; i++) {
      result.push(Array.isArray(value) ? value[i] !== false : true);
    }
    return result;
  }

  /** Immer genau fuenf Eintraege; nur ein ausdrueckliches true heisst vergeben. */
  function normaliseTaken(value) {
    var result = [];
    for (var i = 0; i < Calc.SLOTS; i++) {
      result.push(Array.isArray(value) && value[i] === true);
    }
    return result;
  }

  /**
   * Die drei Zustaende eines Platzes, in der Reihenfolge, in der ein Tipp
   * aufs Haekchen sie durchlaeuft: angeboten -> vergeben -> aus -> angeboten.
   *
   * "Vergeben" kommt direkt nach "angeboten", weil das der haeufige Weg ist:
   * P1 und P2 sind belegt, jetzt werden P3 bis P5 ausgeschrieben. Wer das
   * Haekchen dafuer herausnahm, bekam frueher einen Eigenanteil, als haette
   * er P1 und P2 selbst bezahlt.
   */
  function slotStateOf(index) {
    if (!state.enabled[index]) return "off";
    return state.taken[index] ? "taken" : "on";
  }

  function cycleSlot(index) {
    var current = slotStateOf(index);
    state.enabled[index] = current !== "taken";
    state.taken[index] = current === "on";
    state.slotsFor = ownPaidKey();
  }

  /**
   * Zu welcher Stufe gespeicherte Haekchen gehoeren. Ein Stand von vor
   * dieser Regel hat den Schluessel nicht; abweichende Haekchen gehoeren
   * dann zu der Stufe, auf der er gespeichert wurde.
   */
  function slotsForOf(stored) {
    if (typeof stored.slotsFor === "string") return stored.slotsFor;
    var changed = normaliseEnabled(stored.enabled).indexOf(false) >= 0 ||
      normaliseTaken(stored.taken).indexOf(true) >= 0;
    return changed ? state.building + ":" + state.level : null;
  }

  var ownTotals = read(KEY.totals, {});
  var ownP1 = read(KEY.p1, {});
  var favorites = normaliseFavorites(read(HERE.favorites, []));

  /**
   * Die gesammelten Chat-Zeilen, in der Reihenfolge, in der sie gesammelt
   * wurden — das ist die Reihenfolge, in der sie spaeter im Chat stehen.
   */
  var collection = normaliseCollection(read(HERE.collection, []));

  /**
   * Selbst vergebene Kuerzel, nach Bauwerk-Schluessel.
   *
   * Ohne Schalter heisst ein Bauwerk mit vollem Namen, mit Schalter mit
   * seinem Kuerzel aus abbr.js. Was eine Gilde daraus macht, ist beides
   * nicht: die eine schreibt "Orangerie", die naechste "Orang". Das eigene
   * Kuerzel ueberschreibt darum beide Stellungen. Darum steht das hier und nicht in data.js — und weil es am
   * stabilen Schluessel haengt, ueberlebt es jede Erneuerung des Datensatzes.
   */
  var ownShorts = normaliseShorts(read(KEY.shorts, {}));

  /** Nur Eintraege behalten, deren Bauwerk es gibt und die etwas enthalten. */
  function normaliseShorts(value) {
    var result = {};
    if (!value || typeof value !== "object") return result;
    Object.keys(value).forEach(function (id) {
      if (!byId[id]) return;
      var text = cleanShort(value[id]);
      if (text) result[id] = text;
    });
    return result;
  }

  /** Ein getipptes Kuerzel auf das bringen, was gespeichert wird. */
  function cleanShort(text) {
    return typeof text === "string" ? text.trim().slice(0, SHORT_MAX) : "";
  }

  /** Das Kuerzel aus abbr.js, oder "" wenn es keins gibt. */
  function abbrOf(building) {
    var abbr = ABBR[building.id];
    return typeof abbr === "string" ? abbr.trim() : "";
  }

  /**
   * Wie ein Bauwerk ohne eigenes Kuerzel heisst: mit dem Schalter "Kuerzel"
   * das aus abbr.js ("AO"), sonst der volle Name ("Arktische Orangerie").
   */
  function defaultShort(building) {
    return (state.useAbbr && abbrOf(building)) || building.name;
  }

  /**
   * Wie ein Bauwerk genannt wird — ueberall, wo cipher es kurz nennt: in der
   * Chat-Zeile, in der Sammlung, am Merken-Knopf, auf den Favoriten-Chips
   * und in der Suche. Ein eigenes Kuerzel gilt in beiden Stellungen des
   * Schalters — wer es vergibt, meint es ausdruecklich.
   */
  function shortName(building) {
    return ownShorts[building.id] || defaultShort(building);
  }

  /**
   * Nur Eintraege behalten, die wirklich eine Zeile enthalten, und je
   * Bauwerk nur einen. Das Bauwerk steht nur zum Wiedererkennen dabei;
   * gezeigt wird immer der gespeicherte Text, damit eine gesammelte Zeile
   * auch dann noch stimmt, wenn sich der Datensatz darunter geaendert hat.
   */
  function normaliseCollection(value) {
    if (!Array.isArray(value)) return [];
    var seen = {};
    return value.filter(function (entry) {
      if (!entry || typeof entry.text !== "string") return false;
      if (!entry.text.trim()) return false;
      var id = String(entry.id);
      if (seen[id]) return false;
      seen[id] = true;
      return true;
    }).slice(-MAX_COLLECTED).map(function (entry) {
      var result = { id: String(entry.id), text: entry.text };
      if (labelFits(entry.text, entry.label, entry.at)) {
        result.label = entry.label;
        result.at = entry.at;
      }
      return result;
    });
  }

  /**
   * Ob an Stelle `at` der Zeile wirklich `label` steht. Nur dann laesst sich
   * der Name des Bauwerks darin austauschen; Zeilen aus der Zeit vor dem
   * Schalter tragen keine Stelle und bleiben, wie sie sind.
   */
  function labelFits(text, label, at) {
    return typeof label === "string" && label !== "" &&
      Number.isInteger(at) && at >= 0 &&
      text.substr(at, label.length) === label;
  }

  /**
   * Nur Eintraege behalten, deren Bauwerk es noch gibt und deren Stufe passt
   * — und je Bauwerk nur einen.
   *
   * Ein Favorit ist ein Bauwerk; seine Stufe ist die, auf der es gerade
   * steht, und die wandert mit (siehe syncFavoriteLevel). Aeltere Staende
   * konnten dasselbe Bauwerk mehrfach enthalten, weil jede Stufe ein
   * eigener Eintrag war. Davon bleibt der vorderste, also der zuletzt
   * benutzte.
   */
  function normaliseFavorites(value) {
    if (!Array.isArray(value)) return [];
    var seen = {};
    return value.filter(function (entry) {
      if (!entry || !byId[entry.id]) return false;
      var level = Number(entry.level);
      if (!(level >= 1 && level <= LEVEL_MAX)) return false;
      if (seen[entry.id]) return false;
      seen[entry.id] = true;
      return true;
    }).slice(0, MAX_FAVORITES).map(function (entry) {
      return { id: entry.id, level: Math.floor(Number(entry.level)) };
    });
  }

  /**
   * Was zuletzt geschrieben wurde — beim Start der Stand, wie er geladen
   * (oder als Vorgabe gebildet) wurde.
   *
   * Geschrieben wird nur, wenn sich etwas geaendert hat. Vorher legte schon
   * der blosse Aufruf der Seite `cipher:state` an, weil der Start das Theme
   * setzte und render() am Ende immer speicherte. Die Datenschutzerklaerung
   * stuetzt die Speicherung aber darauf, dass sie fuer das *gewuenschte*
   * Weiterarbeiten erforderlich ist (§ 25 Abs. 2 Nr. 2 TDDDG) — eine
   * Vorgabe zu speichern, die niemand gewaehlt hat, ist das nicht.
   */
  var lastPersisted = JSON.stringify(state);

  // Auf einer weiteren Welt zerfaellt der Zustand in zwei Teile: die Felder
  // der Welt unter ihrem eigenen Schluessel, der Rest in `cipher:state`. Dort
  // liegen auch die Weltfelder der ersten Welt, und die bleiben unberuehrt.
  var lastShared = JSON.stringify(pickFields(state, false));
  var lastOwn = JSON.stringify(pickFields(state, true));

  function persistState() {
    var next = JSON.stringify(state);
    if (next === lastPersisted) return;
    lastPersisted = next;
    if (!awayFromHome) {
      write(KEY.state, state);
      return;
    }

    var shared = pickFields(state, false);
    var own = pickFields(state, true);
    if (JSON.stringify(shared) !== lastShared) {
      var base = read(KEY.state, {});
      Object.keys(shared).forEach(function (field) { base[field] = shared[field]; });
      write(KEY.state, base);
      lastShared = JSON.stringify(shared);
    }
    if (JSON.stringify(own) !== lastOwn) {
      write(inWorld(KEY.state), own);
      lastOwn = JSON.stringify(own);
    }
  }

  // -------------------------------------------------------------------- Theme

  /**
   * Das Theme einstellen. Mit `animate` (beim Klick) wird der Wechsel
   * sichtbar ueberblendet; gemerkt wird sofort, nicht erst am Ende des
   * Uebergangs.
   */
  function setTheme(theme, animate) {
    if (THEMES.indexOf(theme) < 0) return;
    var changed = theme !== document.documentElement.dataset.theme;
    state.theme = theme;
    persistState();
    revealTheme(function () {
      document.documentElement.dataset.theme = theme;
      document.querySelectorAll(".modes button").forEach(function (button) {
        button.setAttribute("aria-pressed", String(button.dataset.mode === theme));
      });
    }, changed && animate);
  }

  /**
   * Den Wechsel als Vorhang zeigen: die neue Seite senkt sich mit weicher
   * Kante von oben ueber die alte. Die View Transitions API fotografiert
   * dafuer die alte Seite, `apply` stellt die neue ein, das Absenken macht
   * CSS (siehe "Themenwechsel" in styles.css). Ohne die API, bei reduzierter
   * Bewegung oder ohne Anlass (`animate` falsch) wird sofort umgeschaltet.
   */
  function revealTheme(apply, animate) {
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!document.startViewTransition || reduce || !animate) {
      apply();
      return;
    }
    document.startViewTransition(apply);
  }

  // ----------------------------------------------------------- Aufbau statisch

  /**
   * Text fuer den Vergleich vereinheitlichen: Kleinschreibung, Umlaute und
   * Akzente weg. So findet "arche" auch "Die Arche" und "futur" nichts,
   * "zukunft" aber alle Bauwerke des Zeitalters.
   */
  function normalise(text) {
    return String(text).toLowerCase()
      .replace(/ä/g, "a").replace(/ö/g, "o").replace(/ü/g, "u").replace(/ß/g, "ss")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  /** Das Auswahlfeld aufbauen. Es enthaelt immer alle Bauwerke. */
  function buildBuildingSelect() {
    var groups = [];
    var byEra = {};
    DATA.buildings.forEach(function (building) {
      if (!byEra[building.era]) { byEra[building.era] = []; groups.push(building.era); }
      byEra[building.era].push(building);
    });
    $("building").innerHTML = groups.map(function (era) {
      var options = byEra[era].map(function (building) {
        return '<option value="' + escapeHtml(building.id) + '">' + escapeHtml(building.name) + "</option>";
      }).join("");
      return '<optgroup label="' + escapeHtml(era) + '">' + options + "</optgroup>";
    }).join("");
  }

  /**
   * Die Suche filtert das Auswahlfeld nicht, sondern zeigt ihre Treffer als
   * eigene Liste darunter.
   *
   * Der erste Entwurf hat das Auswahlfeld eingeschraenkt und das gerade
   * gewaehlte Bauwerk zusaetzlich darin behalten, damit Feld und Plan nicht
   * auseinanderlaufen. Das Ergebnis war irrefuehrend: bei drei Treffern
   * standen vier Eintraege in der Liste, einer davon unter einem Zeitalter,
   * das mit der Suche nichts zu tun hatte.
   *
   * So herum gibt es den Widerspruch nicht. Das Auswahlfeld zeigt immer
   * alle Bauwerke und immer das wirklich gewaehlte, die Trefferzahl stimmt
   * mit dem ueberein, was darunter steht, und nichts wechselt das Bauwerk
   * ohne einen Klick. Auf dem Telefon spart es zusaetzlich den Weg durch
   * die native Liste mit 49 Eintraegen.
   */
  /**
   * Text zeichenweise falten und dabei merken, aus welchem Zeichen des
   * Originals jedes gefaltete Zeichen stammt. Das braucht die Hervorhebung:
   * "ß" wird zu "ss", die Stellen verschieben sich also gegeneinander.
   */
  function foldWithMap(text) {
    var folded = "";
    var origin = [];
    for (var i = 0; i < text.length; i++) {
      var piece = normalise(text.charAt(i));
      for (var j = 0; j < piece.length; j++) origin.push(i);
      folded += piece;
    }
    return { folded: folded, origin: origin };
  }

  /** Den Treffer im Text mit <mark> auszeichnen, alles Uebrige maskieren. */
  function highlight(text, needle) {
    if (!needle) return escapeHtml(text);
    var mapped = foldWithMap(text);
    var at = mapped.folded.indexOf(needle);
    if (at < 0) return escapeHtml(text);

    var from = mapped.origin[at];
    var to = mapped.origin[at + needle.length - 1] + 1;
    return escapeHtml(text.slice(0, from)) +
      "<mark>" + escapeHtml(text.slice(from, to)) + "</mark>" +
      escapeHtml(text.slice(to));
  }

  /**
   * Treffer suchen und nach Fundstelle ordnen.
   *
   * Die Suche greift auch auf das Zeitalter — "titan" soll die drei
   * Saturn-Tore finden. Das erzeugt aber Treffer, denen man nichts ansieht:
   * "ho" findet den Markusdom, obwohl in "Markusdom" kein "ho" steht, weil
   * er im Hochmittelalter liegt.
   *
   * Zwei Dinge machen das lesbar. Erstens stehen Namenstreffer vor
   * Zeitalter-Treffern, sonst landet der eigentlich gemeinte Fund ganz
   * unten. Zweitens wird in der Liste genau die Stelle hervorgehoben, die
   * getroffen hat — man sieht also, ob der Name oder das Zeitalter gemeint
   * war.
   */
  function matchesFor(query) {
    var needle = normalise(query).trim();
    if (!needle) return [];

    var byName = [];
    var byEra = [];
    DATA.buildings.forEach(function (building) {
      if (normalise(building.name).indexOf(needle) >= 0) {
        byName.push({ building: building, where: "name" });
      } else if (normalise(shortName(building)).indexOf(needle) >= 0) {
        // Ein selbst vergebenes Kuerzel muss nicht im Namen stecken: "AO"
        // kommt in "Arktische Orangerie" nirgends vor. Der Treffer bleibt bei
        // den Namenstreffern, bekommt aber eine eigene Kennung, damit die Liste
        // ihn erklaeren kann.
        byName.push({ building: building, where: "short", alias: shortName(building) });
      } else if (abbrOf(building) && normalise(abbrOf(building)).indexOf(needle) >= 0) {
        // Das Kuerzel aus abbr.js findet sein Bauwerk auch bei
        // ausgeschaltetem Schalter: wer "TA" tippt, meint die Armee.
        byName.push({ building: building, where: "short", alias: abbrOf(building) });
      } else if (normalise(building.era).indexOf(needle) >= 0) {
        byEra.push({ building: building, where: "era" });
      }
    });
    return byName.concat(byEra);
  }

  function currentMatches() { return matchesFor($("buildingFilter").value); }

  function renderFilter() {
    var query = $("buildingFilter").value;
    var matches = currentMatches();

    $("filterClear").hidden = !query;
    $("filterCount").textContent = countText(query, matches);

    var needle = normalise(query).trim();
    $("filterResults").innerHTML = matches.map(function (match) {
      var building = match.building;
      return '<li><button type="button" class="filter-hit" data-pick="' + escapeHtml(building.id) + '"' +
        (building.id === state.building ? ' aria-current="true"' : "") + ">" +
        "<b>" + (match.where === "name" ? highlight(building.name, needle) : escapeHtml(building.name)) + "</b>" +
        "<span>" + (match.where === "era" ? highlight(building.era, needle) : escapeHtml(building.era)) +
          // Getroffen hat das Kuerzel, im Namen steht es nicht — dann nennt
          // die Zeile es, sonst stuende der Treffer ohne Begruendung da.
          (match.where === "short" ? " · " + highlight(match.alias, needle) : "") +
        "</span>" +
      "</button></li>";
    }).join("");
  }

  function countText(query, matches) {
    return !query.trim()
      ? ""
      : matches.length === 0
        ? searchEgg(query) || "Kein Bauwerk gefunden."
        : matches.length === 1
          ? "1 Bauwerk gefunden."
          : matches.length + " Bauwerke gefunden.";
  }

  /** Ein Bauwerk uebernehmen, egal von wo aus es gewaehlt wurde. */
  function chooseBuilding(id) {
    if (!byId[id]) return;
    state.building = id;
    adoptFavoriteLevel();
    render();
  }

  /** Ein Bauwerk aus der Trefferliste uebernehmen und die Suche schliessen. */
  function pickBuilding(id) {
    if (!byId[id]) return;
    clearBuildingFilter({ keepFocus: false });
    chooseBuilding(id);
  }

  function clearBuildingFilter(options) {
    $("buildingFilter").value = "";
    renderFilter();
    if (!options || options.keepFocus !== false) $("buildingFilter").focus();
  }

  // ------------------------------------------------------- Bauwerksauswahl

  /*
   * Die eigene Auswahlliste statt der nativen des Browsers.
   *
   * Die native Liste war auf dem Telefon bei 49 Bauwerken der muehsamste
   * Weg: Android zeigt ein langes Blatt ohne Suche, das iPhone ein Drehrad,
   * auf dem man wenig auf einmal sieht. Hier kommt ein Blatt von unten mit
   * Suchfeld oben, Zeitaltern als mitlaufenden Ueberschriften und dem
   * gewaehlten Bauwerk in der Mitte.
   *
   * Was der Browser bei einem <select> umsonst mitbringt, muss eine eigene
   * Liste selbst leisten. Das meiste davon kommt vom <dialog> mit
   * showModal(): Fokusfang, stillgelegter Hintergrund, Esc, Top-Layer. Der
   * Rest steht hier:
   *   - Zurueck-Geste: ein eigener Verlaufseintrag, damit "zurueck" das Blatt
   *     schliesst und nicht die Seite verlaesst
   *   - Tastatur: Pfeile, Bild auf/ab, Pos1/Ende, Enter, Leertaste, Esc und
   *     Lostippen (Muster "Combobox mit Listbox", aria-activedescendant)
   *   - Bildschirmtastatur: das Blatt rueckt ueber sie, statt verdeckt zu
   *     werden (visualViewport)
   *   - Wischen nach unten am Kopf schliesst, Tippen daneben auch
   *   - Hintergrund scrollt nicht mit
   *   - der Fokus kehrt auf den Knopf zurueck
   */
  var SHEET_QUERY = "(max-width: 640px)";

  /** DOM-id je Bauwerk. Die Bauwerk-ids enthalten Punkte und Apostrophe. */
  var PICK_DOM_ID = {};
  DATA.buildings.forEach(function (building, index) { PICK_DOM_ID[building.id] = "pk-" + index; });

  var picker = {
    ids: [],               // Bauwerke in der Reihenfolge, in der sie dastehen
    active: -1,            // Index in ids, auf dem die Tastatur steht
    historyPushed: false,  // liegt unser Verlaufseintrag noch obenauf?
    closing: false,
    closeTimer: null,
    openedByTouch: false
  };

  function pickerOption(building, needle, match) {
    picker.ids.push(building.id);
    var name = match && match.where === "name" ? highlight(building.name, needle) : escapeHtml(building.name);
    var aside;
    if (match) {
      // Suchtreffer stehen ohne Gruppen da, darum nennt jeder sein Zeitalter
      // — wie in der Trefferliste unter dem Suchfeld der Seite.
      aside = (match.where === "era" ? highlight(building.era, needle) : escapeHtml(building.era)) +
        (match.where === "short" ? " · " + highlight(match.alias, needle) : "");
    } else {
      // In der vollen Liste steht das Zeitalter schon darueber. Rechts steht
      // dann das Kuerzel, unter dem das Bauwerk im Chat erscheint.
      var short = shortName(building);
      aside = short !== building.name ? escapeHtml(short) : "";
    }
    return '<li role="option" class="picker-opt" id="' + PICK_DOM_ID[building.id] + '"' +
      ' data-pick="' + escapeHtml(building.id) + '"' +
      ' aria-selected="' + (building.id === state.building) + '">' +
      "<b>" + name + "</b>" + (aside ? "<span>" + aside + "</span>" : "") +
    "</li>";
  }

  function renderPicker() {
    var query = $("pickerFilter").value;
    var needle = normalise(query).trim();
    var matches = matchesFor(query);
    picker.ids = [];

    $("pickerFilterClear").hidden = !query;
    $("pickerCount").textContent = countText(query, matches);

    if (needle) {
      $("pickerList").innerHTML = matches.map(function (match) {
        return pickerOption(match.building, needle, match);
      }).join("");
      return;
    }

    var groups = [];
    var byEra = {};
    DATA.buildings.forEach(function (building) {
      if (!byEra[building.era]) { byEra[building.era] = []; groups.push(building.era); }
      byEra[building.era].push(building);
    });
    // Aufbau nach dem Muster "gruppierte Listbox" der ARIA-Praxis: die
    // Ueberschrift benennt die Gruppe, ist selbst aber keine Option.
    $("pickerList").innerHTML = groups.map(function (era, index) {
      return '<li role="presentation"><ul class="picker-group" role="group" aria-labelledby="pkg-' + index + '">' +
        '<li role="presentation" class="picker-era" id="pkg-' + index + '">' + escapeHtml(era) + "</li>" +
        byEra[era].map(function (building) { return pickerOption(building, "", null); }).join("") +
      "</ul></li>";
    }).join("");
  }

  /** Die Tastatur auf eine Option setzen; -1 heisst: auf keine. */
  function setPickerActive(index, reveal) {
    var list = $("pickerList");
    var previous = list.querySelector(".picker-opt.active");
    if (previous) previous.classList.remove("active");

    picker.active = picker.ids.length ? Math.max(-1, Math.min(index, picker.ids.length - 1)) : -1;
    var domId = picker.active >= 0 ? PICK_DOM_ID[picker.ids[picker.active]] : "";
    [$("pickerFilter"), list].forEach(function (element) {
      if (domId) element.setAttribute("aria-activedescendant", domId);
      else element.removeAttribute("aria-activedescendant");
    });
    if (!domId) return;
    var option = $(domId);
    option.classList.add("active");
    if (reveal) option.scrollIntoView({ block: "nearest" });
  }

  /** Das gewaehlte Bauwerk in die Mitte der Liste holen. */
  function centerPickerSelection() {
    var list = $("pickerList");
    var option = $(PICK_DOM_ID[state.building]);
    if (!option) { list.scrollTop = 0; return; }
    var listBox = list.getBoundingClientRect();
    var optionBox = option.getBoundingClientRect();
    list.scrollTop += optionBox.top - listBox.top - (listBox.height - optionBox.height) / 2;
  }

  /**
   * Das Blatt ueber die Bildschirmtastatur ruecken. Chrome auf Android und
   * Safari verkleinern beim Einblenden der Tastatur nur den sichtbaren
   * Ausschnitt, nicht das Fenster — ein unten verankertes Blatt laege sonst
   * zur Haelfte hinter ihr.
   */
  /** Das Blatt, das gerade ueber der Tastatur gehalten wird. */
  var viewportSheet = null;

  function syncPickerViewport() {
    var viewport = window.visualViewport;
    if (!viewport || !viewportSheet) return;
    var dialog = viewportSheet;
    var below = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
    dialog.style.setProperty("--kb", Math.round(below) + "px");
    dialog.style.setProperty("--vvh", Math.round(viewport.height) + "px");
  }

  /**
   * Gilt fuer jedes Blatt mit Eingabefeld: die Bauwerksauswahl und das Menue,
   * in dem der Name getippt wird. Ohne `dialog` ist die Bauwerksauswahl gemeint.
   */
  function watchPickerViewport(on, dialog) {
    viewportSheet = on ? (dialog || $("picker")) : null;
    var viewport = window.visualViewport;
    if (!viewport) return;
    var method = on ? "addEventListener" : "removeEventListener";
    viewport[method]("resize", syncPickerViewport);
    viewport[method]("scroll", syncPickerViewport);
    if (on) syncPickerViewport();
  }

  function openPicker() {
    var dialog = $("picker");
    if (dialog.open) return;
    window.clearTimeout(picker.closeTimer);
    picker.closing = false;
    dialog.classList.remove("closing");
    $("pickerSheet").style.transform = "";

    $("pickerFilter").value = "";
    renderPicker();

    document.documentElement.classList.add("picker-open");
    watchPickerViewport(true);
    dialog.showModal();
    $("buildingPick").setAttribute("aria-expanded", "true");

    // Ein eigener Verlaufseintrag: die Zurueck-Geste schliesst das Blatt,
    // statt die Seite zu verlassen. Ohne Zugriff auf den Verlauf (etwa in
    // einem gesperrten Rahmen) bleibt es bei Esc, Kreuz und Tippen daneben.
    try {
      window.history.pushState({ cipherPicker: true }, "");
      picker.historyPushed = true;
    } catch (e) { picker.historyPushed = false; }

    centerPickerSelection();
    setPickerActive(picker.ids.indexOf(state.building), false);

    // Mit dem Finger geoeffnet: die Liste bekommt den Fokus, nicht das
    // Suchfeld. Sonst schiebt sich sofort die Tastatur ueber die halbe
    // Liste, obwohl die meisten nur tippen und nicht suchen wollen. Mit
    // Maus oder Tastatur geht es direkt ins Suchfeld.
    (picker.openedByTouch ? $("pickerList") : $("pickerFilter")).focus({ preventScroll: true });
  }

  /** Schliessen, auf Wunsch mit kurzer Blende nach unten. */
  function closePicker() {
    var dialog = $("picker");
    if (!dialog.open || picker.closing) return;
    if (prefersReducedMotion) { dialog.close(); return; }
    picker.closing = true;
    dialog.classList.add("closing");
    picker.closeTimer = window.setTimeout(function () { dialog.close(); }, 180);
  }

  /** Aufraeumen — gleich, ob per Auswahl, Esc, Zurueck oder Tippen daneben. */
  function onPickerClosed() {
    var dialog = $("picker");
    window.clearTimeout(picker.closeTimer);
    picker.closing = false;
    dialog.classList.remove("closing");
    $("pickerSheet").style.transform = "";
    document.documentElement.classList.remove("picker-open");
    watchPickerViewport(false);
    $("buildingPick").setAttribute("aria-expanded", "false");
    $("buildingPick").focus({ preventScroll: true });

    // Nicht per Zurueck geschlossen: den eigenen Eintrag wieder abraeumen,
    // sonst braeuchte das naechste "zurueck" zwei Anlaeufe.
    if (picker.historyPushed) {
      picker.historyPushed = false;
      window.history.back();
    }
  }

  function choosePicked(id) {
    chooseBuilding(id);
    closePicker();
  }

  function onPickerKey(event) {
    var input = $("pickerFilter");
    var list = $("pickerList");
    var inInput = event.target === input;
    var inList = event.target === list;
    if (!inInput && !inList) return;
    if (event.altKey || event.ctrlKey || event.metaKey) return;

    var last = picker.ids.length - 1;
    switch (event.key) {
      case "ArrowDown": setPickerActive(picker.active < 0 ? 0 : picker.active + 1, true); break;
      case "ArrowUp": setPickerActive(picker.active < 0 ? last : Math.max(0, picker.active - 1), true); break;
      case "PageDown": setPickerActive(Math.min(last, picker.active + 8), true); break;
      case "PageUp": setPickerActive(Math.max(0, picker.active - 8), true); break;
      case "Home":
      case "End":
        // Im Suchfeld gehoeren Pos1 und Ende dem Cursor.
        if (inInput) return;
        setPickerActive(event.key === "Home" ? 0 : last, true);
        break;
      case "Enter":
        if (picker.active < 0) return;
        choosePicked(picker.ids[picker.active]);
        break;
      case " ":
        if (!inList || picker.active < 0) return;
        choosePicked(picker.ids[picker.active]);
        break;
      case "Escape":
        // Erst die Suche leeren, dann schliessen — wie im Suchfeld der Seite.
        if (input.value) {
          input.value = "";
          onPickerInput();
        } else {
          closePicker();
        }
        break;
      default:
        // Lostippen, waehrend die Liste den Fokus hat, sucht.
        if (!inList || event.key.length !== 1) return;
        input.value += event.key;
        input.focus();
        onPickerInput();
    }
    event.preventDefault();
  }

  function onPickerInput() {
    var query = $("pickerFilter").value;
    renderPicker();
    if (normalise(query).trim()) {
      $("pickerList").scrollTop = 0;
      setPickerActive(0, false);
    } else {
      centerPickerSelection();
      setPickerActive(picker.ids.indexOf(state.building), false);
    }
  }

  /** Am Kopf des Blatts nach unten ziehen schliesst es. */
  function bindPickerSwipe() {
    var head = $("pickerHead");
    var sheet = $("pickerSheet");
    var drag = null;

    head.addEventListener("pointerdown", function (event) {
      if (event.pointerType === "mouse" || event.target.closest("button")) return;
      if (!window.matchMedia(SHEET_QUERY).matches || picker.closing) return;
      drag = { id: event.pointerId, y: event.clientY, t: event.timeStamp, dy: 0 };
      head.setPointerCapture(event.pointerId);
      sheet.classList.add("dragging");
    });
    head.addEventListener("pointermove", function (event) {
      if (!drag || event.pointerId !== drag.id) return;
      drag.dy = Math.max(0, event.clientY - drag.y);
      sheet.style.transform = drag.dy ? "translateY(" + drag.dy + "px)" : "";
    });
    function release(event, cancelled) {
      if (!drag || event.pointerId !== drag.id) return;
      var speed = drag.dy / Math.max(1, event.timeStamp - drag.t);
      var dismiss = !cancelled && (drag.dy > 96 || (drag.dy > 32 && speed > .5));
      drag = null;
      sheet.classList.remove("dragging");
      if (dismiss) closePicker();
      else sheet.style.transform = "";
    }
    head.addEventListener("pointerup", function (event) { release(event, false); });
    head.addEventListener("pointercancel", function (event) { release(event, true); });
  }

  function bindPicker() {
    var dialog = $("picker");
    var trigger = $("buildingPick");

    trigger.addEventListener("pointerdown", function (event) {
      picker.openedByTouch = event.pointerType === "touch" || event.pointerType === "pen";
    });
    trigger.addEventListener("click", openPicker);

    // Wie beim <select>: Pfeil hoch/runter auf dem geschlossenen Feld
    // oeffnet die Liste.
    trigger.addEventListener("keydown", function (event) {
      picker.openedByTouch = false;
      if ((event.key === "ArrowDown" || event.key === "ArrowUp") && !event.altKey) {
        event.preventDefault();
        openPicker();
      }
    });

    dialog.addEventListener("keydown", onPickerKey);
    dialog.addEventListener("close", onPickerClosed);
    // Esc ausserhalb von Suchfeld und Liste, und bei Chrome auf Android die
    // Zurueck-Geste: mit derselben Blende schliessen wie sonst auch. Laesst
    // der Browser das Abfangen nicht zu, schliesst er selbst, und das
    // close-Ereignis raeumt auf.
    dialog.addEventListener("cancel", function (event) {
      event.preventDefault();
      closePicker();
    });

    // Tippen daneben. Ein Klick auf den Hintergrund trifft das <dialog>
    // selbst; das Blatt fuellt es sonst ganz aus. Der Druck muss dort auch
    // begonnen haben — wer im Suchfeld Text markiert und die Maus daneben
    // loslaesst, will nicht schliessen.
    var downOnBackdrop = false;
    dialog.addEventListener("pointerdown", function (event) { downOnBackdrop = event.target === dialog; });
    dialog.addEventListener("click", function (event) {
      if (event.target === dialog && downOnBackdrop) closePicker();
      downOnBackdrop = false;
    });

    $("pickerClose").addEventListener("click", closePicker);
    $("pickerFilter").addEventListener("input", onPickerInput);
    $("pickerFilterClear").addEventListener("click", function () {
      $("pickerFilter").value = "";
      onPickerInput();
      $("pickerFilter").focus();
    });

    $("pickerList").addEventListener("click", function (event) {
      var option = event.target.closest("[data-pick]");
      if (option) choosePicked(option.dataset.pick);
    });

    window.addEventListener("popstate", function () {
      if (!picker.historyPushed) return;
      // Der Eintrag ist schon weg — onPickerClosed darf ihn nicht noch
      // einmal zuruecknehmen.
      picker.historyPushed = false;
      closePicker();
    });

    bindPickerSwipe();
  }

  /**
   * Die fuenf Faktorzeilen einmalig aufbauen.
   *
   * Einmalig, nicht bei jedem Zeichnen: in den Zeilen stehen Textfelder,
   * und ein neu geschriebenes innerHTML wuerde bei jedem Tastendruck den
   * Cursor verlieren. Gezeichnet werden spaeter nur noch die Werte.
   */
  function buildSlotRows() {
    var rows = [];
    for (var index = 0; index < Calc.SLOTS; index++) {
      var slot = index + 1;
      rows.push(
        '<li data-slot="' + index + '">' +
          '<div class="slot-row">' +
          '<span class="tag slot-' + slot + '">P' + slot + "</span>" +
          '<div class="step mini">' +
            '<button type="button" data-slot="' + index + '" data-slot-step="-1"' +
              ' aria-label="Faktor für P' + slot + ' verringern">−</button>' +
            '<input type="text" inputmode="decimal" autocomplete="off"' +
              ' data-slot="' + index + '" aria-label="Faktor für P' + slot + '">' +
            '<button type="button" data-slot="' + index + '" data-slot-step="1"' +
              ' aria-label="Faktor für P' + slot + ' erhöhen">+</button>' +
          "</div>" +
          '<span class="slot-state"></span>' +
          '<button type="button" class="slot-reset" data-slot-reset="' + index + '" hidden' +
            ' aria-label="P' + slot + ' wieder dem Wert oben folgen lassen">×</button>' +
          "</div>" +
          // Die jeweils andere Einheit, leise darunter — dieselbe Idee wie
          // bei der Stufe, wo unter "80" steht, dass 81 gefoerdert wird.
          //
          // Ausserhalb der Flex-Zeile, nicht als umbrechendes Glied darin:
          // ein Umbruch greift vor dem Schrumpfen, und dann faellt bei 320
          // Pixeln das Kreuz auf eine eigene Zeile.
          '<span class="slot-hint"></span>' +
        "</li>"
      );
    }
    $("slotList").innerHTML = rows.join("");
  }

  /**
   * Die Platzzeilen auf den Stand bringen.
   *
   * Ein Platz folgt dem Wert oben, bis jemand ihn hier anfasst — danach ist
   * er eigen, traegt das Kreuz zum Zuruecknehmen und bleibt stehen, wenn
   * der obere Wert sich bewegt. Der obere Wert zeigt damit immer etwas
   * Wahres und muss nie ausgegraut werden.
   *
   * Angefasst wird in einer von zwei Einheiten: als Arche-Faktor oder als
   * Betrag in FP. Das ist dieselbe Zahl — die Einzahlung dieses Platzes —
   * und darum ein Feld, kein zweites daneben. Der Umschalter im Block
   * waehlt, was eine folgende Zeile zeigt und was beim Tippen gemeint ist.
   */
  function renderSlots(plan) {
    var values = effectiveFactors();
    var own = 0;
    var anyPay = false;

    $("slotList").querySelectorAll("li").forEach(function (item) {
      var index = Number(item.dataset.slot);
      var pinned = slotIsOwn(index);
      var unit = slotUnitFor(index);
      var input = item.querySelector("input");
      var row = plan ? plan.rows[index] : null;
      if (pinned) own++;
      if (state.slotPays[index] != null) anyPay = true;

      // Waehrend des Tippens nicht dazwischenfunken.
      if (document.activeElement !== input) input.value = slotFieldValue(index, plan);
      input.setAttribute("inputmode", unit === "fp" ? "numeric" : "decimal");
      input.setAttribute("aria-label",
        (unit === "fp" ? "Einzahlung für P" : "Faktor für P") + (index + 1));

      item.classList.toggle("own", pinned);
      // Der Stepper gehoert zum Faktor: einen abgelesenen Betrag um eine
      // Stufe zu schieben ergibt keinen Sinn, also faellt er dort weg.
      item.classList.toggle("fp", unit === "fp");
      item.querySelector(".slot-reset").hidden = !pinned;
      // Der Zustand steht als Wort da, nicht nur als Farbe: im Kontrastmodus
      // ist Gold schwarz, dort traegt die Faerbung nichts.
      item.querySelector(".slot-state").textContent = pinned ? "angepasst" : "folgt";
      item.querySelector(".slot-hint").textContent = slotHint(index, unit, row);
      item.querySelector('[data-slot-step="-1"]').disabled = values[index] <= FACTOR_MIN;
      item.querySelector('[data-slot-step="1"]').disabled = values[index] >= FACTOR_MAX;
    });

    document.querySelectorAll("#slotUnit button").forEach(function (button) {
      button.setAttribute("aria-pressed", String(button.dataset.slotUnit === state.slotUnit));
    });

    renderSlotsBadge(own, anyPay, values);
    $("slotsReset").hidden = own === 0;
  }

  /**
   * Was im Feld eines Platzes steht — in der Einheit dieser Zeile.
   *
   * Ohne Plan (fuer die Stufe fehlen Gesamtkosten oder P1) gibt es keinen
   * Betrag zu zeigen. Ein getippter steht trotzdem da, er haengt an nichts;
   * ein gerechneter bleibt leer, denn eine erfundene Zahl waere schlimmer
   * als ein leeres Feld.
   */
  function slotFieldValue(index, plan) {
    if (slotUnitFor(index) !== "fp") return formatFactor(effectiveFactors()[index]);
    if (state.slotPays[index] != null) return formatNumber(state.slotPays[index]);
    return plan ? formatNumber(plan.rows[index].contribution) : "";
  }

  /**
   * Dieselbe Zahl in der anderen Einheit, als leiser Nachsatz.
   *
   * Steht im Feld eine andere Einheit als im Umschalter, nennt der Nachsatz
   * auch die des Feldes: "10.000 FP ≙ Faktor 3,13". Getippt wird naemlich in
   * der Einheit, die man gerade sieht — sonst zerschiesst ein Klick in ein
   * Feld mit 10.000 diesen Betrag, weil er als Faktor gelesen und auf 2,00
   * gestutzt wird. Sichtbar muss der Unterschied dafuer sein, und hier ist
   * die Zeile breit genug; neben dem Feld waere sie es bei 320 Pixeln nicht.
   */
  /** Der Faktor, den eine Einzahlung auf diese Belohnung bedeutet. */
  function impliedFactor(row) {
    return Math.round(row.contribution / row.reward * 100);
  }

  function slotHint(index, unit, row) {
    if (!row) return "";
    // Ohne getippten Betrag ist der eingestellte Faktor die Wahrheit; aus
    // der abgerundeten Einzahlung zurueckgerechnet koennte er um 0,01
    // daneben liegen.
    var andere = unit === "fp"
      ? (state.slotPays[index] == null ? "Faktor " + formatFactor(effectiveFactors()[index])
        : row.reward > 0 ? "Faktor " + formatFactor(impliedFactor(row)) : "")
      : formatNumber(row.contribution) + " FP";
    if (!andere) return "";
    if (unit === state.slotUnit) return "≙ " + andere;
    var eigene = unit === "fp"
      ? formatNumber(state.slotPays[index]) + " FP"
      : "Faktor " + formatFactor(effectiveFactors()[index]);
    return eigene + " ≙ " + andere;
  }

  /**
   * Das Abzeichen am zugeklappten Block.
   *
   * Sind alle eigenen Werte Faktoren, nennt es die Spanne — die ist
   * aussagekraeftig, weil alle fuenf dieselbe Groesse messen. Betraege
   * lassen sich so nicht zusammenfassen: 50 bis 10.000 waere die Spanne
   * zwischen P5 und P1 und damit voellig normal. Dann steht dort, wie viele
   * Plaetze eigene Werte tragen.
   */
  function renderSlotsBadge(own, anyPay, values) {
    $("slotsBadge").hidden = own === 0;
    if (own === 0) return;
    if (anyPay) {
      $("slotsBadge").textContent = own + " angepasst";
      return;
    }
    var low = Math.min.apply(null, values);
    var high = Math.max.apply(null, values);
    $("slotsBadge").textContent = low === high
      ? formatFactor(low)
      : formatFactor(low) + "–" + formatFactor(high);
  }

  function buildFactorChips() {
    $("factorChips").innerHTML = FACTOR_PRESETS.map(function (factor) {
      return '<button type="button" data-factor="' + factor + '">' + formatFactor(factor) + "</button>";
    }).join("");
  }

  // ---------------------------------------------------------------- Animation

  /**
   * Eine Zahl weich auf ihren neuen Wert zaehlen lassen.
   * Der Zielwert steht in data-value, damit ein zweiter Aufruf den
   * laufenden Durchlauf sauber abbricht.
   */
  function countTo(element, target) {
    var from = Number(element.dataset.value);
    element.dataset.value = String(target);

    if (prefersReducedMotion || isNaN(from) || from === target) {
      element.textContent = formatNumber(target);
      return;
    }

    var start = performance.now();
    function frame(now) {
      var progress = Math.min(1, (now - start) / 380);
      var eased = 1 - Math.pow(1 - progress, 3);
      element.textContent = formatNumber(Math.round(from + (target - from) * eased));
      if (progress < 1 && Number(element.dataset.value) === target) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  // ----------------------------------------------------------------- Rendern

  /**
   * Stufenfeld, seine Beschriftung und der Umschalter darueber.
   *
   * Dieselbe Zahl heisst fuer die einen "das Bauwerk steht auf 80", fuer die
   * anderen "es wird gerade auf 81 gezogen". Beides ist verbreitet, und wer
   * die falsche Lesart annimmt, rechnet eine Stufe daneben. Der Umschalter
   * stellt die Lesart ein, die Zeile unter dem Feld nennt jeweils die andere
   * Zahl — damit steht die Antwort da, egal wie herum jemand denkt.
   */
  function renderLevelField() {
    var offset = levelOffset();

    $("level").value = String(state.level - offset);
    $("level").min = String(1 - offset);
    $("level").max = String(LEVEL_MAX - offset);
    $("levelDown").disabled = state.level <= 1;
    $("levelUp").disabled = state.level >= LEVEL_MAX;

    $("levelLabel").textContent = offset ? "Aktuelle Stufe" : "Nächste Stufe";
    $("levelHint").textContent = offset
      ? "Gefördert wird Stufe " + state.level + "."
      : state.level <= 1
        ? "Noch nicht gebaut."
        : "Steht aktuell auf Stufe " + (state.level - 1) + ".";

    document.querySelectorAll("#levelMode button").forEach(function (button) {
      button.setAttribute("aria-pressed", String(button.dataset.levelMode === state.levelMode));
    });
  }

  /** Welches Bauwerk gerade im Kuerzelfeld steht. */
  var shortFieldFor = null;

  /**
   * Das Kuerzelfeld auf das gewaehlte Bauwerk stellen.
   *
   * Im Feld steht nur ein eigenes Kuerzel; der Platzhalter traegt den Namen
   * aus dem Datensatz. Leer heisst damit nicht "kein Name", sondern "der aus
   * dem Datensatz" — und das steht als Wort da, nicht als Regel, die man
   * kennen muss.
   */
  function renderShortField(building) {
    var input = $("buildingShort");
    input.placeholder = defaultShort(building);

    // Waehrend des Tippens nicht dazwischenfunken — aber ein Wechsel des
    // Bauwerks ist kein Tippen. Stuende die Regel nur auf dem Fokus, bliebe
    // nach einem Wechsel das Kuerzel des vorigen Bauwerks im Feld stehen,
    // waehrend der Platzhalter daneben schon das neue nennt.
    if (document.activeElement !== input || shortFieldFor !== building.id) {
      input.value = ownShorts[building.id] || "";
    }
    shortFieldFor = building.id;
  }

  var previousContributions = [];

  /**
   * Der zuletzt gerechnete Plan, oder null, wenn der Stufe Zahlen fehlen.
   * Gebraucht beim Verlassen eines Platzfelds: dort ist der Wert wieder
   * sauber hinzuschreiben, und in FP-Einheit steht er nur im Plan.
   */
  var lastPlan = null;

  function render() {
    var building = byId[state.building];
    state.level = Math.min(Math.max(1, Math.floor(state.level) || 1), LEVEL_MAX);

    $("building").value = building.id;
    $("buildingPickName").textContent = building.name;
    $("buildingPickEra").textContent = building.era;
    renderLevelField();
    // Waehrend des Tippens nicht dazwischenfunken.
    if (document.activeElement !== $("factor")) $("factor").value = formatFactor(state.factor);
    $("factorGauge").style.width =
      ((state.factor - FACTOR_MIN) / (FACTOR_MAX - FACTOR_MIN) * 100) + "%";
    // aria-disabled statt disabled: ein abgeschalteter Knopf nimmt keinen
    // Tipp mehr an, und wer am Anschlag weiterdrueckt, soll eine Antwort
    // bekommen (Egg 4).
    $("factorDown").setAttribute("aria-disabled", String(state.factor <= FACTOR_MIN));
    $("factorUp").setAttribute("aria-disabled", String(state.factor >= FACTOR_MAX));
    document.querySelectorAll("#factorChips button").forEach(function (chip) {
      chip.classList.toggle("on", Number(chip.dataset.factor) === state.factor);
    });
    if (document.activeElement !== $("playerName")) $("playerName").value = state.name;
    $("nameNeedTop").hidden = Boolean(state.name.trim());
    renderShortField(building);
    $("useAbbr").checked = state.useAbbr;
    $("useAbbrChat").checked = state.useAbbr;
    if (relabelCollection()) renderCollection();

    syncFavoriteLevel();
    renderFavorites();

    var total = Calc.totalCost(building, state.level, ownTotals);
    var p1 = Calc.p1Reward(building, state.level, DATA.curves, ownP1);
    renderNote(building, total, p1);

    // Die Haekchen gelten wie der Stand nur fuer eine Stufe: wer das Bauwerk
    // oder die Stufe wechselt, faengt wieder mit allen Plaetzen angeboten an.
    if (state.slotsFor != null && state.slotsFor !== ownPaidKey()) {
      state.enabled = normaliseEnabled(null);
      state.taken = normaliseTaken(null);
      state.slotsFor = null;
    }

    // Ein eingetragener Stand gehoert zu genau einer Stufe.
    if (state.ownPaidFor !== ownPaidKey()) {
      state.ownPaid = null;
      state.foreign = [];
    }

    if (total.value == null || p1.value == null) {
      lastPlan = null;
      renderEmpty();
      renderSlots(null);
      renderStand(null);
      persistState();
      return;
    }

    var plan = Calc.buildPlan({
      total: total.value,
      p1: p1.value,
      p1Secure: UNSURE_P1_SOURCES[p1.source]
        ? p1.value - Calc.p1Slack(DATA.curves[building.curve], state.level)
        : null,
      factor: state.factor,
      factors: state.slotFactors,
      payments: state.slotPays,
      enabled: state.enabled,
      taken: state.taken,
      ownPaid: state.ownPaid,
      foreign: foreignAmounts()
    });

    lastPlan = plan;
    renderStand(plan);
    renderSlots(plan);
    renderRows(plan);
    renderBar(plan);
    renderUpfront(plan);
    renderTotals(plan);
    renderChat(plan, building);

    // Die zweite Warnung kann nur aus getippten Betraegen entstehen: im
    // Faktorbereich 1,80-2,00 ueberholt kein Platz den ueber sich, das haelt
    // ein Einheitentest ueber den ganzen Datensatz fest.
    var warnings = [];
    if (plan.anyTooTight) {
      warnings.push("Auf dieser Stufe reichen die Gesamtkosten nicht für alle Plätze. Nicht passende Plätze sind ausgegraut.");
    }
    if (plan.anyOutOfOrder) {
      var foreignAbove = plan.rows.some(function (row) { return row.foreign && row.outOfOrder; });
      warnings.push(foreignAbove
        ? "Eine Fremdeinzahlung ist höher als ein vergebener Platz über ihr — im Spiel steht sie davor. Prüf, welche Plätze wirklich vergeben sind."
        : "Ein Platz kostet mehr als ein besser bezahlter über ihm. Prüf die eingetragenen Beträge — so vergibt das Spiel die Plätze nicht.");
    }
    if (alreadyInside(plan) > plan.total) {
      warnings.push("Im Bauwerk steht mehr, als die Stufe kostet. Prüf die Beträge unter „Schon im Bauwerk“.");
    }
    var skipped = skippedAbove(plan);
    if (skipped.length) {
      warnings.push(joinSlots(skipped) + " zahlst du so selbst, obwohl darunter noch Plätze angeboten werden. Schon belegt? Dann aufs Häkchen tippen, bis ein Strich erscheint — „vergeben“.");
    }
    $("warn").innerHTML = warnings.map(function (text) {
      return '<div class="warnline">' + escapeHtml(text) + "</div>";
    }).join("");

    maybeStamp(plan);
    persistState();
  }

  /** Zu welchem Bauwerk und welcher Stufe ein eingetragener Stand gehoert. */
  function ownPaidKey() {
    return state.building + ":" + state.level;
  }

  /**
   * Was laut Eintrag jetzt schon im Bauwerk liegt: deine FP, die vergebenen
   * Plaetze und alle Fremdeinzahlungen. Ohne eigenen Stand weiss cipher das
   * nicht und nimmt null an — dann gibt es auch nichts zu pruefen.
   */
  function alreadyInside(plan) {
    if (state.ownPaid == null && !foreignAmounts().length) return 0;
    var inside = plan.ownPaid;
    plan.rows.forEach(function (row) {
      if (row.taken || row.foreign) inside += row.contribution;
    });
    return inside + plan.foreignLoose;
  }

  /**
   * Der Block "Schon im Bauwerk": deine FP und die Einzahlungen anderer.
   *
   * Leer rechnet cipher wie immer: vor jedem vergebenen Platz der Reihe
   * nach abgesichert. Sobald ein Stand eingetragen ist, rechnet es vom
   * Bauwerk aus, wie es jetzt ist. Fremdeinzahlungen sind immer so ein
   * Stand — mit ihnen heisst ein leeres Feld fuer deine FP darum 0.
   */
  function renderStand(plan) {
    var amounts = foreignAmounts();
    if (document.activeElement !== $("ownPaid")) {
      $("ownPaid").value = state.ownPaid == null ? "" : formatNumber(state.ownPaid);
    }
    $("ownPaid").placeholder = amounts.length ? "0" : "leer = der Reihe nach gesichert";
    $("ownPaidHint").textContent = amounts.length
      ? "Mit FP von anderen rechnet cipher vom jetzigen Stand aus. Trag ein, was du selbst schon drin hast — leer heißt 0."
      : "Haben die vergebenen Plätze eingezahlt, bevor du gesichert hast? Trag ein, was du selbst schon drin hast (auch 0) — dann rechnet cipher vom jetzigen Stand aus.";
    renderForeign(plan);

    var parts = [];
    if (state.ownPaid != null) parts.push(formatNumber(state.ownPaid) + " eigen");
    if (amounts.length) parts.push(amounts.length + " fremd");
    $("standBadge").hidden = parts.length === 0;
    $("standBadge").textContent = parts.join(" · ");
  }

  /**
   * Die Felder fuer Fremdeinzahlungen: eins je Betrag und immer ein leeres
   * am Ende, in das der naechste kommt. Gebaut wird nur, wenn die Zahl der
   * Felder nicht mehr stimmt, und nur am Ende der Liste — ein neu
   * geschriebenes Feld verloere sonst mitten im Tippen den Cursor.
   */
  function renderForeign(plan) {
    var list = $("foreignList");
    var wanted = state.foreign.length + 1;
    while (list.children.length > wanted) list.removeChild(list.lastElementChild);
    while (list.children.length < wanted) list.appendChild(foreignRow(list.children.length));

    // Welcher Platz zu welchem Feld gehoert: der Plan kennt nur die Betraege
    // ohne leere Felder, in derselben Reihenfolge. Ohne Plan (es fehlen
    // Gesamtkosten oder P1) laesst sich nichts zuordnen, die Felder bleiben.
    var placeOf = [];
    var counted = 0;
    state.foreign.forEach(function (amount, index) {
      placeOf[index] = amount > 0 && plan ? plan.foreignPlaces[counted++] : undefined;
    });

    Array.prototype.forEach.call(list.children, function (item, index) {
      var input = item.querySelector("input");
      var amount = state.foreign[index];
      if (document.activeElement !== input) input.value = amount > 0 ? formatNumber(amount) : "";
      item.querySelector(".foreign-del").hidden = index >= state.foreign.length;

      var place = item.querySelector(".foreign-place");
      var slot = placeOf[index];
      if (!(amount > 0) || !plan) {
        place.innerHTML = "";
      } else if (slot) {
        place.innerHTML = '<span class="sr-only">hält </span><span class="tag slot-' + slot + '">P' + slot + "</span>";
      } else {
        place.innerHTML = '<span class="none">kein Platz</span>';
      }
    });
  }

  function foreignRow(index) {
    var item = document.createElement("li");
    item.innerHTML =
      '<input type="text" inputmode="numeric" autocomplete="off" placeholder="FP"' +
        ' data-foreign="' + index + '" aria-label="Fremdeinzahlung ' + (index + 1) + '">' +
      '<span class="foreign-place"></span>' +
      '<button type="button" class="slot-reset foreign-del" data-foreign-del="' + index + '"' +
        ' aria-label="Fremdeinzahlung ' + (index + 1) + ' entfernen">×</button>';
    return item;
  }

  /**
   * Leere Felder zwischen den Betraegen herausnehmen. Nicht beim Tippen —
   * dort ist ein leeres Feld der Weg zu einer neuen Zahl —, sondern erst,
   * wenn der Fokus die Liste verlaesst.
   */
  function compactForeign() {
    var before = state.foreign.length;
    state.foreign = foreignAmounts();
    if (state.foreign.length === before) return;
    // Die Felder tragen ihren Platz in der Liste im Attribut; nach dem
    // Zusammenschieben stimmt das nicht mehr, also neu bauen.
    $("foreignList").innerHTML = "";
  }

  /**
   * Plaetze, die aus sind, obwohl ein kleinerer darunter noch im Spiel ist.
   *
   * P5 oder P4 wegzulassen ist ueblich: sie bringen wenig und kosten eine
   * weitere Runde Ausschreiben. P1 oder P2 selbst zu zahlen, waehrend P3
   * angeboten wird, tut dagegen niemand mit Absicht — gemeint ist fast
   * immer "schon belegt", und das heisst hier "vergeben".
   * @returns {string[]} z. B. ["P1", "P2"]
   */
  function skippedAbove(plan) {
    var skipped = [];
    plan.rows.forEach(function (row, index) {
      if (state.enabled[index] || row.reward <= 0 || row.foreign) return;
      var lowerInPlay = plan.rows.slice(index + 1).some(function (below) {
        return below.offered || below.taken;
      });
      if (lowerInPlay) skipped.push("P" + row.slot);
    });
    return skipped;
  }

  /** "P1", "P1 und P2", "P1, P2 und P3". */
  function joinSlots(labels) {
    if (labels.length < 2) return labels.join("");
    return labels.slice(0, -1).join(", ") + " und " + labels[labels.length - 1];
  }

  function renderEmpty() {
    var table = $("rows").closest("table");
    table.classList.add("none");
    $("rows").innerHTML = '<tr><td colspan="4" class="empty">Für diese Stufe fehlen noch Gesamtkosten oder P1. Trag sie unten aus dem Förderfenster ein.</td></tr>';
    ["sumTotal", "sumExternal", "sumOwn"].forEach(function (id) {
      $(id).textContent = "–";
      delete $(id).dataset.value;
    });
    $("sumPercent").textContent = "";
    $("warn").innerHTML = "";
    $("bar").innerHTML = "";
    $("bar").hidden = true;
    $("legend").hidden = true;
    $("lump").hidden = true;
    delete $("lumpValue").dataset.value;
    setChatLine("chatPlain", "");
    setChatLine("chatPoints", "");
    previousContributions = [];
    payEdit = null;
  }

  /**
   * Die fuenf Tabellenzeilen einmalig aufbauen.
   *
   * Frueher wurde die Tabelle bei jedem Zeichnen neu geschrieben. Seit die
   * Zahl unter "Kosten" sich direkt in der Zeile bearbeiten laesst, geht
   * das nicht mehr: ein neues innerHTML naehme dem Feld bei jedem
   * Tastendruck den Cursor — dieselbe Lage wie bei buildSlotRows. Gebaut
   * wird also einmal, danach werden nur Werte nachgezogen. Nebenbei bleibt
   * so auch der Fokus auf einer Checkbox stehen, ohne dass ihn jemand
   * zurueckgeben muss.
   */
  function buildRows() {
    var rows = [];
    for (var index = 0; index < Calc.SLOTS; index++) {
      var slot = index + 1;
      rows.push(
        '<tr data-row="' + index + '">' +
          '<td><label class="pl">' +
            '<input type="checkbox" data-slot="' + index + '">' +
            '<span class="tag slot-' + slot + '">P' + slot + "</span>" +
          "</label></td>" +
          '<td class="rew"></td>' +
          '<td class="pay"><button type="button" class="pay-btn" data-pay-open="' + index + '"></button></td>' +
          '<td class="pre"></td>' +
        "</tr>"
      );
    }
    $("rows").innerHTML = rows.join("");
  }

  function renderRows(plan) {
    $("rows").closest("table").classList.remove("none");
    // Nach dem Leerzustand steht statt der Zeilen ein Hinweis in der Tabelle.
    if (!$("rows").querySelector("tr[data-row]")) buildRows();

    // Ein abgewaehlter Platz hat nichts mehr zu bearbeiten.
    if (payEdit && !payEditable(plan.rows[payEdit.index], payEdit.index)) payEdit = null;

    var previous = previousContributions;
    previousContributions = plan.rows.map(function (row) { return row.contribution; });

    renderSecureHead();
    // Mit eingetragenem Stand beginnt die Summe bei dem, was schon drin ist.
    var running = plan.ownPaid || 0;

    plan.rows.forEach(function (row, index) {
      var tr = $("rows").querySelector('tr[data-row="' + index + '"]');
      var editing = payEdit != null && payEdit.index === index;
      var own = slotIsOwn(index);
      // Vergebene Plaetze zaehlen mit: ihre Absicherung ist eingezahlt, und
      // die Summe soll der Stand sein, den das Spiel als eigene FP zeigt.
      if (row.offered || row.taken) running += row.secure;

      tr.className = [row.offered ? "" : row.taken ? "taken" : row.foreign ? "taken foreign" : "off",
        own ? "own" : "", editing ? "editing" : ""].join(" ").trim();

      var checkbox = tr.querySelector('input[type="checkbox"]');
      checkbox.checked = state.enabled[index];
      // Einen Platz, den eine Fremdeinzahlung haelt, gibt kein Haekchen frei:
      // er haengt an ihrem Betrag, nicht an deiner Wahl.
      checkbox.disabled = !(row.reward > 0) || row.foreign;
      // "Vergeben" zeigt die Checkbox als Strich. Das geht nur ueber die
      // Eigenschaft, ein Attribut dafuer gibt es nicht.
      checkbox.indeterminate = Boolean(row.taken || row.foreign);
      checkbox.setAttribute("aria-label", slotLabel(row));

      tr.querySelector("td.rew").textContent = formatNumber(row.reward);

      var pay = tr.querySelector("td.pay");
      var button = pay.querySelector(".pay-btn");
      button.textContent = formatNumber(row.contribution);
      button.disabled = !payEditable(row, index);
      button.setAttribute("aria-label", row.foreign
        ? "P" + row.slot + " hält eine Fremdeinzahlung von " + formatNumber(row.contribution) + " FP"
        : "P" + row.slot + " zahlt " + formatNumber(row.contribution) +
          " FP" + (own ? ", angepasst" : "") + " — ändern");
      button.hidden = editing;
      renderPayInput(pay, index, row, editing);
      if (previous.length && previous[index] !== row.contribution) flashCell(pay);

      // Nur schreiben, was sich geaendert hat: sonst springt "Sicher" bei
      // jedem Tastendruck im Feld von vorn auf.
      var secureCell = secureText(row, running);
      var pre = tr.querySelector("td.pre");
      if (pre.innerHTML !== secureCell) pre.innerHTML = secureCell;
    });

    renderPayEditBar(plan);
  }

  /**
   * Ob sich die Einzahlung eines Platzes in der Tabelle oeffnen laesst.
   *
   * Am Haekchen, nicht daran, ob der Plan den Platz gerade anbietet: ein
   * getippter Betrag, der nicht mehr passt, macht ihn "passt nicht" — und
   * genau dann muss er sich noch korrigieren lassen, auch mitten im Tippen.
   */
  function payEditable(row, index) {
    if (row.foreign) return false;
    return row.reward > 0 && (state.enabled[index] || row.taken);
  }

  /** Die Zelle kurz aufleuchten lassen; die Animation muss dafuer neu starten. */
  function flashCell(cell) {
    cell.classList.remove("chg");
    void cell.offsetWidth;
    cell.classList.add("chg");
  }

  /**
   * Der Platz, dessen Einzahlung gerade in der Tabelle bearbeitet wird —
   * und in welcher Einheit dort getippt wird. null, wenn keiner offen ist.
   *
   * Die Einheit gehoert nur zu diesem Feld. Wer auf eine FP-Zahl tippt, will
   * meist einen Betrag eintragen, darum steht sie auf FP; nur ein Platz mit
   * eigenem Faktor oeffnet in Faktor. Der Umschalter im Block oben bleibt
   * davon unberuehrt.
   * @type {{index: number, unit: "factor"|"fp"}|null}
   */
  var payEdit = null;

  /** Das Feld in der Zelle anlegen, nachfuehren oder wieder entfernen. */
  function renderPayInput(cell, index, row, editing) {
    var input = cell.querySelector(".pay-in");
    if (!editing) {
      if (input) input.remove();
      return;
    }
    if (!input) {
      input = document.createElement("input");
      input.type = "text";
      input.className = "pay-in";
      input.autocomplete = "off";
      input.dataset.payEdit = String(index);
      cell.appendChild(input);
    }
    var unit = payEdit.unit;
    input.setAttribute("inputmode", unit === "fp" ? "numeric" : "decimal");
    input.setAttribute("enterkeyhint", "done");
    input.setAttribute("aria-label", (unit === "fp" ? "Einzahlung für P" : "Faktor für P") + row.slot);
    input.classList.toggle("factor", unit === "factor");
    // Waehrend des Tippens nicht dazwischenfunken.
    if (document.activeElement !== input) input.value = payEditValue(index, row);
  }

  /** Was im Feld der Tabelle steht — in der Einheit, die dort gewaehlt ist. */
  function payEditValue(index, row) {
    if (payEdit.unit === "fp") return formatNumber(row.contribution);
    // Ein getippter Betrag hat keinen eigenen Faktor; gezeigt wird der, den
    // er auf diese Belohnung bedeutet.
    if (state.slotPays[index] != null && row.reward > 0) return formatFactor(impliedFactor(row));
    return formatFactor(effectiveFactors()[index]);
  }

  /**
   * Die schmale Zeile unter dem bearbeiteten Platz: die andere Einheit,
   * der Umschalter, das Zuruecknehmen und "Fertig".
   *
   * Sie steht nur im DOM, solange ein Platz offen ist — die Tabelle hat
   * sonst genau fuenf Zeilen, und so soll es fuer alles bleiben, das sie
   * zaehlt.
   */
  function renderPayEditBar(plan) {
    var bar = $("rows").querySelector("tr.pay-edit");
    if (!payEdit) {
      if (bar) bar.remove();
      return;
    }
    var index = payEdit.index;
    var row = plan.rows[index];
    var anchor = $("rows").querySelector('tr[data-row="' + index + '"]');

    if (!bar || Number(bar.dataset.for) !== index) {
      if (bar) bar.remove();
      bar = document.createElement("tr");
      bar.className = "pay-edit";
      bar.dataset.for = String(index);
      bar.innerHTML =
        '<td colspan="4"><div class="pay-edit-bar">' +
          '<span class="pay-edit-hint"></span>' +
          '<div class="seg" role="group" aria-label="Einheit für P' + row.slot + '">' +
            '<button type="button" data-pay-unit="factor">Faktor</button>' +
            '<button type="button" data-pay-unit="fp">FP</button>' +
          "</div>" +
          '<button type="button" class="link pay-edit-reset"' +
            ' aria-label="P' + row.slot + ' wieder dem Faktor oben folgen lassen">Zurücksetzen</button>' +
          '<button type="button" class="pay-edit-done">Fertig</button>' +
        "</div></td>";
    }
    anchor.after(bar);
    bar.classList.toggle("own", slotIsOwn(index));

    bar.querySelector(".pay-edit-hint").textContent = payEdit.unit === "fp"
      ? (row.reward > 0 ? "≙ Faktor " + formatFactor(impliedFactor(row)) : "")
      : "≙ " + formatNumber(row.contribution) + " FP";
    bar.querySelectorAll("[data-pay-unit]").forEach(function (button) {
      button.setAttribute("aria-pressed", String(button.dataset.payUnit === payEdit.unit));
    });
    bar.querySelector(".pay-edit-reset").hidden = !slotIsOwn(index);
  }

  /** Die Einzahlung eines Platzes in der Tabelle zum Bearbeiten oeffnen. */
  function openPayEdit(index) {
    payEdit = { index: index, unit: state.slotFactors[index] != null ? "factor" : "fp" };
    render();
    focusPayInput();
  }

  /**
   * Das Feld wieder schliessen. `refocus`, wenn es ueber die Tastatur oder
   * "Fertig" zuging: dann landet der Fokus auf der Zahl, statt auf <body>
   * zu fallen. Bei einem Tipp daneben hat der Fokus schon ein neues Ziel.
   */
  function closePayEdit(refocus) {
    if (!payEdit) return;
    var index = payEdit.index;
    payEdit = null;
    render();
    if (refocus) {
      var button = $("rows").querySelector('[data-pay-open="' + index + '"]');
      if (button && !button.disabled) button.focus({ preventScroll: true });
    }
  }

  function focusPayInput() {
    var input = $("rows").querySelector(".pay-in");
    if (!input) return;
    input.focus({ preventScroll: true });
    input.select();
  }

  /** Was ein Screenreader an der Checkbox eines Platzes vorliest. */
  function slotLabel(row) {
    var name = "Platz P" + row.slot;
    if (row.foreign) return name + " hält eine Fremdeinzahlung";
    if (row.taken) return name + " vergeben — umschalten auf nicht anbieten";
    if (state.enabled[row.slot - 1] && !row.tooTight) return name + " anbieten — umschalten auf vergeben";
    return name + " anbieten";
  }

  /**
   * Was in der Spalte "Sichern" steht.
   *
   * Zwei Lesarten derselben Zahl: der Schritt, den dieser Platz kostet, oder
   * der Stand, den du erreicht hast, wenn er sicher ist. Manche rechnen so,
   * manche so — dieselbe Lage wie bei der Stufenzahl.
   *
   * "Sicher" gilt in beiden: wo nichts nachzulegen ist, bewegt sich auch die
   * Summe nicht, und das Wort sagt es deutlicher als eine wiederholte Zahl.
   * Eine Sonderregel fuer P2 braucht es dafuer nicht — der Platz ist nach P1
   * fast immer von selbst sicher, und wo eigene Faktoren oder Betraege doch
   * etwas noetig machen, soll die Zahl ja gerade erscheinen.
   *
   * @param {object} row Zeile aus dem Plan
   * @param {number} running Summe der Absicherungen bis hier einschliesslich
   */
  function secureText(row, running) {
    if (row.taken) return '<span class="given">vergeben</span>';
    if (row.foreign) return '<span class="given">fremd</span>';
    // Leise, damit das Gruen der Spalte nur an Betraegen steht, die du zahlst.
    if (!row.offered) return '<span class="none">' + (row.tooTight ? "passt nicht" : "–") + "</span>";
    if (row.secure === 0) return '<span class="safe">Sicher</span>';
    return state.secureMode === "total"
      ? formatNumber(running)
      : "+" + formatNumber(row.secure);
  }

  /**
   * Den Spaltenkopf auf die aktive Lesart stellen.
   *
   * Er traegt sie als Wort, nicht als stillen Zustand: an einer nackten Zahl
   * stuende sonst nicht, welche der beiden man gerade liest.
   */
  function renderSecureHead() {
    var total = state.secureMode === "total";
    $("secureModeLabel").textContent = total ? "Eigen" : "Sichern";
    $("secureMode").setAttribute("aria-label", total
      ? "Eigen — umschalten auf das, was dieser Platz zum Sichern kostet"
      : "Sichern — umschalten auf deine laufenden Eigen-FP");
  }

  function renderBar(plan) {
    var bar = $("bar");
    bar.hidden = false;
    $("legend").hidden = false;

    var segments = [["own", plan.ownShare]].concat(plan.rows.map(function (row) {
      return [String(row.slot), row.offered || row.taken || row.foreign ? row.contribution : 0];
    }));
    // Fremdeinzahlungen ohne Platz liegen trotzdem im Bauwerk: ein eigenes,
    // neutrales Stueck, nur wenn es sie gibt.
    if (plan.foreignLoose > 0) segments.push(["loose", plan.foreignLoose]);

    if (bar.children.length !== segments.length) {
      bar.innerHTML = segments.map(function (segment) {
        return '<i class="b-' + segment[0] + '"></i>';
      }).join("");
    }
    segments.forEach(function (segment, index) {
      bar.children[index].style.width = (segment[1] / plan.total * 100) + "%";
    });
  }

  function renderUpfront(plan) {
    var offered = plan.rows.filter(function (row) { return row.offered; });
    $("lump").hidden = offered.length === 0;
    if (!offered.length) return;

    countTo($("lumpValue"), plan.upfrontOpen);

    var labels = offered.map(function (row) { return "P" + row.slot; });
    // "P1 bis P5" nur, wenn auch alle dazwischen angeboten sind — sonst
    // klaenge es, als waeren vergebene oder fremd gehaltene Plaetze dabei.
    var gapless = offered[offered.length - 1].slot - offered[0].slot === offered.length - 1;
    var range = labels.length > 2 && gapless
      ? labels[0] + " bis " + labels[labels.length - 1]
      : joinSlots(labels);

    // Die Summe ist die Summe aller Vorleistungen, nicht eine Einzahlung:
    // wer sie auf einen Schlag einzahlt und wartet, hat die hinteren
    // Plaetze fuer kleines Geld offen stehen. Der Fliesstext sagt das mit
    // "der Reihe nach"; die grosse Zahl daneben liest sich trotzdem wie
    // eine Aufforderung. Ein Halbsatz genuegt — das Risiko ist bekannt.
    $("lumpText").innerHTML = plan.remainder > 0
      ? "Damit sind " + range + " sicher, wenn sie der Reihe nach belegt werden; einzahlen also Platz für Platz, " +
        "nicht die ganze Summe vorweg. Die letzten <b>" +
        formatNumber(plan.remainder) + " FP</b> zahlst du danach selbst ein und levelst damit." +
        alreadyIn(plan)
      : "Achtung: Auf dieser Stufe schließt " + labels[labels.length - 1] +
        " die Stufe ab, du kannst nicht selbst leveln.";
  }

  /**
   * Der Satz ueber die Absicherung vergebener Plaetze. Der Kasten nennt nur,
   * was noch aussteht; die Spalte "Eigen" zaehlt das schon Eingezahlte mit.
   * Ohne diesen Satz passen beide Zahlen scheinbar nicht zusammen.
   */
  function alreadyIn(plan) {
    var paid = plan.upfront - plan.upfrontOpen;
    if (paid <= 0) return "";
    if (plan.ownPaid) {
      return " Du hast schon <b>" + formatNumber(paid) + " FP</b> im Bauwerk, zusammen also " +
        formatNumber(plan.upfront) + " FP.";
    }
    return " Für die vergebenen Plätze hast du schon <b>" + formatNumber(paid) +
      " FP</b> eingezahlt, zusammen also " + formatNumber(plan.upfront) + " FP.";
  }

  function renderTotals(plan) {
    countTo($("sumTotal"), plan.total);
    countTo($("sumExternal"), plan.external);
    countTo($("sumOwn"), plan.ownShare);
    $("sumPercent").textContent = Math.round(plan.ownShare / plan.total * 100) + " %";
  }

  function renderChat(plan, building) {
    var heading = [state.name.trim(), shortName(building)].filter(Boolean).join(" ");
    setChatLine("chatPlain", Calc.chatLine(plan, heading, false));
    setChatLine("chatPoints", Calc.chatLine(plan, heading, true));
  }

  function setChatLine(id, text) {
    $(id).textContent = text;
    renderChatCopy();
  }

  /** Die Zeile, die der Schalter gerade meint. */
  function chatSource() {
    return $(state.chatMode === "points" ? "chatPoints" : "chatPlain");
  }

  /**
   * Schalter, sichtbare Fassung und Knopf auf den Stand bringen. Kopiert
   * wird erst mit Namen: ohne ihn weiss die Gilde nicht, von wem die
   * Foerderung ist. Bis dahin fuehrt der Knopf ins Namensfeld. Und ein
   * aktiver Kopierknopf ueber einem leeren Kasten sieht bedienbar aus, tut
   * aber nichts — der bleibt aus.
   */
  function renderChatCopy() {
    var points = state.chatMode === "points";
    $("chatPlain").hidden = points;
    $("chatPoints").hidden = !points;
    document.querySelectorAll("[data-chat-mode]").forEach(function (button) {
      button.setAttribute("aria-pressed", String(button.dataset.chatMode === state.chatMode));
    });
    var button = $("chatCopy");
    var named = Boolean(state.name.trim());
    button.classList.toggle("needs-name", !named);
    if (!button.classList.contains("done")) {
      button.textContent = named ? "Zeile kopieren" : "Erst Namen eintragen";
    }
    button.disabled = named && !chatSource().textContent;
  }

  // ---------------------------------------------------------------- Sammlung

  /*
   * Wer mehrere Bauwerke gleichzeitig in die Foerdergruppe stellt, braucht
   * am Ende eine Nachricht mit allen Zeilen darin. Bisher war der Umweg
   * dafuer eine Notiz ausserhalb: kopieren, wegschreiben, naechstes
   * Bauwerk, wieder kopieren. Die Sammlung ist diese Notiz — nur an der
   * Stelle, an der die Zeilen ohnehin entstehen.
   *
   * Gesammelt wird beim Kopieren und nicht ueber einen eigenen Knopf. Der
   * Grund ist die Wahl zwischen "Nur Plaetze" und "Mit FP": ein Knopf
   * "Sammeln" muesste sie ein zweites Mal stellen. Der Schalter ueber der
   * Zeile hat sie schon beantwortet, also nimmt die Sammlung genau die
   * Zeile, die auch in der Zwischenablage landet.
   */

  /**
   * Die Zeile eines Bauwerks in die Sammlung legen.
   *
   * Mitgemerkt wird, wo in der Zeile der Name des Bauwerks steht. Stellt
   * jemand danach den Schalter "Kuerzel" um oder vergibt ein eigenes, zieht
   * die Zeile mit — sonst staende in einer Nachricht "AO" neben
   * "Terrakotta-Armee", je nachdem, wann kopiert wurde.
   */
  function collect(id, text) {
    if (!text) return;

    var entry = { id: id, text: text };
    var building = byId[id];
    if (building) {
      var name = state.name.trim();
      var label = shortName(building);
      var at = name ? name.length + 1 : 0;
      if (labelFits(text, label, at)) {
        entry.label = label;
        entry.at = at;
      }
    }

    // Je Bauwerk eine Zeile: wer nach einer Korrektur erneut kopiert,
    // meint dieselbe Foerderung noch einmal, nicht eine zweite. Die neue
    // Zeile ersetzt die alte an deren Platz, damit die Reihenfolge der
    // Sammlung die Reihenfolge des Sammelns bleibt.
    var at = collectionIndex(id);
    if (at >= 0) collection[at] = entry;
    else collection.push(entry);

    if (collection.length > MAX_COLLECTED) collection.shift();

    write(HERE.collection, collection);
    renderCollection(at >= 0 ? at : collection.length - 1);
  }

  /**
   * Den Namen in gesammelten Zeilen auf den Stand bringen, den das Bauwerk
   * gerade traegt. Geschrieben wird nur, wenn sich etwas geaendert hat.
   * @returns {boolean} ob sich etwas geaendert hat
   */
  function relabelCollection() {
    var changed = false;
    collection.forEach(function (entry) {
      var building = byId[entry.id];
      if (!building || entry.label == null) return;
      var label = shortName(building);
      if (label === entry.label) return;
      entry.text = entry.text.slice(0, entry.at) + label + entry.text.slice(entry.at + entry.label.length);
      entry.label = label;
      changed = true;
    });
    if (changed) write(HERE.collection, collection);
    return changed;
  }

  function collectionIndex(id) {
    for (var i = 0; i < collection.length; i++) {
      if (collection[i].id === id) return i;
    }
    return -1;
  }

  /** Alle gesammelten Zeilen so, wie sie in den Chat gehoeren. */
  function collectionText() {
    return collection.map(function (entry) { return entry.text; }).join("\n");
  }

  /**
   * Die Sammlung zeichnen. `fresh` ist der Eintrag, der gerade dazukam —
   * er blinkt kurz auf, sonst sieht man dem Kopierknopf nicht an, dass er
   * zwei Dinge getan hat.
   */
  function renderCollection(fresh) {
    var box = $("collection");
    box.hidden = collection.length === 0;
    $("collCount").textContent = collection.length +
      (collection.length === 1 ? " Zeile" : " Zeilen");

    $("collList").innerHTML = collection.map(function (entry, index) {
      var building = byId[entry.id];
      var what = building ? shortName(building) : entry.text;
      return '<li' + (index === fresh ? ' class="fresh"' : "") + ">" +
        '<span class="coll-t">' + escapeHtml(entry.text) + "</span>" +
        '<button type="button" class="coll-del" data-drop="' + index + '" aria-label="' +
          escapeHtml(what) + ' aus der Sammlung entfernen">×</button>' +
      "</li>";
    }).join("");
  }

  /**
   * Den Ausblendtest fuer das Zeitalter eines Bauwerks holen.
   * @returns {{samples:number, misses:number, worst:number}|null}
   *   null heisst: zu wenige belegte Stufen, um etwas zu behaupten.
   */
  function curveReliability(building) {
    if (!building.curve) return null;
    var curve = DATA.curves[building.curve];
    return curve ? Calc.curveReliability(building.curve, curve) : null;
  }

  /** Das Eingabefeld fuer eine eigene P1-Belohnung. */
  function fieldP1(p1) {
    return '<div><label for="inputP1">P1-Belohnung</label>' +
      '<input id="inputP1" type="number" inputmode="numeric" min="5" step="5" value="' +
      (p1.value == null ? "" : p1.value) + '"></div>';
  }

  /**
   * Woher ein hochgerechnetes P1 kommt und wie weit es danebenliegen kann.
   *
   * Die Spanne ist keine Schaetzung, sondern gemessen: curveReliability
   * fittet die Kurve des Zeitalters auf ihrem unteren Teil und prueft sie
   * gegen die echten Werte darueber — also genau gegen die Lage, in der
   * diese Zahl hier steht.
   */
  function derivedP1Text(building) {
    var reliability = curveReliability(building);
    var origin = state.level > building.maxLevel
      ? "Stufe " + state.level + " liegt über dem, was das Wiki für " + escapeHtml(building.name) +
        " dokumentiert (bis " + building.maxLevel + "); P1 ist aus der Kurve des Zeitalters hochgerechnet."
      : "P1 ist auf dieser Stufe aus der Kurve des Zeitalters hochgerechnet.";

    return origin + " " + (reliability
      ? "Im Rückblick traf die Kurve die belegten Stufen dieses Zeitalters bis auf " + reliability.worst + " FP genau."
      : "Für dieses Zeitalter sind zu wenige Stufen belegt, um zu sagen, wie genau die Kurve trifft.");
  }

  /**
   * Die ruhige Fassung des Hinweises: eine Zeile, kein Kasten.
   *
   * Der Plan stimmt ja — es fehlt nur die letzte Bestaetigung. Wer sie
   * geben will, klappt sich das Feld mit dem Textknopf auf; bis dahin
   * kostet es keine Hoehe und lenkt nichts ab.
   */
  function quietNote(building, p1) {
    return '<div class="note quiet">' + derivedP1Text(building) +
      ' <button type="button" class="link" id="noteReveal">Aus dem Spiel eintragen</button>' +
      '<div class="in" id="noteFields" hidden>' + fieldP1(p1) +
      '<button type="button" class="go" id="applyInput">Bestätigen</button></div></div>';
  }

  /**
   * Hinweise zu unsicheren Werten und das Eingabefeld fuer eigene Zahlen.
   *
   * Drei Toene, weil es drei Lagen gibt. Fehlt ein Wert, kann ich ohne
   * Eintrag gar nicht rechnen — das ist eine Bitte, und der Kasten warnt.
   * Ist ein Wert dagegen aus widerspruechlichen Wiki-Angaben gewaehlt oder
   * aus einem eigenen Eintrag hochgerechnet, steht bereits die
   * bestbegruendete Zahl im Plan und im Feld; dann ist der Kasten eine
   * Einladung zum Gegenlesen.
   *
   * Der dritte Ton ist der leiseste und gilt dem haeufigsten Fall: einem
   * P1, das aus der Kurve des Zeitalters stammt. Wie treffsicher die ist,
   * steht nicht zur Vermutung, sondern wird gemessen (curveReliability).
   * Zeitalter, die den Ausblendtest ohne Fehlschuss bestehen, bekommen gar
   * keinen Hinweis — dort waere er nur Misstrauen gegen die eigene Rechnung.
   *
   * Ueber Kosten steht hier nichts, solange das Bauwerk einen Basiswert
   * hat: die Formel A * 1,025^Stufe ist gegen jede Ablesung aus dem Spiel
   * geprueft und trifft. Nur ohne Basiswert — also hochgerechnet aus einem
   * eigenen Eintrag oder gar nicht vorhanden — ist dazu etwas zu sagen.
   */
  function renderNote(building, total, p1) {
    var needTotal = !TRUSTED_SOURCES[total.source];
    var needP1 = !TRUSTED_SOURCES[p1.source];
    var html = "";

    if (needTotal || needP1) {
      var missing = []; // Ohne diese Zahlen fehlt dem Plan die Grundlage
      var checks = [];  // Diese Zahlen stehen im Plan, nur ungeprueft

      if (total.source === null) {
        missing.push(building.base == null
          ? "Für " + escapeHtml(building.name) + " gibt es noch keine Kostendaten. Nach deinem ersten Eintrag rechne ich die übrigen Stufen hoch."
          : "Gesamtkosten fehlen.");
      }
      if (total.source === "derived") checks.push("Gesamt ist aus deinem Eintrag auf Stufe " + total.from + " hochgerechnet.");
      if (p1.source === null) missing.push("P1 ist für diese Stufe noch unbekannt.");
      if (p1.source === "conflict") checks.push("Für P1 auf dieser Stufe nennt das Wiki mehr als eine Zahl. Im Plan steht die, die zur Kurve des Zeitalters passt — erfahrungsgemäß ist das die richtige.");

      // Ein hochgerechnetes P1 ist der haeufigste und der harmloseste Fall.
      // Steht es allein da, entscheidet der Ausblendtest des Zeitalters,
      // wie viel Aufhebens noetig ist: gar keins, oder eine Zeile.
      if (p1.source === "derived" && !missing.length && !checks.length) {
        var sure = curveReliability(building);
        if (!sure || sure.misses) html += quietNote(building, p1);
      } else {
        if (p1.source === "derived") checks.push(derivedP1Text(building));

        var urgent = missing.length > 0;
        var lead = missing.concat(checks).join(" ") + " " + (urgent
          ? "Bitte im Förderfenster nachsehen und eintragen, dann ist alles exakt."
          : "Ein Blick ins Förderfenster bestätigt das in Sekunden. Stimmt die Zahl, übernimm sie einmal — dann rechne ich hier ohne Vorbehalt weiter und frage auf dieser Stufe nicht wieder.");

        html += '<div class="note' + (urgent ? "" : " chk") + '">' + lead +
          '<div class="in">' +
            (needTotal ? '<div><label for="inputTotal">Gesamt-FP</label><input id="inputTotal" type="number" inputmode="numeric" min="1" value="' + (total.value == null ? "" : total.value) + '"></div>' : "") +
            (needP1 ? fieldP1(p1) : "") +
            '<button type="button" class="go" id="applyInput">' + (urgent ? "Übernehmen" : "Bestätigen") + '</button>' +
          "</div></div>";
      }
    }

    var manual = [total.source === "manual" && "Gesamt", p1.source === "manual" && "P1"].filter(Boolean);
    if (manual.length) {
      html += '<div class="note man">' + manual.join(" und ") +
        ' auf dieser Stufe von dir aus dem Spiel eingetragen. <button type="button" class="link" id="resetInput">Zurücksetzen</button></div>';
    }

    $("note").innerHTML = html;
  }

  // --------------------------------------------------------------- Favoriten

  function favoriteIndex(id) {
    for (var i = 0; i < favorites.length; i++) {
      if (favorites[i].id === id) return i;
    }
    return -1;
  }

  /**
   * Die Stufe eines gemerkten Bauwerks mitfuehren.
   *
   * Wer sein gemerktes Bauwerk eine Stufe weiterzieht, musste es vorher neu
   * merken — und hatte es dann zweimal in der Liste. Jetzt ist die Stufe im
   * Favoriten schlicht die, auf der das Bauwerk zuletzt stand.
   */
  function syncFavoriteLevel() {
    var index = favoriteIndex(state.building);
    if (index < 0 || favorites[index].level === state.level) return;
    favorites[index].level = state.level;
    write(HERE.favorites, favorites);
  }

  /**
   * Beim Wechsel auf ein gemerktes Bauwerk dessen Stufe uebernehmen.
   *
   * Ohne das wuerde syncFavoriteLevel gleich darauf die mitgebrachte Stufe
   * des vorigen Bauwerks in den Favoriten schreiben: von der Arche auf 81
   * per Auswahlfeld zu Notre Dame gewechselt, und Notre Dames gemerkte 42
   * waeren ueberschrieben. So ist der Wechsel per Auswahlfeld oder Suche
   * dasselbe wie der Tipp auf den Chip.
   */
  function adoptFavoriteLevel() {
    var index = favoriteIndex(state.building);
    if (index >= 0) state.level = favorites[index].level;
  }

  /**
   * Ein Favorit ist ein Bauwerk — jedes hoechstens einmal —, und seine
   * Stufe ist die, auf der es zuletzt stand. Sie wandert beim Leveln mit,
   * ohne dass man neu merken muss.
   *
   * Die Liste ist "zuletzt benutzt zuerst": Merken und Antippen stellen
   * einen Eintrag nach vorn. Der erste Chip ist damit das, womit zuletzt
   * gearbeitet wurde — im Normalfall also das Aktive.
   *
   * Der Knopf beschriftet sich mit dem, was er merkt, und die Liste steht
   * oben im Panel statt ganz unten dahinter. Vorher war beides unauffaellig:
   * ein graues Label und ein kleiner Stern hinter Suche, Stufe, Name und
   * Faktor, auf dem Telefon also ausserhalb des ersten Bildschirms.
   *
   * Solange nichts gemerkt ist, faellt der Streifen ganz weg. Der Knopf
   * erklaert die Funktion dann allein — besser als ein leerer Platzhalter
   * an der prominentesten Stelle der Seite.
   */
  function renderFavorites() {
    var current = favoriteIndex(state.building);
    var offset = levelOffset();
    var saveButton = $("favSave");
    var chosen = byId[state.building];

    saveButton.setAttribute("aria-pressed", String(current >= 0));
    $("favSaveText").textContent = shortName(chosen) + " · Stufe " + (state.level - offset) +
      (current >= 0 ? " gemerkt" : " merken");
    saveButton.title = current >= 0
      ? "Diese Kombination aus den Favoriten entfernen"
      : "Bauwerk und Stufe als Favorit merken";

    $("favList").innerHTML = favorites.map(function (entry, index) {
      var building = byId[entry.id];
      var shown = entry.level - offset;
      return '<li' + (index === current ? ' aria-current="true"' : "") + ">" +
        '<button type="button" class="fav-go" data-load="' + index + '" title="' +
          escapeHtml(building.name + ", Stufe " + shown) + '">' +
          '<span class="fav-n">' + escapeHtml(shortName(building)) + "</span> <b>" + shown + "</b>" +
        "</button>" +
        '<button type="button" class="fav-del" data-delete="' + index + '" aria-label="' +
          escapeHtml(shortName(building) + " Stufe " + shown) + ' aus den Favoriten entfernen">×</button>' +
      "</li>";
    }).join("");

    $("favs").hidden = favorites.length === 0;
    revealCurrentFavorite(current);
  }

  /**
   * Die Favoritenliste zeigt nur drei Reihen. Steht der aktive Eintrag
   * darunter, wird er hereingeholt — ohne die Seite selbst zu scrollen,
   * darum von Hand statt ueber scrollIntoView.
   */
  function revealCurrentFavorite(index) {
    if (index < 0) return;
    var list = $("favList");
    var entry = list.children[index];
    if (!entry) return;

    var top = entry.offsetTop - list.offsetTop;
    var bottom = top + entry.offsetHeight;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
  }

  /** Einen Eintrag an den Anfang der Liste stellen und das speichern. */
  function moveFavoriteToFront(index) {
    if (index <= 0 || index >= favorites.length) return;
    favorites.unshift(favorites.splice(index, 1)[0]);
    write(HERE.favorites, favorites);
  }

  function toggleFavorite() {
    var index = favoriteIndex(state.building);
    if (index >= 0) {
      favorites.splice(index, 1);
    } else {
      if (favorites.length >= MAX_FAVORITES) favorites.pop();
      favorites.unshift({ id: state.building, level: state.level });
    }
    write(HERE.favorites, favorites);
    renderFavorites();
  }

  // --------------------------------------------------------------- Ereignisse

  function bindEvents() {
    document.querySelector(".modes").addEventListener("click", function (event) {
      var button = event.target.closest("button");
      if (button) setTheme(button.dataset.mode, true);
    });

    bindPicker();

    $("building").addEventListener("change", function (event) {
      state.building = event.target.value;
      adoptFavoriteLevel();
      render();
    });

    $("level").addEventListener("change", function (event) {
      state.level = Number(event.target.value) + levelOffset();
      render();
    });

    $("levelMode").addEventListener("click", function (event) {
      var button = event.target.closest("button");
      if (!button) return;
      // Nur die Anzeige wechselt, nicht die gerechnete Stufe: wer von
      // "naechste 81" auf "aktuell" umstellt, sieht 80 und denselben Plan.
      state.levelMode = button.dataset.levelMode === "current" ? "current" : "next";
      render();
    });

    // Von Stufe 10 auf 80 hiesse sonst: siebzig Mal tippen oder erst leeren.
    // Markiert ersetzt die erste Ziffer den alten Wert.
    $("level").addEventListener("focus", function (event) { event.target.select(); });

    $("buildingFilter").addEventListener("input", renderFilter);
    $("buildingFilter").addEventListener("keydown", function (event) {
      if (event.key === "Escape" && event.target.value) {
        event.preventDefault();
        clearBuildingFilter();
        return;
      }
      // Enter nimmt den ersten Treffer — der haeufige Fall, wenn die Suche
      // eindeutig ist.
      if (event.key === "Enter") {
        var first = currentMatches()[0];
        if (first) { event.preventDefault(); pickBuilding(first.building.id); }
      }
    });

    $("filterResults").addEventListener("click", function (event) {
      var button = event.target.closest("button[data-pick]");
      if (button) pickBuilding(button.dataset.pick);
    });

    $("filterClear").addEventListener("click", function () { clearBuildingFilter(); });

    $("levelDown").addEventListener("click", function () { state.level -= 1; render(); });
    $("levelUp").addEventListener("click", function () { state.level += 1; render(); });

    $("factorDown").addEventListener("click", function () { stepFactor(-1); });
    $("factorUp").addEventListener("click", function () { stepFactor(1); });

    // Beim Tippen mitrechnen, solange etwas Brauchbares dasteht.
    $("factor").addEventListener("input", function (event) {
      var parsed = parseFactor(event.target.value);
      if (parsed) { state.factor = parsed; render(); }
    });

    // Beim Verlassen aufraeumen: der Wert steht danach sauber formatiert da,
    // auch wenn jemand "1,9" oder Unsinn eingetippt hat.
    $("factor").addEventListener("blur", function () {
      $("factor").value = formatFactor(state.factor);
    });

    $("factor").addEventListener("keydown", function (event) {
      if (event.key === "ArrowUp") { event.preventDefault(); stepFactor(1); }
      else if (event.key === "ArrowDown") { event.preventDefault(); stepFactor(-1); }
      else if (event.key === "Enter") { event.target.blur(); }
    });

    $("factor").addEventListener("focus", function (event) { event.target.select(); });

    $("factorChips").addEventListener("click", function (event) {
      var factor = event.target.dataset.factor;
      if (factor) { state.factor = Number(factor); render(); }
    });

    $("slotList").addEventListener("click", function (event) {
      var step = event.target.closest("[data-slot-step]");
      if (step) {
        stepSlotFactor(Number(step.dataset.slot), Number(step.dataset.slotStep));
        return;
      }
      var reset = event.target.closest("[data-slot-reset]");
      if (reset) {
        clearSlot(Number(reset.dataset.slotReset));
        render();
      }
    });

    // Beim Tippen mitrechnen, solange etwas Brauchbares dasteht — und genau
    // dadurch wird der Platz eigen.
    $("slotList").addEventListener("input", function (event) {
      if (event.target.tagName !== "INPUT") return;
      var index = Number(event.target.dataset.slot);
      // Die Einheit der Zeile entscheidet, was hier ankommt. Eine folgende
      // Zeile uebernimmt die des Blocks und ist danach eigen — in genau
      // dieser Einheit, sie wird nicht umgerechnet.
      if (slotUnitFor(index) === "fp") {
        var amount = parseAmount(event.target.value);
        if (amount) {
          setSlotPay(index, amount);
          render();
        }
        return;
      }
      var parsed = parseFactor(event.target.value);
      if (parsed) {
        setSlotFactor(index, parsed);
        render();
      }
    });

    // blur und focus steigen nicht auf, darum in der Erfassungsphase.
    $("slotList").addEventListener("blur", function (event) {
      if (event.target.tagName !== "INPUT") return;
      var index = Number(event.target.dataset.slot);
      event.target.value = slotFieldValue(index, lastPlan);
    }, true);

    $("slotList").addEventListener("focus", function (event) {
      if (event.target.tagName === "INPUT") event.target.select();
    }, true);

    $("slotList").addEventListener("keydown", function (event) {
      if (event.target.tagName !== "INPUT") return;
      var index = Number(event.target.dataset.slot);
      if (event.key === "ArrowUp") { event.preventDefault(); stepSlotFactor(index, 1); }
      else if (event.key === "ArrowDown") { event.preventDefault(); stepSlotFactor(index, -1); }
      else if (event.key === "Enter") { event.target.blur(); }
    });

    // Variante C: ein ausdruecklicher Griff, der alle fuenf wieder dem
    // Wert oben folgen laesst. Der obere Stepper selbst tut das nicht —
    // er bewegt nur die Folger, sonst waeren fuenf eingestellte Werte mit
    // einem Versehen weg.
    $("slotsReset").addEventListener("click", function () {
      state.slotFactors = normaliseSlotFactors(null);
      state.slotPays = normaliseSlotPays(null);
      render();
    });

    // Der Umschalter aendert keine einzige gespeicherte Zahl — nur, in
    // welcher Einheit die Zeilen dastehen und was beim Tippen gemeint ist.
    // Ein getippter Betrag bleibt in FP, siehe slotUnitFor.
    $("slotUnit").addEventListener("click", function (event) {
      var button = event.target.closest("[data-slot-unit]");
      if (!button) return;
      state.slotUnit = button.dataset.slotUnit === "fp" ? "fp" : "factor";
      render();
    });

    $("slots").addEventListener("toggle", function (event) {
      state.slotsOpen = event.target.open;
      persistState();
    });

    // Zwei Schalter, ein Zustand: beim Bauwerk und am Foerderchat.
    ["useAbbr", "useAbbrChat"].forEach(function (id) {
      $(id).addEventListener("change", function (event) {
        state.useAbbr = event.target.checked;
        render();
      });
    });

    // Leer heisst: wieder der Reihe nach gesichert rechnen. Punkte und
    // Leerzeichen aus "10.000" stoeren nicht.
    $("ownPaid").addEventListener("input", function (event) {
      var digits = event.target.value.replace(/[^0-9]/g, "");
      state.ownPaid = digits === "" ? null : Number(digits);
      state.ownPaidFor = ownPaidKey();
      render();
    });
    $("ownPaid").addEventListener("blur", function () { render(); });

    // Ein Feld je Fremdeinzahlung. Wer ins leere letzte tippt, legt einen
    // neuen Betrag an; renderForeign haengt dann das naechste leere an.
    $("foreignList").addEventListener("input", function (event) {
      if (event.target.tagName !== "INPUT") return;
      var index = Number(event.target.dataset.foreign);
      var digits = event.target.value.replace(/[^0-9]/g, "");
      var amount = digits === "" ? null : Number(digits);
      if (index >= state.foreign.length) {
        if (!(amount > 0)) return;
        state.foreign.push(amount);
      } else {
        state.foreign[index] = amount > 0 ? amount : null;
      }
      state.ownPaidFor = ownPaidKey();
      render();
    });

    $("foreignList").addEventListener("keydown", function (event) {
      if (event.target.tagName === "INPUT" && event.key === "Enter") event.target.blur();
    });

    // Erst wenn der Fokus die Liste ganz verlaesst, fallen leere Felder weg.
    $("foreignList").addEventListener("focusout", function (event) {
      if (event.relatedTarget && $("foreignList").contains(event.relatedTarget)) return;
      compactForeign();
      render();
    });

    $("foreignList").addEventListener("click", function (event) {
      var del = event.target.closest("[data-foreign-del]");
      if (!del) return;
      var index = Number(del.dataset.foreignDel);
      state.foreign.splice(index, 1);
      $("foreignList").innerHTML = "";
      render();
      // Der Fokus soll nicht ins Leere fallen: auf das Feld, das jetzt an
      // dieser Stelle steht, sonst auf das leere am Ende.
      var inputs = $("foreignList").querySelectorAll("input");
      inputs[Math.min(index, inputs.length - 1)].focus();
    });

    $("stand").addEventListener("toggle", function (event) {
      state.standOpen = event.target.open;
      persistState();
    });

    $("playerName").addEventListener("input", function (event) {
      state.name = event.target.value;
      render();
    });

    // Leer heisst "den Namen aus dem Datensatz nehmen", also faellt der
    // Eintrag dann ganz weg. Ist danach nichts mehr eigen, verschwindet auch
    // der Schluessel — einen leeren Speicher anzulegen waere dasselbe wie
    // eine Vorgabe zu speichern, die niemand gewaehlt hat.
    $("buildingShort").addEventListener("input", function (event) {
      var text = cleanShort(event.target.value);
      if (text) ownShorts[state.building] = text;
      else delete ownShorts[state.building];

      if (Object.keys(ownShorts).length) write(KEY.shorts, ownShorts);
      else remove(KEY.shorts);
      render();
    });

    // Beim Verlassen zeigt das Feld, was wirklich gespeichert ist: wer nur
    // Leerzeichen tippt, hat nichts vergeben.
    $("buildingShort").addEventListener("blur", function (event) {
      event.target.value = ownShorts[state.building] || "";
    });

    // Der Kopf traegt die Handhabe, die Zellen nehmen den Klick trotzdem an:
    // wer die Zahl antippt, meint sie auch. Die Haekchen bleiben davon
    // unberuehrt, die liegen in der ersten Spalte.
    function toggleSecureMode() {
      state.secureMode = state.secureMode === "total" ? "step" : "total";
      render();
    }

    $("secureMode").addEventListener("click", toggleSecureMode);

    $("rows").addEventListener("click", function (event) {
      if (event.target.closest("td.pre")) { toggleSecureMode(); return; }

      // Die Zahl unter "Kosten" oeffnet sich in der Zeile selbst. Der
      // Block oben kann dasselbe, liegt aber eine Bildschirmhoehe entfernt —
      // hier sieht man beim Tippen, was es mit Summe und "Sicher" macht.
      var open = event.target.closest("[data-pay-open]");
      if (open) { openPayEdit(Number(open.dataset.payOpen)); return; }

      var unit = event.target.closest("[data-pay-unit]");
      if (unit && payEdit) {
        payEdit.unit = unit.dataset.payUnit === "factor" ? "factor" : "fp";
        render();
        // Neu hinschreiben: das Feld hat den Fokus, render laesst es darum aus.
        var input = $("rows").querySelector(".pay-in");
        if (input) input.value = payEditValue(payEdit.index, lastPlan.rows[payEdit.index]);
        focusPayInput();
        return;
      }

      if (event.target.closest(".pay-edit-reset") && payEdit) {
        clearSlot(payEdit.index);
        closePayEdit(true);
        return;
      }

      if (event.target.closest(".pay-edit-done")) closePayEdit(true);
    });

    // Beim Tippen mitrechnen, genau wie im Block oben — und genau dadurch
    // wird der Platz eigen.
    $("rows").addEventListener("input", function (event) {
      if (!event.target.classList.contains("pay-in") || !payEdit) return;
      var index = payEdit.index;
      if (payEdit.unit === "fp") {
        var amount = parseAmount(event.target.value);
        if (amount) { setSlotPay(index, amount); render(); }
        return;
      }
      var parsed = parseFactor(event.target.value);
      if (parsed) { setSlotFactor(index, parsed); render(); }
    });

    $("rows").addEventListener("keydown", function (event) {
      if (!event.target.classList.contains("pay-in") || !payEdit) return;
      if (event.key === "Enter" || event.key === "Escape") {
        event.preventDefault();
        closePayEdit(true);
      } else if (payEdit.unit === "factor" && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
        event.preventDefault();
        var index = payEdit.index;
        stepSlotFactor(index, event.key === "ArrowUp" ? 1 : -1);
        event.target.value = formatFactor(effectiveFactors()[index]);
      }
    });

    // Beim Verlassen sauber hinschreiben, was gilt — etwa "3.670" statt "3670".
    $("rows").addEventListener("blur", function (event) {
      if (!event.target.classList.contains("pay-in") || !payEdit || !lastPlan) return;
      event.target.value = payEditValue(payEdit.index, lastPlan.rows[payEdit.index]);
    }, true);

    // Wer mit Tab aus Feld und Zusatzzeile herausgeht, ist fertig. Nur mit
    // der Tastatur: ein Tipp verschiebt den Fokus schon beim Druecken, und
    // dann gilt, was unten zum click steht. Ohne neues Ziel (ein Tipp auf
    // etwas, das keinen Fokus nimmt) entscheidet ohnehin der click.
    var pointerDown = false;
    document.addEventListener("pointerdown", function () { pointerDown = true; }, true);
    ["pointerup", "pointercancel"].forEach(function (type) {
      document.addEventListener(type, function () { pointerDown = false; }, true);
    });
    $("rows").addEventListener("focusout", function (event) {
      if (!payEdit || !event.relatedTarget || pointerDown) return;
      if (!event.relatedTarget.closest("tr.editing, tr.pay-edit")) closePayEdit(false);
    });

    // Ein Tipp irgendwo daneben schliesst das Feld. Auf click, nicht schon
    // auf pointerdown: das Schliessen nimmt die Zusatzzeile weg und alles
    // darunter rueckt hoch — beim Druecken waere dann der Finger beim
    // Loslassen ueber etwas anderem. So wirkt der Tipp erst, dann rueckt es.
    // Wischen zum Scrollen loest kein click aus und laesst das Feld offen.
    document.addEventListener("click", function (event) {
      if (!payEdit) return;
      if (event.target.closest && event.target.closest("tr.editing, tr.pay-edit")) return;
      closePayEdit(false);
    });

    $("rows").addEventListener("change", function (event) {
      var slot = event.target.dataset.slot;
      if (slot != null) {
        cycleSlot(Number(slot));
        // Mit dem ersten vergebenen Platz wird "Schon im Bauwerk" wichtig:
        // ob du vorher gesichert hast, entscheidet die Rechnung.
        if (state.taken[Number(slot)] && state.enabled[Number(slot)]) $("stand").open = true;
        render();
      }
    });

    $("favSave").addEventListener("click", toggleFavorite);

    $("favList").addEventListener("click", function (event) {
      var button = event.target.closest("button");
      if (!button) return;

      if (button.dataset.load != null) {
        var entry = favorites[Number(button.dataset.load)];
        if (!entry) return;
        // Zuletzt benutzt zuerst: der angetippte Eintrag rueckt nach vorn,
        // genau wie ein frisch gemerkter. So steht das Aktive verlaesslich
        // an erster Stelle — vorher stimmte das nur direkt nach dem Merken
        // und brach beim ersten Antippen eines aelteren Eintrags.
        //
        // Absichtlich nur hier und beim Merken, nicht in render(): wer per
        // Stufen-Stepper zufaellig in eine gemerkte Stufe laeuft, hat die
        // Liste nicht angefasst, und dann soll sie sich auch nicht bewegen.
        moveFavoriteToFront(Number(button.dataset.load));
        state.building = entry.id;
        state.level = entry.level;
        render();
        return;
      }

      if (button.dataset.delete != null) {
        favorites.splice(Number(button.dataset.delete), 1);
        write(HERE.favorites, favorites);
        renderFavorites();
      }
    });

    $("note").addEventListener("click", function (event) {
      var key = state.building + ":" + state.level;

      // Der Textknopf der ruhigen Zeile holt das Feld hervor. Ohne render(),
      // sonst waere es im selben Atemzug wieder zugeklappt.
      if (event.target.id === "noteReveal") {
        var fields = $("noteFields");
        if (!fields) return;
        fields.hidden = false;
        event.target.hidden = true;
        if ($("inputP1")) $("inputP1").focus();
        return;
      }

      if (event.target.id === "applyInput") {
        var totalInput = $("inputTotal");
        var p1Input = $("inputP1");
        if (totalInput) {
          var totalValue = Number(totalInput.value);
          if (!(totalValue > 0)) return totalInput.focus();
          ownTotals[key] = totalValue;
        }
        if (p1Input) {
          var p1Value = Number(p1Input.value);
          if (!(p1Value > 0 && p1Value % 5 === 0)) return p1Input.focus();
          ownP1[key] = p1Value;
        }
        write(KEY.totals, ownTotals);
        write(KEY.p1, ownP1);
        render();
      }

      if (event.target.id === "resetInput") {
        delete ownTotals[key];
        delete ownP1[key];
        write(KEY.totals, ownTotals);
        write(KEY.p1, ownP1);
        render();
      }
    });

    $("chatCopy").addEventListener("click", function () {
      if (!state.name.trim()) {
        openSettings($("playerName"), $("chatCopy"));
        return;
      }
      var source = chatSource();
      var text = source.textContent;
      if (!text) return;
      copyToClipboard($("chatCopy"), text, source);
      collect(state.building, text);
    });

    $("chatMode").addEventListener("click", function (event) {
      var button = event.target.closest("[data-chat-mode]");
      if (!button) return;
      state.chatMode = button.dataset.chatMode;
      render();
    });

    $("collCopy").addEventListener("click", function () {
      copyToClipboard($("collCopy"), collectionText(), $("collList"));
    });

    $("collClear").addEventListener("click", function () {
      collection = [];
      write(HERE.collection, collection);
      renderCollection();
    });

    $("collList").addEventListener("click", function (event) {
      var button = event.target.closest("[data-drop]");
      if (!button) return;
      collection.splice(Number(button.dataset.drop), 1);
      write(HERE.collection, collection);
      renderCollection();
    });
  }

  /** Den Faktor um eine Stufe verschieben und das Feld mitziehen. */
  function stepFactor(delta) {
    var next = clampFactor(state.factor + delta);
    if (next === state.factor) { pushedPastLimit(delta); return; }
    if (!next) return;
    state.factor = next;
    $("factor").value = formatFactor(next);
    render();
  }

  /**
   * Den Faktor eines Platzes um eine Stufe verschieben.
   * Das Feld wird von Hand nachgezogen: kam der Anstoss von der Tastatur,
   * steht der Fokus darin und renderSlotFactors laesst es in Ruhe.
   */
  function stepSlotFactor(index, delta) {
    var current = effectiveFactors()[index];
    var next = clampFactor(current + delta);
    if (!next || next === current) return;

    setSlotFactor(index, next);
    var input = $("slotList").querySelector('input[data-slot="' + index + '"]');
    if (input) input.value = formatFactor(next);
    render();
  }

  /**
   * Text in die Zwischenablage legen und den Knopf kurz quittieren.
   * `source` ist der Kasten, dessen Inhalt gemeint ist — ohne
   * Zwischenablage-API bleibt nur, ihn zu markieren.
   */
  function copyToClipboard(button, text, source) {
    if (!text) return;

    var done = function () {
      var label = button.textContent;
      button.textContent = "Kopiert";
      button.classList.add("done");
      window.setTimeout(function () {
        button.textContent = label;
        button.classList.remove("done");
      }, 1400);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { selectFallback(source); done(); });
    } else {
      selectFallback(source);
      done();
    }
  }

  /** Aeltere Browser ohne Zwischenablage-API: Text wenigstens markieren. */
  function selectFallback(element) {
    try {
      var range = document.createRange();
      range.selectNodeContents(element);
      var selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      document.execCommand("copy");
    } catch (error) { /* dann bleibt nur von Hand kopieren */ }
  }

  // -------------------------------------------------------------- Easter Eggs

  /**
   * Kleine Rueckmeldung am unteren Rand. Wird nach der Animation
   * selbst wieder entfernt.
   */
  function toast(message) {
    var existing = document.querySelector(".toast");
    if (existing) existing.remove();

    var element = document.createElement("div");
    element.className = "toast";
    element.setAttribute("role", "status");
    element.textContent = message;
    document.body.appendChild(element);
    window.setTimeout(function () { element.remove(); }, prefersReducedMotion ? 2000 : 2600);
  }

  /*
   * Egg 1 — Freigabe-Stempel.
   * Wenn ein Plan aufgeht, ohne dass du auch nur einen FP vorstrecken musst,
   * und trotzdem etwas zum Selberleveln uebrig bleibt, ist das ein perfekter
   * Zuschnitt. Den quittiert cipher einmal je Besuch mit einem Stempel.
   */
  var stampShown = false;
  function maybeStamp(plan) {
    if (stampShown || prefersReducedMotion) return;

    var offered = plan.rows.filter(function (row) { return row.offered; });
    var perfect = offered.length === Calc.SLOTS &&
      plan.upfront === 0 &&
      plan.remainder > 0 &&
      !plan.anyTooTight;
    if (!perfect) return;

    stampShown = true;
    var stamp = document.createElement("div");
    stamp.className = "stamp";
    stamp.setAttribute("aria-hidden", "true");
    stamp.innerHTML = "Freigegeben<span>ohne Vorleistung</span>";
    document.body.appendChild(stamp);
    window.setTimeout(function () { stamp.remove(); }, 3000);
  }

  /*
   * Egg 2 — Blaupausen-Scan.
   * Der Konami-Code laesst einen Lichtstrahl ueber die Zeichnung laufen.
   */
  var KONAMI = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];
  var konamiProgress = 0;

  function watchKonami() {
    document.addEventListener("keydown", function (event) {
      // In Eingabefeldern hat der Code nichts zu suchen.
      var tag = document.activeElement && document.activeElement.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") { konamiProgress = 0; return; }
      // In der Bauwerksauswahl gehoeren die Pfeiltasten der Liste.
      if (document.activeElement && document.activeElement.closest("dialog")) { konamiProgress = 0; return; }

      var expected = KONAMI[konamiProgress];
      var pressed = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      konamiProgress = pressed === expected ? konamiProgress + 1 : (pressed === KONAMI[0] ? 1 : 0);

      if (konamiProgress === KONAMI.length) {
        konamiProgress = 0;
        runScan();
      }
    });
  }

  function runScan() {
    toast("Blaupause geprüft");
    if (prefersReducedMotion) return;
    var scan = document.createElement("div");
    scan.className = "scan";
    scan.setAttribute("aria-hidden", "true");
    document.body.appendChild(scan);
    window.setTimeout(function () { scan.remove(); }, 1600);
  }

  /*
   * Egg 3 — Plotter.
   * Fuenf Tipps auf die Wortmarke, und cipher zeichnet seinen Namen
   * Buchstabe fuer Buchstabe neu, als liefe ein Plotter darueber.
   */
  var wordmarkTaps = 0;
  var wordmarkTimer = null;

  function watchWordmark() {
    var wordmark = $("wordmark");
    var label = wordmark.textContent;

    wordmark.addEventListener("click", function () {
      wordmarkTaps += 1;
      window.clearTimeout(wordmarkTimer);
      wordmarkTimer = window.setTimeout(function () { wordmarkTaps = 0; }, 1200);

      if (wordmarkTaps < 5) return;
      wordmarkTaps = 0;
      plot(wordmark, label);
    });
  }

  function plot(wordmark, label) {
    if (wordmark.classList.contains("plotting")) return;
    toast("Neu gezeichnet");
    if (prefersReducedMotion) return;

    // Ueber element.style, nicht als style-Attribut im Markup: der CSP kommt
    // ohne 'unsafe-inline' aus, und CSSOM-Zuweisungen zaehlen nicht dazu.
    wordmark.textContent = "";
    label.split("").forEach(function (letter, index) {
      var span = document.createElement("span");
      span.textContent = letter;
      span.style.setProperty("--i", String(index));
      wordmark.appendChild(span);
    });
    wordmark.classList.add("plotting");

    window.setTimeout(function () {
      wordmark.classList.remove("plotting");
      wordmark.textContent = label;
    }, 500 + label.length * 70 + 100);
  }

  /*
   * Egg 4 — Anschlag.
   * Wer beim Arche-Faktor schon an der Grenze steht und trotzdem weiter-
   * drueckt, bekommt eine Antwort. Nur beim Faktor, die Stufe bleibt stumm.
   */
  function pushedPastLimit(delta) {
    toast(delta > 0
      ? "Großzügiger wird’s nicht. Die Arche hat auch ihren Stolz."
      : "Noch knapper, und keiner fördert mehr mit.");
  }

  /*
   * Egg 5 — Suchwoerter.
   * Ein paar Begriffe, die kein Bauwerk treffen, bekommen in der Suche eine
   * eigene Antwort statt "Kein Bauwerk gefunden." Greift nur, wenn es
   * wirklich keinen Treffer gibt.
   */
  var SEARCH_EGGS = {
    osterei: "Kein Bauwerk, aber ein Ei. Gut gesucht!",
    ostereier: "Kein Bauwerk, aber ein Ei. Gut gesucht!",
    easteregg: "Kein Bauwerk, aber ein Ei. Gut gesucht!",
    cipher: "Kein Bauwerk. Nur ich.",
    "42": "Kein Bauwerk, aber die Antwort."
  };

  function searchEgg(query) {
    var key = normalise(query).replace(/[\s\-]/g, "");
    return Object.prototype.hasOwnProperty.call(SEARCH_EGGS, key) ? SEARCH_EGGS[key] : "";
  }

  /*
   * Egg 6 — Gruss in der Konsole.
   * Wer die Entwicklerwerkzeuge oeffnet, findet dort die Wortmarke und den
   * Weg zum Quelltext.
   */
  function greetConsole() {
    if (!window.console || typeof console.log !== "function") return;
    console.log(
      "%c cipher %c\n\nNeugierig? Der ganze Quelltext liegt offen:\n" +
      "https://github.com/iniist/cipher\n\n" +
      "Und hier auf der Seite gibt es noch mehr zu finden.",
      "font: 700 28px/1.4 Georgia, serif; letter-spacing: .12em; color: #d9a441; background: #13233a; padding: 4px 14px",
      "font: 13px/1.5 sans-serif; color: inherit"
    );
  }

  // --------------------------------------------------------- Weltenauswahl

  function renderWorldPick() {
    $("worldName").textContent = world && world.active ? worldById[world.active].name : "Server";
  }

  /**
   * Die Liste hat zwei Stellungen. Gewoehnlich wechselt sie die Welt. Wer
   * bei der ersten Wahl danebengetippt hat, haengt seinen Stand sonst an die
   * falsche Welt — "Umbenennen" gibt ihn der richtigen. Zur Wahl stehen dann
   * nur Welten, die noch nichts gespeichert haben; zwei Staende zu
   * verschmelzen, hiesse einen davon wegzuwerfen.
   */
  var renamingWorld = false;

  function renderWorlds() {
    var active = world && world.active && worldById[world.active];
    $("worldsTitle").textContent = renamingWorld ? "Welt umbenennen" : "Welt wählen";
    $("worldsNote").textContent = renamingWorld
      ? "Zu welcher Welt gehört der Stand von " + active.name + " wirklich? Welten, die schon etwas gespeichert haben, stehen nicht zur Wahl."
      : active
        ? "Jede Welt hat eigene Bauwerke, Faktoren, Favoriten und eine eigene Sammlung. Name, Darstellung und Kürzel gelten überall."
        : world
          ? "Keine Welt gewählt. Du siehst den Stand ohne Welt — den von " + worldById[world.home].name + ". Jede Welt behält, was sie gespeichert hat."
          : "Was du bisher eingestellt und gemerkt hast, gehört dann zu der Welt, die du jetzt wählst.";
    $("worldRename").hidden = !active;
    $("worldLeave").hidden = !active || renamingWorld;
    if (active) {
      $("worldRename").textContent = renamingWorld ? "Doch nicht umbenennen" : "Falsche Welt? " + active.name + " umbenennen";
    }
    $("worldList").innerHTML = WORLDS.map(function (entry) {
      var current = world && world.active === entry.id;
      var used = !current && worldInUse(entry.id);
      var blocked = renamingWorld && (current || used);
      return '<li><button type="button" class="picker-opt world-opt" data-world="' + entry.id + '"' +
        (current ? ' aria-current="true"' : "") + (blocked ? " disabled" : "") + ">" +
        "<b>" + escapeHtml(entry.name) + "</b>" +
        "<span>" + (used ? "genutzt · " : "") + entry.id + "</span></button></li>";
    }).join("");
  }

  function openWorlds() {
    var dialog = $("worlds");
    if (dialog.open) return;
    renamingWorld = false;
    renderWorlds();
    document.documentElement.classList.add("picker-open");
    dialog.showModal();
    $("worldPick").setAttribute("aria-expanded", "true");
    focusWorldList();
  }

  function focusWorldList() {
    var list = $("worldList");
    var target = list.querySelector('[aria-current="true"]:not(:disabled)') ||
      list.querySelector(".world-opt:not(:disabled)");
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: "center" });
  }

  function onWorldsClosed() {
    document.documentElement.classList.remove("picker-open");
    $("worldPick").setAttribute("aria-expanded", "false");
    $("worldPick").focus({ preventScroll: true });
  }

  /**
   * Die erste Wahl benennt nur, was schon da ist — die Daten bleiben, wo
   * sie sind. Jeder spaetere Wechsel laedt die Seite neu: der Start liest
   * dann alles aus den Schluesseln der neuen Welt und prueft es wie immer.
   * Den ganzen Zustand im laufenden Betrieb auszutauschen, waere mehr Code
   * an mehr Stellen, die sich irren koennen.
   */
  function chooseWorld(id) {
    var dialog = $("worlds");
    if (!worldById[id]) return;
    if (!world) {
      world = { home: id, active: id };
      write(WORLD_KEY, world);
      renderWorldPick();
      dialog.close();
      toast("Deine bisherigen Daten gehören jetzt zu " + worldById[id].name + ".");
      return;
    }
    if (id === world.active) { dialog.close(); return; }
    if (!world.active && id === world.home) {
      // Ohne Welt liegen schon die Schluessel der ersten Welt offen.
      world = { home: id, active: id };
      write(WORLD_KEY, world);
      renderWorldPick();
      dialog.close();
      toast("Der Stand gehört wieder zu " + worldById[id].name + ".");
      return;
    }
    persistState();
    write(WORLD_KEY, { home: world.home, active: id });
    window.location.reload();
  }

  /**
   * Die Welt abwaehlen: nur die Zuordnung faellt weg, kein Stand. Wer von
   * der ersten Welt kommt, sieht dieselben Daten wie eben, nur ohne Namen;
   * von jeder anderen geht es wie bei einem Wechsel ueber einen Neustart.
   */
  function leaveWorld() {
    if (!world || !world.active) return;
    var from = worldById[world.active].name;
    persistState();
    write(WORLD_KEY, { home: world.home, active: null });
    if (awayFromHome) { window.location.reload(); return; }
    world = { home: world.home, active: null };
    renderWorldPick();
    $("worlds").close();
    toast(from + " ist abgewählt. Gespeichert bleibt alles.");
  }

  /**
   * Den Stand der offenen Welt einer anderen, noch leeren Welt geben.
   *
   * Die erste Welt liegt unter den alten Schluesseln; fuer sie aendert sich
   * nur der Name in `cipher:world`. Jede andere zieht mit ihren Schluesseln
   * um: erst kopieren, dann die Wahl umstellen, dann das Alte loeschen — so
   * ist in keinem Moment ein Stand nur noch halb da.
   */
  function renameWorld(id) {
    if (!world || !world.active || !worldById[id] || id === world.active || worldInUse(id)) return;
    var from = worldById[world.active].name;
    persistState();

    if (!awayFromHome) {
      world = { home: id, active: id };
      write(WORLD_KEY, world);
      renderWorldPick();
      $("worlds").close();
      toast(from + " heißt jetzt " + worldById[id].name + ".");
      return;
    }

    var oldPrefix = worldPrefix(world.active);
    var moved = [];
    try {
      Object.keys(window.localStorage).forEach(function (key) {
        if (key.indexOf(oldPrefix) !== 0) return;
        window.localStorage.setItem(worldPrefix(id) + key.slice(oldPrefix.length), window.localStorage.getItem(key));
        moved.push(key);
      });
    } catch (error) {
      toast("Umbenennen ging nicht — der Speicher ist gesperrt.");
      return;
    }
    write(WORLD_KEY, { home: world.home, active: id });
    moved.forEach(remove);
    window.location.reload();
  }

  function bindWorlds() {
    var dialog = $("worlds");
    $("worldPick").addEventListener("click", openWorlds);
    $("worldsClose").addEventListener("click", function () { dialog.close(); });
    dialog.addEventListener("close", onWorldsClosed);
    var downOnBackdrop = false;
    dialog.addEventListener("pointerdown", function (event) { downOnBackdrop = event.target === dialog; });
    dialog.addEventListener("click", function (event) {
      if (event.target === dialog && downOnBackdrop) dialog.close();
      downOnBackdrop = false;
    });
    $("worldList").addEventListener("click", function (event) {
      var button = event.target.closest("[data-world]");
      if (!button || button.disabled) return;
      if (renamingWorld) renameWorld(button.dataset.world);
      else chooseWorld(button.dataset.world);
    });
    $("worldLeave").addEventListener("click", leaveWorld);
    $("worldRename").addEventListener("click", function () {
      renamingWorld = !renamingWorld;
      renderWorlds();
      focusWorldList();
    });
  }

  // --------------------------------------------------------------------- Menue

  /**
   * Das Menue haelt, was man einmal einstellt: Name, Darstellung, Kuerzel.
   * Dasselbe Blatt wie die Weltenauswahl; `focus` sagt, wohin der Fokus
   * beim Oeffnen geht — der Hinweis im Foerderchat schickt ihn gleich ins
   * Namensfeld.
   */
  /** Wohin der Fokus nach dem Schliessen zurueckkehrt. */
  var settingsReturn = null;

  function openSettings(focus, returnTo) {
    var dialog = $("settings");
    if (dialog.open) return;
    document.documentElement.classList.add("picker-open");
    // Wer den Namen tippt, hat die Bildschirmtastatur offen; das Blatt
    // rueckt darueber wie bei der Bauwerksauswahl, sonst laege das Feld
    // dahinter.
    watchPickerViewport(true, dialog);
    dialog.showModal();
    $("settingsPick").setAttribute("aria-expanded", "true");
    settingsReturn = returnTo || $("settingsPick");
    (focus || $("settingsClose")).focus({ preventScroll: true });
  }

  function bindSettings() {
    var dialog = $("settings");
    var opener = $("settingsPick");
    opener.addEventListener("click", function () { openSettings(); });
    document.querySelectorAll(".name-go").forEach(function (button) {
      button.addEventListener("click", function () { openSettings($("playerName"), button); });
    });
    $("settingsClose").addEventListener("click", function () { dialog.close(); });
    dialog.addEventListener("close", function () {
      document.documentElement.classList.remove("picker-open");
      watchPickerViewport(false);
      opener.setAttribute("aria-expanded", "false");
      // Zurueck dorthin, wo man herkam. Ist der Hinweis inzwischen weg,
      // weil ein Name drinsteht, gilt der Menueknopf.
      var back = settingsReturn && !settingsReturn.closest("[hidden]") ? settingsReturn : opener;
      back.focus({ preventScroll: true });
    });
    var downOnBackdrop = false;
    dialog.addEventListener("pointerdown", function (event) { downOnBackdrop = event.target === dialog; });
    dialog.addEventListener("click", function (event) {
      if (event.target === dialog && downOnBackdrop) dialog.close();
      downOnBackdrop = false;
    });
    // Enter im Namensfeld heisst "fertig". Ohne preventDefault landete
    // derselbe Tastendruck auf dem Knopf, der den Fokus zurueckbekommt —
    // der Menueknopf oeffnete das Menue gleich wieder, der Kopierknopf
    // kopierte.
    $("playerName").addEventListener("keydown", function (event) {
      if (event.key !== "Enter") return;
      event.preventDefault();
      dialog.close();
    });
  }

  // ------------------------------------------------------------------- Start

  buildBuildingSelect();
  buildFactorChips();
  buildSlotRows();
  // Aufgeklappt, wenn es etwas zu sehen gibt: entweder war der Block zuletzt
  // offen, oder ein Platz hat einen eigenen Wert. Danach gehoert der Zustand
  // dem Browser, das toggle-Ereignis schreibt ihn nur mit.
  $("slots").open = state.slotsOpen || state.slotPays.some(function (own) {
    return own != null;
  }) || state.slotFactors.some(function (own) { return own != null; });
  // Dasselbe fuer "Schon im Bauwerk": offen, wenn zuletzt offen oder wenn
  // ein Stand oder ein vergebener Platz da ist.
  $("stand").open = state.standOpen || state.ownPaid != null || state.foreign.length > 0 ||
    state.taken.some(function (taken, index) { return taken && state.enabled[index]; });
  setTheme(state.theme);
  $("dataDate").textContent = formatDate(DATA.generated);
  bindEvents();
  bindWorlds();
  bindSettings();
  renderWorldPick();
  watchKonami();
  watchWordmark();
  greetConsole();
  renderCollection();
  render();
  if (movedIn) toast("Deine Daten von der alten Adresse sind übernommen.");
})(window, document);
