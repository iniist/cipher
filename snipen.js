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

    select.addEventListener("change", function () { fillTotal(); saveLasting(); resetAll(); });
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
