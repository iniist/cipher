/*!
 * cipher — Arche-Sniper: lohnt sich ein Platz in einem fremden Bauwerk?
 *
 * Schritte: A eigene Arche (gemerkt, klappt zu), B Ziel, C fremde Plaetze,
 * D Zielen mit Balken und Schieber. Rechnen tut calc.js (snipePlaces,
 * snipeDeposit, estimateBlueprints); Kosten und Arche-Bonus kommen aus
 * kosten.js. Gemerkt werden nur Bauwerk und Arche-Stufe (cipher:snipe).
 */
(function (window, document) {
  "use strict";

  var Calc = window.CipherCalc;
  var DATA = window.CIPHER_DATA;
  var COSTS = window.CIPHER_COSTS;
  var STORE = "cipher:snipe";

  var $ = function (id) { return document.getElementById(id); };
  var fmt = new Intl.NumberFormat("de-DE");
  var f = function (value) { return fmt.format(value); };
  var signed = function (value) { return (value > 0 ? "+" : value < 0 ? "−" : "±") + f(Math.abs(value)); };

  /** Was gerade gerechnet ist; render() fuellt es, aim() liest es. */
  var view = { options: null, rows: [], slot: 0, gold: false, level: 0 };
  /** Vom Nutzer gewaehlter Platz und Einsatz; null = cipher waehlt. */
  var choice = { slot: null, pay: null, bp: null };

  /** Ziffern aus einer Eingabe; "34.456" und "34456" sind dasselbe. */
  function number(input) {
    var digits = String(input.value || "").replace(/\D/g, "");
    return digits ? Number(digits) : null;
  }

  function load() {
    try { return JSON.parse(window.localStorage.getItem(STORE)) || {}; } catch (error) { return {}; }
  }
  function save() {
    try {
      window.localStorage.setItem(STORE, JSON.stringify({ building: $("snBuilding").value, arc: number($("snArc")) }));
    } catch (error) { /* privat surfen: dann eben nicht merken */ }
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
    if (!open) {
      $("arcSummary").textContent = "";
      var text = document.createElement("strong");
      text.textContent = arc ? "Arche " + arc + " · Kupfer " + arcBonus(false) + " % · Gold " + arcBonus(true) + " %"
        : "Keine Arche";
      var edit = document.createElement("span");
      edit.textContent = "ändern";
      $("arcSummary").appendChild(text);
      $("arcSummary").appendChild(edit);
    }
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

  function buildTaken() {
    var box = $("snTaken");
    var count = slotCount();
    var old = Array.prototype.map.call(box.querySelectorAll("input"), function (input) { return input.value; });
    if (old.length === count) return;
    box.textContent = "";
    for (var slot = 1; slot <= count; slot++) {
      var label = document.createElement("label");
      label.textContent = "P" + slot;
      var input = document.createElement("input");
      input.id = "snP" + slot;
      input.inputMode = "numeric";
      input.autocomplete = "off";
      input.setAttribute("aria-label", "Betrag auf Platz " + slot);
      input.value = old[slot - 1] || "";
      label.appendChild(input);
      box.appendChild(label);
    }
  }

  function takenAmounts() {
    return Array.prototype.map.call($("snTaken").querySelectorAll("input"), number)
      .filter(function (value) { return value; });
  }

  /* ------------------------------------------------------------ D: Zielen */

  var STATUS_TEXT = { lohnt: "lohnt", riskant: "riskant", teuer: "zu teuer", zu: "nicht drin" };

  /** Der lohnendste Platz: hoechster Gewinn, wenn man ihn sichert. */
  function bestSlot(rows) {
    var usable = rows.filter(function (row) { return row.status !== "leer" && row.status !== "zu"; });
    if (!usable.length) return 0;
    return usable.reduce(function (best, row) { return row.profit > best.profit ? row : best; }).slot;
  }

  /** Sinnvoller Einsatz fuer einen Platz: sicher, wenn es sich lohnt, sonst die Gewinngrenze. */
  function defaultPay(row, open) {
    if (row.status === "lohnt") return row.safe;
    if (row.status === "riskant") return row.pay;
    if (row.status === "teuer") return Math.min(row.safe, open);
    return open;
  }

  /** Eine Marke auf den Balken setzen und ihren Wert in die Legende. */
  function place(mark, legend, value, open) {
    var el = $(mark);
    $(legend).textContent = value > open ? f(value) + " (mehr als offen)" : f(value);
    if (!(value > 0) || value > open) { el.classList.add("out"); return; }
    el.classList.remove("out");
    el.style.left = (value / open * 100) + "%";
  }

  function renderChips() {
    var box = $("snChips");
    box.textContent = "";
    view.rows.forEach(function (row) {
      if (row.status === "leer") return;
      var button = document.createElement("button");
      button.type = "button";
      button.className = row.status;
      button.dataset.slot = row.slot;
      button.textContent = "P" + row.slot;
      button.title = STATUS_TEXT[row.status];
      button.setAttribute("aria-pressed", String(row.slot === view.slot));
      button.addEventListener("click", function () {
        choice.slot = row.slot;
        choice.pay = null;
        choice.bp = null;
        render();
      });
      box.appendChild(button);
    });
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
      limits.textContent = "Platz ab " + f(row.take) + " · sicher ab " + f(row.safe);
      var verdict = document.createElement("p");
      verdict.className = "verdict";
      verdict.textContent = row.status === "lohnt" ? "Lohnt sich: " + signed(row.profit) + " FP, wenn du sicherst."
        : row.status === "riskant" ? "Riskant: ohne Verlust nur angreifbar, sicher " + signed(row.profit) + " FP."
        : row.status === "teuer" ? "Zu teuer: sicher " + signed(row.profit) + " FP."
        : "Nicht drin: Es ist zu wenig offen.";
      item.appendChild(head);
      item.appendChild(limits);
      item.appendChild(verdict);
      list.appendChild(item);
    });
  }

  /** Den Balken, die Anzeige und die Blaupausen fuer den Einsatz zeichnen. */
  function aim() {
    var options = view.options;
    var open = options.open;
    var pay = choice.pay;
    var result = Calc.snipeDeposit(options, pay);

    var state = !result.rank ? "kein" : result.safe ? "sicher" : "angreifbar";
    var fill = $("snFill");
    fill.style.width = (open ? result.pay / open * 100 : 0) + "%";
    fill.className = "fill " + state;

    $("snPay").value = result.pay;
    if (document.activeElement !== $("snPayNum")) $("snPayNum").value = f(result.pay);

    var status = $("snStatus");
    status.className = "status " + state;
    status.textContent = !result.rank ? "Kein Platz"
      : "P" + result.rank + (result.safe ? " · sicher" : " · angreifbar");

    $("snProfit").textContent = result.rank ? signed(result.profit) + " FP" : "";
    $("snDetail").textContent = !result.rank
      ? (result.pay ? "Mit " + f(result.pay) + " FP reicht es für keinen Platz." : "Schieb den Regler oder tipp einen Betrag ein.")
      : result.safe
        ? "Zurück kommen " + f(result.value) + " FP (" + f(result.reward) + " + Bonus). Danach bleiben " + f(result.rest) + " FP offen — zu wenig, um dich zu überholen."
        : "Zurück kommen " + f(result.value) + " FP. Aber " + f(result.threat) + " FP reichen jemandem zum Überholen, " + f(result.rest) + " sind noch offen.";

    // Mischkalkulation: Was kostet eine Blaupause, wenn man draufzahlt?
    var slot = result.rank || view.slot;
    var estimate = slot ? Calc.estimateBlueprints(buildingId(), view.level, slot) : null;
    var kind = view.gold ? "gold" : "copper";
    var bpInput = $("snBp");
    $("snBpLabel").textContent = (view.gold ? "Gold-Blaupausen" : "Blaupausen") + " auf P" + (slot || "–") +
      (estimate ? " (geschätzt ca. " + estimate[kind] + ", Tooltip genauer)" : " laut Tooltip");
    if (choice.bp == null) bpInput.value = estimate ? estimate[kind] : "";
    var count = number(bpInput) || 0;
    var loss = result.pay - result.value;
    var out = $("snBpOut");
    if (!result.rank || !count) out.textContent = "";
    else if (loss <= 0) out.textContent = "→ gibt es obendrauf, ohne Verlust";
    else out.textContent = "→ eine Blaupause kostet dich " + f(Math.round(Calc.blueprintPrice(loss, count, options.bonus))) + " FP";
  }

  function render() {
    buildTaken();
    var id = buildingId();
    var level = number($("snLevel"));
    var total = number($("snTotal"));
    var progress = number($("snProgress")) || 0;
    var taken = takenAmounts();
    var placed = taken.reduce(function (a, b) { return a + b; }, 0);

    // B: was im Balken steckt, aufgeteilt
    var split = $("snSplit");
    split.textContent = "";
    if (level && !total) {
      split.textContent = "Für diese Stufe kenne ich die Kosten nicht — trag die rechte Zahl am Balken ein.";
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
    if (!ready) return;

    var gold = Calc.isGold(id, level);
    var bonus = arcBonus(gold);
    var open = Math.max(0, total - progress);
    var summary = $("snSummary");
    if (!open) {
      summary.textContent = "Die Stufe ist schon voll.";
      $("snMeter").hidden = true;
      return;
    }
    $("snMeter").hidden = false;
    summary.textContent = "Noch offen: " + f(open) + " FP · " + (gold ? "Gold-Stufe" : "Kupfer-Stufe") +
      " · dein Bonus: " + (gold ? "Gold " : "Kupfer ") + bonus + " %";

    view.options = { rewards: Calc.rewardsFromCost(total, level, gold), open: open, taken: taken, bonus: bonus };
    view.rows = Calc.snipePlaces(view.options);
    view.gold = gold;
    view.level = level;
    var chosen = view.rows[(choice.slot || 0) - 1];
    view.slot = chosen && chosen.status !== "leer" ? choice.slot : bestSlot(view.rows);
    var row = view.rows[view.slot - 1];

    $("snOpen").textContent = f(open);
    $("snPay").max = open;
    if (row) {
      place("mTake", "lTake", row.take, open);
      place("mValue", "lValue", row.value, open);
      place("mSafe", "lSafe", row.safe, open);
    }
    if (choice.pay == null || choice.pay > open) choice.pay = row ? defaultPay(row, open) : 0;

    renderChips();
    renderRows();
    aim();
  }

  /** Neue Eingaben in B oder C: Platz und Einsatz waehlt cipher wieder selbst. */
  function reset() {
    choice.slot = null;
    choice.pay = null;
    choice.bp = null;
    render();
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
    var stored = load();
    select.value = stored.building && COSTS.costs[stored.building] ? stored.building : "The_Arc";
    if (stored.arc != null) $("snArc").value = stored.arc;
    showArc(stored.arc == null);
    if (COSTS && COSTS.generated) $("snDate").textContent = COSTS.generated.split("-").reverse().join(".");

    $("arcForm").addEventListener("submit", function (event) {
      event.preventDefault();
      if ($("snArc").value === "") $("snArc").value = "0";
      save();
      showArc(false);
      reset();
      $("snLevel").focus();
    });
    $("arcSummary").addEventListener("click", function () {
      showArc(true);
      $("snArc").focus();
      $("snArc").select();
    });

    select.addEventListener("change", function () { fillTotal(); save(); reset(); });
    $("snLevel").addEventListener("input", function () { fillTotal(); reset(); });
    $("snProgress").addEventListener("input", reset);
    $("snTotal").addEventListener("input", reset);
    $("snTaken").addEventListener("input", reset);

    $("snPay").addEventListener("input", function () {
      choice.pay = Number($("snPay").value);
      choice.bp = null;
      aim();
    });
    $("snPayNum").addEventListener("input", function () {
      choice.pay = number($("snPayNum")) || 0;
      choice.bp = null;
      aim();
    });
    $("snPayNum").addEventListener("blur", aim);
    $("snBp").addEventListener("input", function () {
      choice.bp = number($("snBp"));
      aim();
    });
    render();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})(window, document);
