/*!
 * cipher — Arche-Sniper: lohnt sich ein Platz in einem fremden Bauwerk?
 *
 * Schritte: A eigene Arche (gemerkt, klappt zu), B Ziel, C fremde Plaetze,
 * D Platz waehlen mit Balken, Griff und Feinschritten. Rechnen tut calc.js
 * (snipePlaces, snipeDeposit, estimateBlueprints); Kosten und Arche-Bonus
 * kommen aus kosten.js.
 *
 * Gemerkt wird: Bauwerk und Arche-Stufe dauerhaft (localStorage,
 * cipher:snipe), das aktuelle Ziel nur fuer diesen Tab (sessionStorage,
 * cipher:snipe:ziel) — damit nichts verloren geht, wenn man kurz ins Spiel
 * wechselt und der Browser den Tab neu laedt.
 */
(function (window, document) {
  "use strict";

  var Calc = window.CipherCalc;
  var DATA = window.CIPHER_DATA;
  var COSTS = window.CIPHER_COSTS;
  var STORE = "cipher:snipe";
  var SESSION = "cipher:snipe:ziel";
  var NBSP = " ";

  var $ = function (id) { return document.getElementById(id); };
  var fmt = new Intl.NumberFormat("de-DE");
  var f = function (value) { return fmt.format(value); };
  var signed = function (value) { return (value > 0 ? "+" : value < 0 ? "−" : "±") + f(Math.abs(value)); };
  var percent = function (value) { return value + NBSP + "%"; };

  /** Was gerade gerechnet ist; render() fuellt es, aim() liest es. */
  var view = { options: null, rows: [], slot: 0, gold: false, level: 0, ready: false };
  /** Gewaehlter Platz, Einsatz, Blaupausen; null = cipher waehlt. */
  var choice = { slot: null, pay: null, bp: null };

  /** Ziffern aus einer Eingabe; "34.456" und "34456" sind dasselbe. */
  function number(input) {
    var digits = String(input.value || "").replace(/\D/g, "");
    return digits ? Number(digits) : null;
  }

  /* ------------------------------------------------------------ Speicher */

  function read(storage, key) {
    try { return JSON.parse(window[storage].getItem(key)) || {}; } catch (error) { return {}; }
  }
  function write(storage, key, value) {
    try {
      if (value == null) window[storage].removeItem(key);
      else window[storage].setItem(key, JSON.stringify(value));
    } catch (error) { /* privat surfen: dann eben nicht merken */ }
  }
  function saveLasting() {
    write("localStorage", STORE, { building: $("snBuilding").value, arc: number($("snArc")) });
  }
  function saveSession() {
    write("sessionStorage", SESSION, {
      building: $("snBuilding").value,
      level: $("snLevel").value, progress: $("snProgress").value, total: $("snTotal").value,
      taken: Array.prototype.map.call($("snTaken").querySelectorAll("input"), function (input) { return input.value; }),
      slot: choice.slot
    });
  }

  /* ----------------------------------------------------------- A: Arche */

  function arcBonus(gold) {
    var arc = number($("snArc"));
    if (!arc || !COSTS || !COSTS.arcBonus) return 0;
    var list = gold ? COSTS.arcBonus.gold : COSTS.arcBonus.copper;
    return list[Math.min(arc, list.length) - 1] || 0;
  }

  function showArc(open) {
    var arc = number($("snArc"));
    $("arcForm").hidden = !open;
    $("arcSummary").hidden = open;
    if (open) return;
    $("arcSummary").textContent = "";
    var text = document.createElement("strong");
    text.textContent = arc ? "Arche" + NBSP + arc + " · Kupfer" + NBSP + percent(arcBonus(false)) + " · Gold" + NBSP + percent(arcBonus(true))
      : "Keine Arche";
    var edit = document.createElement("span");
    edit.textContent = "ändern";
    $("arcSummary").appendChild(text);
    $("arcSummary").appendChild(edit);
  }

  /* ------------------------------------------------------- B und C: Ziel */

  function buildingId() { return $("snBuilding").value; }

  function tableCost(id, level) {
    var list = COSTS && COSTS.costs[id];
    return list && level >= 1 && level <= list.length ? list[level - 1] : null;
  }

  function fillTotal() {
    var cost = tableCost(buildingId(), number($("snLevel")));
    $("snTotal").value = cost ? f(cost) : "";
  }

  function slotCount() {
    var level = number($("snLevel"));
    return level && Calc.isGold(buildingId(), level) ? 7 : 5;
  }

  function buildTaken(values) {
    var box = $("snTaken");
    var count = slotCount();
    var old = values || Array.prototype.map.call(box.querySelectorAll("input"), function (input) { return input.value; });
    if (!values && old.length === count) return;
    box.textContent = "";
    for (var slot = 1; slot <= count; slot++) {
      var label = document.createElement("label");
      label.textContent = "P" + slot;
      var input = document.createElement("input");
      input.id = "snP" + slot;
      input.className = "num";
      input.inputMode = "numeric";
      input.autocomplete = "off";
      input.setAttribute("enterkeyhint", slot < count ? "next" : "done");
      input.setAttribute("aria-label", "P" + slot + ", Betrag in FP");
      input.value = old[slot - 1] || "";
      label.appendChild(input);
      box.appendChild(label);
    }
  }

  function takenAmounts() {
    return Array.prototype.map.call($("snTaken").querySelectorAll("input"), number)
      .filter(function (value) { return value; });
  }

  /* ------------------------------------------------------ D: Platz waehlen */

  var STATUS = {
    lohnt: { word: "lohnt", mark: "✓" },
    riskant: { word: "riskant", mark: "!" },
    teuer: { word: "zu teuer", mark: "×" },
    zu: { word: "nicht drin", mark: "–" }
  };

  /** Der lohnendste Platz: hoechster Gewinn bzw. kleinster Verlust, wenn man ihn sichert. */
  function bestSlot(rows) {
    var usable = rows.filter(function (row) { return row.status !== "leer" && row.status !== "zu"; });
    if (!usable.length) return 0;
    return usable.reduce(function (best, row) { return row.profit > best.profit ? row : best; }).slot;
  }

  /** Sinnvoller Einsatz fuer einen Platz: sicher, wenn es sich lohnt, sonst ohne Verlust. */
  function defaultPay(row, open) {
    if (row.status === "lohnt") return row.safe;
    if (row.status === "riskant") return row.pay;
    if (row.status === "teuer") return Math.min(row.safe, open);
    return open;
  }

  function advice(rows) {
    var best = rows[bestSlot(rows) - 1];
    if (!best) return "Hier ist gerade kein Platz zu holen — es ist zu wenig offen.";
    if (best.status === "lohnt") {
      return "Nimm P" + best.slot + ": " + f(best.safe) + " FP einzahlen, sicher, " + signed(best.profit) + " FP.";
    }
    var risky = rows.filter(function (row) { return row.status === "riskant"; });
    return "Kein Platz lohnt sich sicher. Am wenigsten Verlust: P" + best.slot + " sicher für " + signed(best.profit) + " FP" +
      (risky.length ? " — oder ohne Verlust auf Risiko." : ".");
  }

  /** Marke auf den Balken, Wert in die Legende; die Legende ordnet sich nach Wert. */
  function place(key, value, open) {
    var mark = $({ take: "mTake", value: "mValue", safe: "mSafe" }[key]);
    var label = $({ take: "lTake", value: "lValue", safe: "lSafe" }[key]);
    var reachable = value > 0 && value <= open;
    label.textContent = reachable ? f(value) : f(value) + " (mehr als offen)";
    label.parentNode.disabled = !reachable;
    label.parentNode.style.order = String(value);
    if (!reachable) { mark.classList.add("out"); return; }
    mark.classList.remove("out");
    mark.style.left = (value / open * 100) + "%";
  }

  function renderChips() {
    var box = $("snChips");
    var focused = document.activeElement && document.activeElement.parentNode === box
      ? document.activeElement.dataset.slot : null;
    box.textContent = "";
    view.rows.forEach(function (row) {
      if (row.status === "leer") return;
      var status = STATUS[row.status];
      var button = document.createElement("button");
      button.type = "button";
      button.className = row.status;
      button.dataset.slot = row.slot;
      button.setAttribute("aria-pressed", String(row.slot === view.slot));
      button.setAttribute("aria-label", "P" + row.slot + ", " + status.word);
      var name = document.createElement("b");
      name.textContent = "P" + row.slot;
      var word = document.createElement("small");
      word.textContent = status.mark + " " + status.word;
      button.appendChild(name);
      button.appendChild(word);
      box.appendChild(button);
    });
    if (focused) {
      var again = box.querySelector('[data-slot="' + focused + '"]');
      if (again) again.focus();
    }
  }

  function renderRows() {
    var list = $("snRows");
    list.textContent = "";
    view.rows.forEach(function (row) {
      if (row.status === "leer") return;
      var item = document.createElement("li");
      item.className = row.status;
      item.dataset.slot = row.slot;
      var head = document.createElement("h3");
      head.textContent = "P" + row.slot + " ";
      var span = document.createElement("span");
      span.textContent = f(row.reward) + " + " + f(row.extra) + " Bonus = " + f(row.value) + " FP";
      head.appendChild(span);
      var limits = document.createElement("p");
      limits.className = "limits";
      limits.textContent = "Platz ab " + f(row.take) + " · ohne Verlust bis " + f(row.value) + " · sicher ab " + f(row.safe);
      var verdict = document.createElement("p");
      verdict.className = "verdict";
      verdict.textContent = row.status === "lohnt" ? "Lohnt sich: Sicherst du ihn, machst du " + signed(row.profit) + " FP."
        : row.status === "riskant" ? "Riskant: Ohne Verlust bekommst du ihn nur angreifbar. Sicherst du ihn, machst du " + signed(row.profit) + " FP."
        : row.status === "teuer" ? "Zu teuer: Sicherst du ihn, machst du " + signed(row.profit) + " FP."
        : "Nicht drin: Es ist zu wenig offen.";
      item.appendChild(head);
      item.appendChild(limits);
      item.appendChild(verdict);
      list.appendChild(item);
    });
  }

  var announceTimer = null;
  /** Fuer Screenreader: nur das Wichtigste, und erst, wenn der Griff ruht. */
  function announce(text) {
    window.clearTimeout(announceTimer);
    announceTimer = window.setTimeout(function () { $("snAnnounce").textContent = text; }, 600);
  }

  /** Balken, Anzeige, Leiste und Blaupausen fuer den Einsatz zeichnen. */
  function aim() {
    var options = view.options;
    var open = options.open;
    var result = Calc.snipeDeposit(options, choice.pay);
    var rankRow = result.rank ? view.rows[result.rank - 1] : null;

    var state = !result.rank ? "kein" : result.safe ? "sicher" : "angreifbar";
    $("snFill").style.width = (open ? result.pay / open * 100 : 0) + "%";
    $("snFill").className = "fill " + state;
    $("snReadout").className = "readout " + state;

    var range = $("snPay");
    range.value = result.pay;
    if (document.activeElement !== $("snPayNum")) $("snPayNum").value = f(result.pay);

    var statusText = !result.rank ? "Kein Platz"
      : "P" + result.rank + (result.safe ? (result.profit < 0 ? " · sicher, aber mit Verlust" : " · sicher") : " · angreifbar");
    $("snStatus").className = "status " + state;
    $("snStatus").textContent = statusText;

    $("snProfit").textContent = result.rank ? signed(result.profit) + " FP" : "";
    $("snProfit").className = "profit" + (result.rank && result.profit < 0 ? " minus" : "");
    $("snDetail").textContent = !result.rank
      ? (result.pay ? "Mit " + f(result.pay) + " FP reicht es für keinen Platz." : "Zieh am Balken oder tipp einen Betrag ein.")
      : result.safe
        ? "Du bekommst " + f(result.value) + " FP zurück (" + f(result.reward) + " + Bonus). Danach sind nur noch " + f(result.rest) + " FP offen — zu wenig, um dich zu überholen."
        : "Noch nicht sicher: Wer " + f(result.threat) + " FP einzahlt, überholt dich. Sicher bist du ab " + f(rankRow.safe) + " FP.";

    var valueText = f(result.pay) + " FP, " + statusText + (result.rank ? ", " + signed(result.profit) + " FP" : "");
    range.setAttribute("aria-valuetext", valueText);
    announce(valueText);

    // Leiste unten
    var dock = $("snDock");
    dock.className = "dock " + state;
    dock.textContent = "";
    var big = document.createElement("b");
    big.textContent = result.rank ? "P" + result.rank + " · " + signed(result.profit) + " FP" : "Kein Platz";
    var small = document.createElement("span");
    small.textContent = f(result.pay) + " einzahlen · " + (state === "kein" ? "zu wenig" : state);
    dock.appendChild(big);
    dock.appendChild(small);

    // Mischkalkulation: Was kostet eine Blaupause, wenn man draufzahlt?
    var slot = result.rank || view.slot;
    var estimate = slot ? Calc.estimateBlueprints(buildingId(), view.level, slot) : null;
    var kind = view.gold ? "gold" : "copper";
    $("snBpLabel").textContent = (view.gold ? "Gold-Blaupausen" : "Blaupausen") + " auf P" + (slot || "–") +
      (estimate ? " · geschätzt ca. " + estimate[kind] + ", genau im Spiel" : " · Zahl aus dem Spiel");
    $("snBpNote").textContent = estimate ? ""
      : !view.gold ? "Auf Kupfer-Stufen schätzt cipher keine Blaupausen — tipp im Spiel auf den Platz und übernimm die Zahl."
      : buildingId() === "The_Arc" ? ""
      : "Für dieses Bauwerk schätzt cipher noch nicht — tipp im Spiel auf den Platz und übernimm die Zahl.";
    if (choice.bp == null) $("snBp").value = estimate ? estimate[kind] : "";
    var count = number($("snBp")) || 0;
    var loss = result.pay - result.value;
    var out = $("snBpOut");
    if (!result.rank || !count) out.textContent = "";
    else if (loss <= 0) out.textContent = "→ gibt es obendrauf, ohne Verlust";
    else out.textContent = "→ eine Blaupause kostet dich " + f(Math.round(Calc.blueprintPrice(loss, count, options.bonus))) + " FP";
    updateDock();
  }

  /** Die Leiste unten zeigt sich, wenn das Ergebnis nicht im Bild ist. */
  var resultVisible = false;
  function updateDock() {
    $("snDock").hidden = !view.ready || resultVisible;
  }

  function render() {
    updatePick();
    buildTaken();
    var id = buildingId();
    var level = number($("snLevel"));
    var total = number($("snTotal"));
    var progress = number($("snProgress")) || 0;
    var taken = takenAmounts();
    var placed = taken.reduce(function (a, b) { return a + b; }, 0);
    saveSession();

    // B: was im Balken steckt, aufgeteilt
    var split = $("snSplit");
    split.textContent = "";
    if (level && !total) {
      split.textContent = "Die Kosten dieser Stufe kennt cipher nicht — trag die rechte Zahl am Balken ein.";
    } else if (progress) {
      split.appendChild(document.createTextNode("Im Balken: " + f(progress) + " FP · davon Besitzer " +
        f(Math.max(0, progress - placed)) + " · Fremde " + f(placed)));
      if (placed > progress) {
        var warn = document.createElement("span");
        warn.className = "warn";
        warn.textContent = " — die Plätze ergeben mehr als der Balken. Stimmt die linke Zahl?";
        split.appendChild(warn);
      }
    }

    var ready = Boolean(level && total);
    $("stepPlaces").hidden = !ready;
    $("stepResult").hidden = !ready;
    view.ready = false;
    if (!ready) { updateDock(); return; }

    var gold = Calc.isGold(id, level);
    var bonus = arcBonus(gold);
    var open = Math.max(0, total - progress);
    $("snSummary").textContent = "Noch offen: " + f(open) + " FP · " + (gold ? "Gold-Stufe" : "Kupfer-Stufe") +
      " · dein Bonus: " + (gold ? "Gold " : "Kupfer ") + percent(bonus);

    view.options = { rewards: Calc.rewardsFromCost(total, level, gold), open: open, taken: taken, bonus: bonus };
    view.rows = Calc.snipePlaces(view.options);
    view.gold = gold;
    view.level = level;

    if (!open) {
      $("snSummary").textContent = "Die Stufe ist schon voll.";
      $("snAdvice").textContent = "";
      $("snAim").hidden = true;
      updateDock();
      return;
    }
    $("snAdvice").textContent = advice(view.rows);
    var chosen = view.rows[(choice.slot || 0) - 1];
    view.slot = chosen && chosen.status !== "leer" ? choice.slot : bestSlot(view.rows);
    var row = view.rows[view.slot - 1];
    $("snAim").hidden = !row;
    if (!row) { updateDock(); return; }
    view.ready = true;

    $("snOpen").textContent = f(open);
    $("snPay").max = open;
    place("take", row.take, open);
    place("value", row.value, open);
    place("safe", row.safe, open);
    if (choice.pay == null || choice.pay > open) choice.pay = defaultPay(row, open);

    renderChips();
    renderRows();
    aim();
  }

  function onBuildingChange() {
    fillTotal();
    saveLasting();
    resetAll();
  }

  /** Neues Ziel (Bauwerk, Stufe): Platz und Einsatz waehlt cipher wieder selbst. */
  function resetAll() {
    choice.slot = null;
    choice.pay = null;
    choice.bp = null;
    render();
  }
  /** Neue Zahlen zum selben Ziel: den gewaehlten Platz behalten, Einsatz neu. */
  function resetPay() {
    choice.pay = null;
    choice.bp = null;
    render();
  }

  /** Der Griff rastet an den Marken ein, wenn er nah genug dran ist. */
  function snap(value) {
    var row = view.rows[view.slot - 1];
    var open = view.options.open;
    if (!row) return value;
    var near = open * 0.015;
    var hit = [row.take, row.value, row.safe].filter(function (mark) {
      return mark <= open && Math.abs(mark - value) <= near;
    }).sort(function (a, b) { return Math.abs(a - value) - Math.abs(b - value); })[0];
    return hit != null ? hit : value;
  }

  function nextField(input) {
    var fields = Array.prototype.slice.call(document.querySelectorAll("#stepTarget input.num, #snTaken input.num"))
      .filter(function (field) { return field.offsetParent !== null; });
    var next = fields[fields.indexOf(input) + 1];
    if (next) next.focus();
    else input.blur();
  }

  /* --------------------------------------------------- Bauwerksauswahl */

  /*
   * Wie im Foerderrechner (app.js, "Bauwerksauswahl"): ein Knopf mit Name
   * und Zeitalter oeffnet ein <dialog>. Auf dem Telefon ein Blatt von unten,
   * breit ein Fenster. Suche nach Name, Kuerzel und Zeitalter, Zeitalter als
   * mitlaufende Ueberschriften, Tastatur wie bei einer Combobox, Zurueck-
   * Geste und Wischen nach unten schliessen, das Blatt rueckt ueber die
   * Bildschirmtastatur.
   */
  var ABBR = window.CIPHER_ABBR || {};
  var SHEET_QUERY = "(max-width: 640px)";
  var PICK_DOM_ID = {};
  var picker = { ids: [], active: -1, historyPushed: false, closing: false, closeTimer: null, openedByTouch: false };

  function escapeHtml(text) {
    return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function normalise(text) {
    return String(text).toLowerCase()
      .replace(/ä/g, "a").replace(/ö/g, "o").replace(/ü/g, "u").replace(/ß/g, "ss")
      .normalize("NFD").replace(/[̀-ͯ]/g, "");
  }
  function abbrOf(building) {
    var abbr = ABBR[building.id];
    return typeof abbr === "string" ? abbr.trim() : "";
  }
  function highlight(text, needle) {
    if (!needle) return escapeHtml(text);
    var folded = "";
    var origin = [];
    for (var i = 0; i < text.length; i++) {
      var piece = normalise(text.charAt(i));
      for (var j = 0; j < piece.length; j++) origin.push(i);
      folded += piece;
    }
    var at = folded.indexOf(needle);
    if (at < 0) return escapeHtml(text);
    var from = origin[at];
    var to = origin[at + needle.length - 1] + 1;
    return escapeHtml(text.slice(0, from)) + "<mark>" + escapeHtml(text.slice(from, to)) + "</mark>" + escapeHtml(text.slice(to));
  }
  /** Namenstreffer vor Kuerzeln vor Zeitaltern — wie im Foerderrechner. */
  function matchesFor(query) {
    var needle = normalise(query).trim();
    if (!needle) return [];
    var byName = [];
    var byEra = [];
    DATA.buildings.forEach(function (building) {
      if (normalise(building.name).indexOf(needle) >= 0) byName.push({ building: building, where: "name" });
      else if (abbrOf(building) && normalise(abbrOf(building)).indexOf(needle) >= 0) {
        byName.push({ building: building, where: "short", alias: abbrOf(building) });
      } else if (normalise(building.era).indexOf(needle) >= 0) byEra.push({ building: building, where: "era" });
    });
    return byName.concat(byEra);
  }

  function updatePick() {
    var building = DATA.buildings.filter(function (b) { return b.id === buildingId(); })[0];
    $("buildingPickName").textContent = building ? building.name : "";
    $("buildingPickEra").textContent = building ? building.era : "";
  }

  function pickerOption(building, needle, match) {
    picker.ids.push(building.id);
    var name = match && match.where === "name" ? highlight(building.name, needle) : escapeHtml(building.name);
    var aside;
    if (match) {
      aside = (match.where === "era" ? highlight(building.era, needle) : escapeHtml(building.era)) +
        (match.where === "short" ? " · " + highlight(match.alias, needle) : "");
    } else {
      aside = abbrOf(building) ? escapeHtml(abbrOf(building)) : "";
    }
    return '<li role="option" class="picker-opt" id="' + PICK_DOM_ID[building.id] + '"' +
      ' data-pick="' + escapeHtml(building.id) + '" aria-selected="' + (building.id === buildingId()) + '">' +
      "<b>" + name + "</b>" + (aside ? "<span>" + aside + "</span>" : "") + "</li>";
  }

  function renderPicker() {
    var query = $("pickerFilter").value;
    var needle = normalise(query).trim();
    var matches = matchesFor(query);
    picker.ids = [];
    $("pickerFilterClear").hidden = !query;
    $("pickerCount").textContent = !needle ? ""
      : matches.length === 0 ? "Kein Bauwerk gefunden."
      : matches.length === 1 ? "1 Bauwerk gefunden." : matches.length + " Bauwerke gefunden.";
    if (needle) {
      $("pickerList").innerHTML = matches.map(function (match) { return pickerOption(match.building, needle, match); }).join("");
      return;
    }
    var groups = [];
    var byEra = {};
    DATA.buildings.forEach(function (building) {
      if (!byEra[building.era]) { byEra[building.era] = []; groups.push(building.era); }
      byEra[building.era].push(building);
    });
    $("pickerList").innerHTML = groups.map(function (era, index) {
      return '<li role="presentation"><ul class="picker-group" role="group" aria-labelledby="pkg-' + index + '">' +
        '<li role="presentation" class="picker-era" id="pkg-' + index + '">' + escapeHtml(era) + "</li>" +
        byEra[era].map(function (building) { return pickerOption(building, "", null); }).join("") +
        "</ul></li>";
    }).join("");
  }

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
    $(domId).classList.add("active");
    if (reveal) $(domId).scrollIntoView({ block: "nearest" });
  }

  function centerPickerSelection() {
    var list = $("pickerList");
    var option = $(PICK_DOM_ID[buildingId()]);
    if (!option) { list.scrollTop = 0; return; }
    var listBox = list.getBoundingClientRect();
    var optionBox = option.getBoundingClientRect();
    list.scrollTop += optionBox.top - listBox.top - (listBox.height - optionBox.height) / 2;
  }

  function syncPickerViewport() {
    var viewport = window.visualViewport;
    if (!viewport) return;
    var below = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
    $("picker").style.setProperty("--kb", Math.round(below) + "px");
    $("picker").style.setProperty("--vvh", Math.round(viewport.height) + "px");
  }
  function watchPickerViewport(on) {
    var viewport = window.visualViewport;
    if (!viewport) return;
    var method = on ? "addEventListener" : "removeEventListener";
    viewport[method]("resize", syncPickerViewport);
    viewport[method]("scroll", syncPickerViewport);
    if (on) syncPickerViewport();
  }

  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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
    try {
      window.history.pushState({ cipherPicker: true }, "");
      picker.historyPushed = true;
    } catch (e) { picker.historyPushed = false; }
    centerPickerSelection();
    setPickerActive(picker.ids.indexOf(buildingId()), false);
    (picker.openedByTouch ? $("pickerList") : $("pickerFilter")).focus({ preventScroll: true });
  }

  function closePicker() {
    var dialog = $("picker");
    if (!dialog.open || picker.closing) return;
    if (reduceMotion) { dialog.close(); return; }
    picker.closing = true;
    dialog.classList.add("closing");
    picker.closeTimer = window.setTimeout(function () { dialog.close(); }, 180);
  }

  function onPickerClosed() {
    window.clearTimeout(picker.closeTimer);
    picker.closing = false;
    $("picker").classList.remove("closing");
    $("pickerSheet").style.transform = "";
    document.documentElement.classList.remove("picker-open");
    watchPickerViewport(false);
    $("buildingPick").setAttribute("aria-expanded", "false");
    $("buildingPick").focus({ preventScroll: true });
    if (picker.historyPushed) {
      picker.historyPushed = false;
      window.history.back();
    }
  }

  function choosePicked(id) {
    if (id !== buildingId()) {
      $("snBuilding").value = id;
      onBuildingChange();
    }
    closePicker();
  }

  function onPickerInput() {
    renderPicker();
    if (normalise($("pickerFilter").value).trim()) {
      $("pickerList").scrollTop = 0;
      setPickerActive(0, false);
    } else {
      centerPickerSelection();
      setPickerActive(picker.ids.indexOf(buildingId()), false);
    }
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
        if (input.value) { input.value = ""; onPickerInput(); } else closePicker();
        break;
      default:
        if (!inList || event.key.length !== 1) return;
        input.value += event.key;
        input.focus();
        onPickerInput();
    }
    event.preventDefault();
  }

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

  function setupPicker() {
    DATA.buildings.forEach(function (building, index) { PICK_DOM_ID[building.id] = "pk-" + index; });
    var dialog = $("picker");
    $("buildingPick").addEventListener("pointerdown", function (event) {
      picker.openedByTouch = event.pointerType === "touch";
    });
    $("buildingPick").addEventListener("click", openPicker);
    $("pickerClose").addEventListener("click", closePicker);
    $("pickerFilter").addEventListener("input", onPickerInput);
    $("pickerFilterClear").addEventListener("click", function () {
      $("pickerFilter").value = "";
      onPickerInput();
      $("pickerFilter").focus();
    });
    dialog.addEventListener("keydown", onPickerKey);
    dialog.addEventListener("cancel", function (event) { event.preventDefault(); closePicker(); });
    dialog.addEventListener("close", onPickerClosed);
    // Tippen auf den Hintergrund schliesst; das <dialog> fuellt nur das Blatt.
    dialog.addEventListener("click", function (event) {
      if (event.target === dialog) { closePicker(); return; }
      var option = event.target.closest("[data-pick]");
      if (option) choosePicked(option.dataset.pick);
    });
    window.addEventListener("popstate", function () {
      if (!dialog.open) return;
      picker.historyPushed = false;
      closePicker();
    });
    bindPickerSwipe();
  }

  function init() {
    var select = $("snBuilding");
    DATA.buildings.slice().sort(function (a, b) { return a.name.localeCompare(b.name, "de"); })
      .forEach(function (building) {
        var option = document.createElement("option");
        option.value = building.id;
        option.textContent = building.name;
        select.appendChild(option);
      });
    var stored = read("localStorage", STORE);
    var session = read("sessionStorage", SESSION);
    select.value = stored.building && COSTS.costs[stored.building] ? stored.building : "The_Arc";
    if (session.building && COSTS.costs[session.building]) {
      select.value = session.building;
      $("snLevel").value = session.level || "";
      $("snProgress").value = session.progress || "";
      $("snTotal").value = session.total || "";
      choice.slot = session.slot || null;
    }
    if (stored.arc != null) $("snArc").value = stored.arc;
    showArc(stored.arc == null);
    buildTaken(session.taken);
    if (COSTS && COSTS.generated) $("snDate").textContent = COSTS.generated.split("-").reverse().join(".");

    $("arcForm").addEventListener("submit", function (event) {
      event.preventDefault();
      if ($("snArc").value === "") $("snArc").value = "0";
      saveLasting();
      showArc(false);
      resetPay();
      if (!$("snLevel").value) $("snLevel").focus();
    });
    $("arcSummary").addEventListener("click", function () {
      showArc(true);
      $("snArc").focus();
      $("snArc").select();
    });

    select.addEventListener("change", onBuildingChange);
    setupPicker();
    $("snLevel").addEventListener("input", function () { fillTotal(); resetAll(); });
    $("snProgress").addEventListener("input", resetPay);
    $("snTotal").addEventListener("input", resetPay);
    $("snTaken").addEventListener("input", resetPay);
    $("snClear").addEventListener("click", function () {
      ["snLevel", "snProgress", "snTotal"].forEach(function (id) { $(id).value = ""; });
      buildTaken([]);
      resetAll();
      $("snLevel").focus();
    });

    // Tausenderpunkte beim Verlassen, Enter springt ins naechste Feld
    document.addEventListener("focusout", function (event) {
      var input = event.target;
      if (!input.classList || !input.classList.contains("num") || input.id === "snLevel") return;
      var value = number(input);
      if (value != null) input.value = f(value);
    });
    document.addEventListener("keydown", function (event) {
      var input = event.target;
      if (event.key !== "Enter" || !input.classList || !input.classList.contains("num")) return;
      if (input.closest("#stepTarget") || input.closest("#snTaken")) {
        event.preventDefault();
        nextField(input);
      }
    });

    $("snChips").addEventListener("click", function (event) {
      var button = event.target.closest("button[data-slot]");
      if (!button) return;
      choice.slot = Number(button.dataset.slot);
      choice.pay = null;
      choice.bp = null;
      render();
    });
    $("snPay").addEventListener("input", function () {
      choice.pay = snap(Number($("snPay").value));
      choice.bp = null;
      aim();
    });
    $("snPayNum").addEventListener("input", function () {
      choice.pay = number($("snPayNum")) || 0;
      choice.bp = null;
      aim();
    });
    $("snPayNum").addEventListener("blur", aim);
    document.querySelector(".stepper").addEventListener("click", function (event) {
      var button = event.target.closest("button[data-step]");
      if (!button) return;
      choice.pay = Math.max(0, Math.min(view.options.open, (choice.pay || 0) + Number(button.dataset.step)));
      choice.bp = null;
      aim();
    });
    $("snLegend").addEventListener("click", function (event) {
      var button = event.target.closest("button[data-jump]");
      var row = view.rows[view.slot - 1];
      if (!button || button.disabled || !row) return;
      choice.pay = Math.min(row[button.dataset.jump], view.options.open);
      choice.bp = null;
      aim();
    });
    $("snBp").addEventListener("input", function () {
      choice.bp = number($("snBp"));
      aim();
    });
    $("snDock").addEventListener("click", function () {
      $("stepResult").scrollIntoView({ behavior: "smooth", block: "start" });
    });
    if ("IntersectionObserver" in window) {
      new window.IntersectionObserver(function (entries) {
        resultVisible = entries[0].isIntersecting;
        updateDock();
      }, { threshold: 0.15 }).observe($("stepResult"));
    } else {
      resultVisible = true;
    }
    render();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})(window, document);
