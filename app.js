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
    p1: "cipher:p1"                  // Selbst eingetragene P1-Belohnungen
  };

  /** Aeltere Schluessel aus dem Vorgaenger, werden einmalig uebernommen. */
  var LEGACY_KEY = { state: "lgr-state", totals: "lgr-t", p1: "lgr-p1" };

  /** Faktoren, die als Schnellwahl angeboten werden. */
  var FACTOR_PRESETS = [180, 185, 190, 192, 195, 200];

  /** Grenzen des Arche-Faktors, als Ganzzahl in Prozent. */
  var FACTOR_MIN = 180;
  var FACTOR_MAX = 200;

  var THEMES = ["light", "dark", "contrast"];
  var DEFAULT_BUILDING = "The_Arc";
  var MAX_FAVORITES = 12;

  /** Quellen, die keinen Hinweis ausloesen — sie gelten als belastbar. */
  var TRUSTED_SOURCES = { table: true, formula: true, manual: true };

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
    // Eigener Faktor je Platz; null heisst "folgt dem Wert oben".
    slotFactors: normaliseSlotFactors(stored.slotFactors),
    slotsOpen: stored.slotsOpen === true
  };

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
      if (!(level >= 1 && level <= byId[entry.id].maxLevel)) return false;
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
      if (normalise(building.name).indexOf(needle) >= 0 ||
          normalise(building.short).indexOf(needle) >= 0) {
        byName.push({ building: building, where: "name" });
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
        "<span>" + (match.where === "era" ? highlight(building.era, needle) : escapeHtml(building.era)) + "</span>" +
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
        "</li>"
      );
    }
    $("slotList").innerHTML = rows.join("");
  }

  /**
   * Die Faktorzeilen auf den Stand bringen.
   *
   * Ein Platz folgt dem Wert oben, bis jemand ihn hier anfasst — danach ist
   * er eigen, traegt das Kreuz zum Zuruecknehmen und bleibt stehen, wenn
   * der obere Wert sich bewegt. Der obere Wert zeigt damit immer etwas
   * Wahres und muss nie ausgegraut werden.
   */
  function renderSlotFactors() {
    var values = effectiveFactors();
    var own = 0;

    $("slotList").querySelectorAll("li").forEach(function (item) {
      var index = Number(item.dataset.slot);
      var pinned = state.slotFactors[index] != null;
      var input = item.querySelector("input");
      if (pinned) own++;

      // Waehrend des Tippens nicht dazwischenfunken.
      if (document.activeElement !== input) input.value = formatFactor(values[index]);
      item.classList.toggle("own", pinned);
      item.querySelector(".slot-reset").hidden = !pinned;
      // Der Zustand steht als Wort da, nicht nur als Farbe: im Kontrastmodus
      // ist Gold schwarz, dort traegt die Faerbung nichts.
      item.querySelector(".slot-state").textContent = pinned ? "eigen" : "folgt";
      item.querySelector('[data-slot-step="-1"]').disabled = values[index] <= FACTOR_MIN;
      item.querySelector('[data-slot-step="1"]').disabled = values[index] >= FACTOR_MAX;
    });

    var low = Math.min.apply(null, values);
    var high = Math.max.apply(null, values);
    $("slotsBadge").hidden = own === 0;
    $("slotsBadge").textContent = low === high
      ? formatFactor(low)
      : formatFactor(low) + "–" + formatFactor(high);
    $("slotsReset").hidden = own === 0;
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
   *
   * @param {object} building Das gewaehlte Bauwerk
   */
  function renderLevelField(building) {
    var offset = levelOffset();

    $("level").value = String(state.level - offset);
    $("level").min = String(1 - offset);
    $("level").max = String(building.maxLevel - offset);
    $("levelDown").disabled = state.level <= 1;
    $("levelUp").disabled = state.level >= building.maxLevel;

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

  var previousContributions = [];

  function render() {
    var building = byId[state.building];
    state.level = Math.min(Math.max(1, Math.floor(state.level) || 1), building.maxLevel);

    $("building").value = building.id;
    renderLevelField(building);
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

    renderSlotFactors();
    syncFavoriteLevel();
    renderFavorites();

    var total = Calc.totalCost(building, state.level, ownTotals);
    var p1 = Calc.p1Reward(building, state.level, DATA.curves, ownP1);
    renderNote(building, total, p1);

    if (total.value == null || p1.value == null) {
      renderEmpty();
      persistState();
      return;
    }

    var plan = Calc.buildPlan({
      total: total.value,
      p1: p1.value,
      factor: state.factor,
      factors: state.slotFactors,
      enabled: state.enabled
    });

    renderRows(plan);
    renderBar(plan);
    renderUpfront(plan);
    renderTotals(plan);
    renderChat(plan, building);

    $("warn").innerHTML = plan.anyTooTight
      ? '<div class="warnline">Auf dieser Stufe reichen die Gesamtkosten nicht für alle Plätze. Nicht passende Plätze sind ausgegraut.</div>'
      : "";

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

    $("rows").innerHTML = plan.rows.map(function (row, index) {
      var changed = previous.length && previous[index] !== row.contribution;
      var secureCell = !row.offered
        ? (row.tooTight ? "passt nicht" : "–")
        : row.secure === 0
          ? '<span class="safe">Sicher</span>'
          : "+" + formatNumber(row.secure);

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

    $("lumpText").innerHTML = plan.remainder > 0
      ? "Damit sind " + range + " sicher, wenn sie der Reihe nach belegt werden. Die letzten <b>" +
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
    var heading = [state.name.trim(), building.short].filter(Boolean).join(" ");
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

  /** Hinweise zu unsicheren Werten und das Eingabefeld fuer eigene Zahlen. */
  function renderNote(building, total, p1) {
    var needTotal = !TRUSTED_SOURCES[total.source];
    var needP1 = !TRUSTED_SOURCES[p1.source];
    var html = "";

    if (needTotal || needP1) {
      var reasons = [];
      if (total.source === null) {
        reasons.push(building.base == null
          ? "Für " + escapeHtml(building.name) + " gibt es noch keine Kostendaten. Nach deinem ersten Eintrag rechne ich die übrigen Stufen hoch."
          : "Gesamtkosten fehlen.");
      }
      if (total.source === "derived") reasons.push("Gesamt ist aus deinem Eintrag auf Stufe " + total.from + " hochgerechnet.");
      if (p1.source === null) reasons.push("P1 ist für diese Stufe noch unbekannt.");
      if (p1.source === "derived") reasons.push("P1 ist auf dieser Stufe geschätzt und kann um 5 FP abweichen.");
      if (p1.source === "conflict") reasons.push("Die Wiki-Angaben für P1 auf dieser Stufe widersprechen sich.");

      html += '<div class="note">' + reasons.join(" ") +
        " Bitte im Förderfenster nachsehen und eintragen, dann ist alles exakt." +
        '<div class="in">' +
          (needTotal ? '<div><label for="inputTotal">Gesamt-FP</label><input id="inputTotal" type="number" inputmode="numeric" min="1" value="' + (total.value == null ? "" : total.value) + '"></div>' : "") +
          (needP1 ? '<div><label for="inputP1">P1-Belohnung</label><input id="inputP1" type="number" inputmode="numeric" min="5" step="5" value="' + (p1.value == null ? "" : p1.value) + '"></div>' : "") +
          '<button type="button" class="go" id="applyInput">Übernehmen</button>' +
        "</div></div>";
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
    $("favSaveText").textContent = chosen.short + " · Stufe " + (state.level - offset) +
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
          escapeHtml(building.short) + " <b>" + shown + "</b>" +
        "</button>" +
        '<button type="button" class="fav-del" data-delete="' + index + '" aria-label="' +
          escapeHtml(building.short + " Stufe " + shown) + ' aus den Favoriten entfernen">×</button>' +
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
        state.slotFactors[Number(reset.dataset.slotReset)] = null;
        render();
      }
    });

    // Beim Tippen mitrechnen, solange etwas Brauchbares dasteht — und genau
    // dadurch wird der Platz eigen.
    $("slotList").addEventListener("input", function (event) {
      if (event.target.tagName !== "INPUT") return;
      var parsed = parseFactor(event.target.value);
      if (parsed) {
        state.slotFactors[Number(event.target.dataset.slot)] = parsed;
        render();
      }
    });

    // blur und focus steigen nicht auf, darum in der Erfassungsphase.
    $("slotList").addEventListener("blur", function (event) {
      if (event.target.tagName !== "INPUT") return;
      var index = Number(event.target.dataset.slot);
      event.target.value = formatFactor(effectiveFactors()[index]);
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
      button.addEventListener("click", function () { copyToClipboard(button); });
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

    state.slotFactors[index] = next;
    var input = $("slotList").querySelector('input[data-slot="' + index + '"]');
    if (input) input.value = formatFactor(next);
    render();
  }

  function copyToClipboard(button) {
    var source = $(button.dataset.copy);
    var text = source.textContent;
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
  $("slots").open = state.slotsOpen ||
    state.slotFactors.some(function (own) { return own != null; });
  setTheme(state.theme);
  $("dataDate").textContent = formatDate(DATA.generated);
  bindEvents();
  watchKonami();
  watchWordmark();
  render();
})(window, document);
