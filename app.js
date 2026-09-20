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

  /** Farbe je Maezen-Platz, in der Reihenfolge P1..P5. */
  var SLOT_COLORS = ["var(--gold)", "var(--silver)", "var(--bronze)", "var(--iron)", "var(--iron)"];

  /** Faktoren, die als Schnellwahl angeboten werden. */
  var FACTOR_PRESETS = [185, 190, 192, 195, 200];

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

  /** Faktor als Dezimalzahl, z. B. 190 -> "1,90". */
  function formatFactor(factor) { return (factor / 100).toFixed(2).replace(".", ","); }

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
    factor: Number(stored.factor) >= 185 && Number(stored.factor) <= 200 ? Math.floor(stored.factor) : 190,
    name: typeof stored.name === "string" ? stored.name : "",
    enabled: normaliseEnabled(stored.enabled),
    theme: THEMES.indexOf(stored.theme) >= 0 ? stored.theme : "dark"
  };

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

  /** Nur Eintraege behalten, deren Bauwerk es noch gibt und deren Stufe passt. */
  function normaliseFavorites(value) {
    if (!Array.isArray(value)) return [];
    var seen = {};
    return value.filter(function (entry) {
      if (!entry || !byId[entry.id]) return false;
      var level = Number(entry.level);
      if (!(level >= 1 && level <= byId[entry.id].maxLevel)) return false;
      var key = entry.id + ":" + level;
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    }).slice(0, MAX_FAVORITES).map(function (entry) {
      return { id: entry.id, level: Math.floor(Number(entry.level)) };
    });
  }

  function persistState() {
    write(KEY.state, state);
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
    clearBuildingFilter({ keepFocus: false });
    render();
  }

  function clearBuildingFilter(options) {
    $("buildingFilter").value = "";
    renderFilter();
    if (!options || options.keepFocus !== false) $("buildingFilter").focus();
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

  var previousContributions = [];

  function render() {
    var building = byId[state.building];
    state.level = Math.min(Math.max(1, Math.floor(state.level) || 1), building.maxLevel);

    $("building").value = building.id;
    $("level").value = String(state.level);
    $("level").max = String(building.maxLevel);
    $("factor").value = String(state.factor);
    $("factorValue").textContent = formatFactor(state.factor);
    document.querySelectorAll("#factorChips button").forEach(function (chip) {
      chip.classList.toggle("on", Number(chip.dataset.factor) === state.factor);
    });
    if (document.activeElement !== $("playerName")) $("playerName").value = state.name;

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
          '<span class="tag" style="--c:' + SLOT_COLORS[index] + '">P' + row.slot + "</span>" +
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
        return '<i class="b-' + segment[0] + '" style="width:0"></i>';
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

  function favoriteIndex(id, level) {
    for (var i = 0; i < favorites.length; i++) {
      if (favorites[i].id === id && favorites[i].level === level) return i;
    }
    return -1;
  }

  function renderFavorites() {
    var current = favoriteIndex(state.building, state.level);
    var saveButton = $("favSave");
    saveButton.setAttribute("aria-pressed", String(current >= 0));
    $("favSaveText").textContent = current >= 0 ? "Gemerkt" : "Merken";
    saveButton.title = current >= 0
      ? "Diese Kombination aus den Favoriten entfernen"
      : "Bauwerk und Stufe als Favorit merken";

    $("favList").innerHTML = favorites.map(function (entry, index) {
      var building = byId[entry.id];
      return '<li' + (index === current ? ' aria-current="true"' : "") + ">" +
        '<button type="button" class="fav-go" data-load="' + index + '">' +
          escapeHtml(building.short) + " <b>" + entry.level + "</b>" +
        "</button>" +
        '<button type="button" class="fav-del" data-delete="' + index + '" aria-label="' +
          escapeHtml(building.short + " Stufe " + entry.level) + ' aus den Favoriten entfernen">×</button>' +
      "</li>";
    }).join("");

    $("favEmpty").hidden = favorites.length > 0;
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

  function toggleFavorite() {
    var index = favoriteIndex(state.building, state.level);
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
      render();
    });

    $("level").addEventListener("change", function (event) {
      state.level = Number(event.target.value);
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

    $("factor").addEventListener("input", function (event) {
      state.factor = Number(event.target.value);
      render();
    });

    $("factorChips").addEventListener("click", function (event) {
      var factor = event.target.dataset.factor;
      if (factor) { state.factor = Number(factor); render(); }
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

    wordmark.innerHTML = label.split("").map(function (letter, index) {
      return '<span style="--i:' + index + '">' + escapeHtml(letter) + "</span>";
    }).join("");
    wordmark.classList.add("plotting");

    window.setTimeout(function () {
      wordmark.classList.remove("plotting");
      wordmark.textContent = label;
    }, 500 + label.length * 70 + 100);
  }

  // ------------------------------------------------------------------- Start

  buildBuildingSelect();
  buildFactorChips();
  setTheme(state.theme);
  $("dataDate").textContent = new Date(DATA.generated).toLocaleDateString("de-DE");
  bindEvents();
  watchKonami();
  watchWordmark();
  render();
})(window, document);
