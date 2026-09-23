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

  var THEMES = ["light", "dark", "contrast"];
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
   * Quellen, deren P1 danebenliegen kann — und zwar nur nach oben: von fuenf
   * im Spiel abgelesenen Werten lagen zwei genau 5 FP unter der Rechnung,
   * keiner darueber. Ein zu hohes P1 ist die gefaehrliche Richtung, weil die
   * Absicherung dann zu niedrig ausfaellt. Darum rechnet sie bei diesen
   * Quellen mit P1 minus P1_SLACK; angezeigt wird weiter das echte P1.
   */
  var UNSURE_P1_SOURCES = { derived: true, conflict: true };
  var P1_SLACK = 5;

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

  // ------------------------------------------------------------------ Zustand

  migrateLegacyStorage();

  var byId = {};
  DATA.buildings.forEach(function (building) { byId[building.id] = building; });

  var stored = read(KEY.state, {});
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
    theme: THEMES.indexOf(stored.theme) >= 0 ? stored.theme : "dark",
    // Wie die Zahl im Stufenfeld zu lesen ist. "next" ist die Vorgabe und
    // das, was cipher vorher ohne Wahl getan hat.
    levelMode: stored.levelMode === "current" ? "current" : "next",
    // Wie die Spalte "Vorher sichern" zu lesen ist: als Schritt je Platz
    // oder als laufende Summe. "step" ist die Vorgabe.
    secureMode: stored.secureMode === "total" ? "total" : "step",
    // Eigener Faktor je Platz; null heisst "folgt dem Wert oben".
    slotFactors: normaliseSlotFactors(stored.slotFactors),
    // Getippter Betrag je Platz; null heisst "aus dem Faktor gerechnet".
    slotPays: normaliseSlotPays(stored.slotPays),
    // In welcher Einheit die Zeilen des Blocks gelesen und getippt werden.
    slotUnit: stored.slotUnit === "fp" ? "fp" : "factor",
    slotsOpen: stored.slotsOpen === true
  };

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
   * In welcher Einheit eine Zeile gelesen wird.
   *
   * Ein eingestellter Platz behaelt die Einheit, in der er eingestellt
   * wurde — sonst muesste ein Betrag beim Umschalten in einen Faktor
   * uebersetzt werden, und 10.000 FP auf eine Belohnung von 3.200 ergeben
   * 3,13: ausserhalb des zulaessigen Bereichs, also nicht darstellbar.
   * Wer folgt, zeigt die Einheit des Blocks.
   * @returns {"factor"|"fp"}
   */
  function slotUnitFor(index) {
    if (state.slotPays[index] != null) return "fp";
    if (state.slotFactors[index] != null) return "factor";
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

  var ownTotals = read(KEY.totals, {});
  var ownP1 = read(KEY.p1, {});
  var favorites = normaliseFavorites(read(KEY.favorites, []));

  /**
   * Die gesammelten Chat-Zeilen, in der Reihenfolge, in der sie gesammelt
   * wurden — das ist die Reihenfolge, in der sie spaeter im Chat stehen.
   */
  var collection = normaliseCollection(read(KEY.collection, []));

  /**
   * Selbst vergebene Kuerzel, nach Bauwerk-Schluessel.
   *
   * Der Datensatz bringt fuer jedes Bauwerk ein `short` mit, von Hand
   * gepflegt und unstrittig verkuerzt ("Leuchtturm von Alexandria" ->
   * "Leuchtturm"). Was eine Gilde daraus macht, ist es nicht: "AO" fuer die
   * Arktische Orangerie versteht die eine Runde sofort und die naechste gar
   * nicht. Darum steht das hier und nicht in data.js — und weil es am
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

  /**
   * Wie ein Bauwerk genannt wird — ueberall, wo cipher es kurz nennt: in der
   * Chat-Zeile, in der Sammlung, am Merken-Knopf, auf den Favoriten-Chips
   * und in der Suche. Ein eigenes Kuerzel gilt, sonst das aus dem Datensatz.
   */
  function shortName(building) {
    return ownShorts[building.id] || building.short;
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
      return { id: String(entry.id), text: entry.text };
    });
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

  function persistState() {
    var next = JSON.stringify(state);
    if (next === lastPersisted) return;
    write(KEY.state, state);
    lastPersisted = next;
  }

  // -------------------------------------------------------------------- Theme

  function setTheme(theme) {
    if (THEMES.indexOf(theme) < 0) return;
    state.theme = theme;
    document.documentElement.dataset.theme = theme;
    document.querySelectorAll(".modes button").forEach(function (button) {
      button.setAttribute("aria-pressed", String(button.dataset.mode === theme));
    });
    persistState();
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
  function currentMatches() {
    var needle = normalise($("buildingFilter").value).trim();
    if (!needle) return [];

    var byName = [];
    var byEra = [];
    DATA.buildings.forEach(function (building) {
      if (normalise(building.name).indexOf(needle) >= 0) {
        byName.push({ building: building, where: "name" });
      } else if (normalise(shortName(building)).indexOf(needle) >= 0) {
        // Ein Kuerzel aus dem Datensatz steckt immer im Namen ("Orangerie"
        // in "Arktische Orangerie"), ein selbst vergebenes muss das nicht:
        // "AO" kommt dort nirgends vor. Der Treffer bleibt bei den
        // Namenstreffern, bekommt aber eine eigene Kennung, damit die Liste
        // ihn erklaeren kann.
        byName.push({ building: building, where: "short" });
      } else if (normalise(building.era).indexOf(needle) >= 0) {
        byEra.push({ building: building, where: "era" });
      }
    });
    return byName.concat(byEra);
  }

  function renderFilter() {
    var query = $("buildingFilter").value;
    var matches = currentMatches();

    $("filterClear").hidden = !query;
    $("filterCount").textContent = !query.trim()
      ? ""
      : matches.length === 0
        ? "Kein Bauwerk gefunden."
        : matches.length === 1
          ? "1 Bauwerk gefunden."
          : matches.length + " Bauwerke gefunden.";

    var needle = normalise(query).trim();
    $("filterResults").innerHTML = matches.map(function (match) {
      var building = match.building;
      return '<li><button type="button" class="filter-hit" data-pick="' + escapeHtml(building.id) + '"' +
        (building.id === state.building ? ' aria-current="true"' : "") + ">" +
        "<b>" + (match.where === "name" ? highlight(building.name, needle) : escapeHtml(building.name)) + "</b>" +
        "<span>" + (match.where === "era" ? highlight(building.era, needle) : escapeHtml(building.era)) +
          // Getroffen hat das Kuerzel, im Namen steht es nicht — dann nennt
          // die Zeile es, sonst stuende der Treffer ohne Begruendung da.
          (match.where === "short" ? " · " + highlight(shortName(building), needle) : "") +
        "</span>" +
      "</button></li>";
    }).join("");
  }

  /** Ein Bauwerk aus der Trefferliste uebernehmen und die Suche schliessen. */
  function pickBuilding(id) {
    if (!byId[id]) return;
    state.building = id;
    adoptFavoriteLevel();
    clearBuildingFilter({ keepFocus: false });
    render();
  }

  function clearBuildingFilter(options) {
    $("buildingFilter").value = "";
    renderFilter();
    if (!options || options.keepFocus !== false) $("buildingFilter").focus();
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
      item.querySelector(".slot-state").textContent = pinned ? "eigen" : "folgt";
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
    var andere = unit === "fp"
      ? (row.reward > 0 ? "Faktor " + formatFactor(impliedFactor(row)) : "")
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
      $("slotsBadge").textContent = own + (own === 1 ? " eigen" : " eigene");
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
    input.placeholder = building.short;

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
    renderLevelField();
    // Waehrend des Tippens nicht dazwischenfunken.
    if (document.activeElement !== $("factor")) $("factor").value = formatFactor(state.factor);
    $("factorGauge").style.width =
      ((state.factor - FACTOR_MIN) / (FACTOR_MAX - FACTOR_MIN) * 100) + "%";
    $("factorDown").disabled = state.factor <= FACTOR_MIN;
    $("factorUp").disabled = state.factor >= FACTOR_MAX;
    document.querySelectorAll("#factorChips button").forEach(function (chip) {
      chip.classList.toggle("on", Number(chip.dataset.factor) === state.factor);
    });
    if (document.activeElement !== $("playerName")) $("playerName").value = state.name;
    renderShortField(building);

    syncFavoriteLevel();
    renderFavorites();

    var total = Calc.totalCost(building, state.level, ownTotals);
    var p1 = Calc.p1Reward(building, state.level, DATA.curves, ownP1);
    renderNote(building, total, p1);

    if (total.value == null || p1.value == null) {
      lastPlan = null;
      renderEmpty();
      renderSlots(null);
      persistState();
      return;
    }

    var plan = Calc.buildPlan({
      total: total.value,
      p1: p1.value,
      p1Secure: UNSURE_P1_SOURCES[p1.source] ? p1.value - P1_SLACK : null,
      factor: state.factor,
      factors: state.slotFactors,
      payments: state.slotPays,
      enabled: state.enabled
    });

    lastPlan = plan;
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
      warnings.push("Ein Platz kostet mehr als ein besser bezahlter über ihm. Prüf die eingetragenen Beträge — so vergibt das Spiel die Plätze nicht.");
    }
    $("warn").innerHTML = warnings.map(function (text) {
      return '<div class="warnline">' + escapeHtml(text) + "</div>";
    }).join("");

    maybeStamp(plan);
    persistState();
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
  }

  function renderRows(plan) {
    $("rows").closest("table").classList.remove("none");

    // Die Tabelle wird komplett neu geschrieben. Stand der Fokus auf einer
    // der Checkboxen, landet er dabei sonst auf <body> — wer zwei Plaetze
    // mit der Tastatur abwaehlen will, muesste sich nach jedem Haekchen neu
    // durch die Seite tabben. Also merken und danach zurueckgeben.
    var focusedSlot = focusedSlotInRows();

    var previous = previousContributions;
    previousContributions = plan.rows.map(function (row) { return row.contribution; });

    renderSecureHead();
    var running = 0;

    $("rows").innerHTML = plan.rows.map(function (row, index) {
      var changed = previous.length && previous[index] !== row.contribution;
      if (row.offered) running += row.secure;
      var secureCell = secureText(row, running);

      return '<tr class="' + (row.offered ? "" : "off") + '">' +
        '<td><label class="pl">' +
          '<input type="checkbox" data-slot="' + index + '"' +
            (state.enabled[index] ? " checked" : "") +
            (row.reward > 0 ? "" : " disabled") +
            ' aria-label="Platz P' + row.slot + ' anbieten">' +
          '<span class="tag slot-' + row.slot + '">P' + row.slot + "</span>" +
        "</label></td>" +
        "<td>" + formatNumber(row.reward) + "</td>" +
        '<td class="pay' + (changed ? " chg" : "") + '">' + formatNumber(row.contribution) + "</td>" +
        '<td class="pre">' + secureCell + "</td>" +
      "</tr>";
    }).join("");

    restoreFocusToSlot(focusedSlot);
  }

  /**
   * Was in der Spalte "Vorher sichern" steht.
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
    if (!row.offered) return row.tooTight ? "passt nicht" : "–";
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
    $("secureModeLabel").textContent = total ? "Vorher zusammen" : "Vorher sichern";
    $("secureMode").setAttribute("aria-label", total
      ? "Vorher zusammen — umschalten auf den Schritt je Platz"
      : "Vorher sichern — umschalten auf die laufende Summe");
  }

  /** Den Platz nennen, dessen Checkbox gerade den Fokus hat — sonst null. */
  function focusedSlotInRows() {
    var active = document.activeElement;
    if (!active || !active.dataset || active.dataset.slot == null) return null;
    return $("rows").contains(active) ? active.dataset.slot : null;
  }

  function restoreFocusToSlot(slot) {
    if (slot == null) return;
    var checkbox = $("rows").querySelector('input[data-slot="' + slot + '"]');
    // Die Zeile steht an derselben Stelle, darum kein Springen der Ansicht.
    if (checkbox && !checkbox.disabled) checkbox.focus({ preventScroll: true });
  }

  function renderBar(plan) {
    var bar = $("bar");
    bar.hidden = false;
    $("legend").hidden = false;

    var segments = [["own", plan.ownShare]].concat(plan.rows.map(function (row) {
      return [String(row.slot), row.offered ? row.contribution : 0];
    }));

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

    countTo($("lumpValue"), plan.upfront);

    var labels = offered.map(function (row) { return "P" + row.slot; });
    var range = labels.length > 1 ? labels[0] + " bis " + labels[labels.length - 1] : labels[0];

    // Die Summe ist die Summe aller Vorleistungen, nicht eine Einzahlung:
    // wer sie auf einen Schlag einzahlt und wartet, hat die hinteren
    // Plaetze fuer kleines Geld offen stehen. Der Fliesstext sagt das mit
    // "der Reihe nach"; die grosse Zahl daneben liest sich trotzdem wie
    // eine Aufforderung. Ein Halbsatz genuegt — das Risiko ist bekannt.
    $("lumpText").innerHTML = plan.remainder > 0
      ? "Damit sind " + range + " sicher, wenn sie der Reihe nach belegt werden; einzahlen also Platz für Platz, " +
        "nicht die ganze Summe vorweg. Die letzten <b>" +
        formatNumber(plan.remainder) + " FP</b> zahlst du danach selbst ein und levelst damit."
      : "Achtung: Auf dieser Stufe schließt " + labels[labels.length - 1] +
        " die Stufe ab, du kannst nicht selbst leveln.";
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

  /**
   * Eine Chat-Zeile setzen und den zugehoerigen Knopf mitschalten. Ein
   * aktiver Knopf ueber einem leeren Kasten sieht bedienbar aus, tut aber
   * nichts — das ist keine gute Rueckmeldung.
   */
  function setChatLine(id, text) {
    $(id).textContent = text;
    var button = document.querySelector('[data-copy="' + id + '"]');
    if (button) button.disabled = !text;
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
   * "Sammeln" muesste sie ein zweites Mal stellen. Der Kopierknopf hat sie
   * schon beantwortet, also nimmt die Sammlung genau die Zeile, die auch
   * in der Zwischenablage landet.
   */

  /** Die Zeile eines Bauwerks in die Sammlung legen. */
  function collect(id, text) {
    if (!text) return;

    // Je Bauwerk eine Zeile: wer nach einer Korrektur erneut kopiert,
    // meint dieselbe Foerderung noch einmal, nicht eine zweite. Die neue
    // Zeile ersetzt die alte an deren Platz, damit die Reihenfolge der
    // Sammlung die Reihenfolge des Sammelns bleibt.
    var at = collectionIndex(id);
    if (at >= 0) collection[at] = { id: id, text: text };
    else collection.push({ id: id, text: text });

    if (collection.length > MAX_COLLECTED) collection.shift();

    write(KEY.collection, collection);
    renderCollection(at >= 0 ? at : collection.length - 1);
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
    write(KEY.favorites, favorites);
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
          escapeHtml(shortName(building)) + " <b>" + shown + "</b>" +
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
    write(KEY.favorites, favorites);
  }

  function toggleFavorite() {
    var index = favoriteIndex(state.building);
    if (index >= 0) {
      favorites.splice(index, 1);
    } else {
      if (favorites.length >= MAX_FAVORITES) favorites.pop();
      favorites.unshift({ id: state.building, level: state.level });
    }
    write(KEY.favorites, favorites);
    renderFavorites();
  }

  // --------------------------------------------------------------- Ereignisse

  function bindEvents() {
    document.querySelector(".modes").addEventListener("click", function (event) {
      var button = event.target.closest("button");
      if (button) setTheme(button.dataset.mode);
    });

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
    // welcher Einheit die folgenden Zeilen dastehen und was beim Tippen
    // gemeint ist. Eingestellte Plaetze behalten ihre eigene Einheit.
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
      if (event.target.closest("td.pre")) toggleSecureMode();
    });

    $("rows").addEventListener("change", function (event) {
      var slot = event.target.dataset.slot;
      if (slot != null) {
        state.enabled[Number(slot)] = event.target.checked;
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
        write(KEY.favorites, favorites);
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

    document.querySelectorAll("[data-copy]").forEach(function (button) {
      button.addEventListener("click", function () {
        var source = $(button.dataset.copy);
        var text = source.textContent;
        copyToClipboard(button, text, source);
        collect(state.building, text);
      });
    });

    $("collCopy").addEventListener("click", function () {
      copyToClipboard($("collCopy"), collectionText(), $("collList"));
    });

    $("collClear").addEventListener("click", function () {
      collection = [];
      write(KEY.collection, collection);
      renderCollection();
    });

    $("collList").addEventListener("click", function (event) {
      var button = event.target.closest("[data-drop]");
      if (!button) return;
      collection.splice(Number(button.dataset.drop), 1);
      write(KEY.collection, collection);
      renderCollection();
    });
  }

  /** Den Faktor um eine Stufe verschieben und das Feld mitziehen. */
  function stepFactor(delta) {
    var next = clampFactor(state.factor + delta);
    if (!next || next === state.factor) return;
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
  setTheme(state.theme);
  $("dataDate").textContent = formatDate(DATA.generated);
  bindEvents();
  watchKonami();
  watchWordmark();
  renderCollection();
  render();
})(window, document);
