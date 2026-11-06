/*!
 * cipher — Snipen: lohnt sich ein Platz in einem fremden Bauwerk?
 *
 * Rechnet mit calc.js (Calc.snipePlaces), Kosten und Arche-Bonus kommen aus
 * kosten.js. Gemerkt werden nur Bauwerk und eigene Arche-Stufe
 * (cipher:snipe) — die Belegung beim Nachbarn ist beim naechsten Mal eine
 * andere.
 */
(function (window, document) {
  "use strict";

  var Calc = window.CipherCalc;
  var DATA = window.CIPHER_DATA;
  var COSTS = window.CIPHER_COSTS;
  var STORE = "cipher:snipe";

  var $ = function (id) { return document.getElementById(id); };
  var fmt = new Intl.NumberFormat("de-DE");

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

  function buildingId() { return $("snBuilding").value; }

  /** Kosten der Stufe aus der Tabelle, sonst null. */
  function tableCost(id, level) {
    var list = COSTS && COSTS.costs[id];
    return list && level >= 1 && level <= list.length ? list[level - 1] : null;
  }

  /** Eigener Bonus fuer diese Stufe: Kupfer oder Gold, je nach Kategorie. */
  function ownBonus(gold) {
    var arc = number($("snArc"));
    if (!arc || !COSTS || !COSTS.arcBonus) return 0;
    var list = gold ? COSTS.arcBonus.gold : COSTS.arcBonus.copper;
    return list[Math.min(arc, list.length) - 1] || 0;
  }

  function slotCount() {
    var level = number($("snLevel"));
    return level && Calc.isGold(buildingId(), level) ? 7 : 5;
  }

  /** Eingabefelder P1..Pn; vorhandene Werte bleiben stehen. */
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
      input.setAttribute("aria-label", "Betrag auf Platz " + slot);
      input.value = old[slot - 1] || "";
      label.appendChild(input);
      box.appendChild(label);
    }
  }

  /** Bei Bauwerk- oder Stufenwechsel die Kosten aus der Tabelle eintragen. */
  function fillTotal() {
    var cost = tableCost(buildingId(), number($("snLevel")));
    $("snTotal").value = cost ? fmt.format(cost) : "";
  }

  function line(text, className) {
    var p = document.createElement("p");
    if (className) p.className = className;
    p.textContent = text;
    return p;
  }

  var VERDICT = {
    lohnt: function (row) {
      return "Lohnt sich: " + fmt.format(row.pay) + " FP einzahlen, der Platz ist sicher. Gewinn " + fmt.format(row.profit) + " FP.";
    },
    riskant: function (row) {
      return "Riskant: Mit " + fmt.format(row.pay) + " FP bist du ohne Verlust drauf, aber " + fmt.format(row.threat) +
        " FP reichen jemand anderem zum Überholen. Sicher wärst du erst mit " + fmt.format(row.safe) + " FP (" +
        fmt.format(row.safe - row.value) + " FP Verlust).";
    },
    teuer: function (row) {
      return "Zu teuer: Schon um den Platz zu bekommen, zahlst du " + fmt.format(row.take - row.value) +
        " FP drauf; sicher erst mit " + fmt.format(row.safe) + " FP (" + fmt.format(row.safe - row.value) + " FP Verlust).";
    },
    zu: function () {
      return "Nicht zu bekommen: Es ist weniger offen, als du bräuchtest.";
    }
  };

  function render() {
    buildTaken();
    var id = buildingId();
    var level = number($("snLevel"));
    var total = number($("snTotal"));
    var progress = number($("snProgress")) || 0;
    var rows = $("snRows");
    rows.textContent = "";
    var summary = $("snSummary");

    if (!level || !total) {
      summary.textContent = !level ? "Trag die Stufe ein, die gerade gefördert wird."
        : "Für diese Stufe kenne ich die Kosten nicht — trag die rechte Zahl am Balken ein.";
      return;
    }
    var gold = Calc.isGold(id, level);
    var bonus = ownBonus(gold);
    var open = total - progress;
    var taken = Array.prototype.map.call($("snTaken").querySelectorAll("input"), number)
      .filter(function (value) { return value; });
    var placed = taken.reduce(function (a, b) { return a + b; }, 0);

    summary.textContent = "";
    if (open <= 0) {
      summary.textContent = "Die Stufe ist schon voll.";
      return;
    }
    var parts = ["Noch offen: " + fmt.format(open) + " FP", gold ? "Gold-Stufe" : "Kupfer-Stufe",
      "dein Bonus: " + (gold ? "Gold " : "Kupfer ") + bonus + " %"];
    summary.appendChild(document.createTextNode(parts.join(" · ")));
    if (placed > progress) {
      summary.appendChild(document.createElement("br"));
      summary.appendChild(document.createTextNode("Achtung: Die Plätze ergeben zusammen mehr als „Eingezahlt“ — stimmt die linke Zahl?"));
    }

    var rewards = Calc.rewardsFromCost(total, level, gold);
    Calc.snipePlaces({ rewards: rewards, open: open, taken: taken, bonus: bonus }).forEach(function (row) {
      if (row.status === "leer") return;
      var item = document.createElement("li");
      item.className = row.status;
      item.dataset.slot = row.slot;
      var head = document.createElement("h3");
      head.textContent = "P" + row.slot + " ";
      var span = document.createElement("span");
      span.textContent = fmt.format(row.reward) + " + " + fmt.format(row.extra) + " Bonus = " + fmt.format(row.value) + " FP";
      head.appendChild(span);
      item.appendChild(head);
      item.appendChild(line("Platz ab " + fmt.format(row.take) + " FP · sicher ab " + fmt.format(row.safe) + " FP", "limits"));
      item.appendChild(line(VERDICT[row.status](row), "verdict"));

      // Mischkalkulation: Wer fuer Blaupausen draufzahlt, sieht den Preis je Stueck.
      var loss = row.safe - row.value;
      if (loss > 0 && row.status !== "zu") {
        var bp = document.createElement("label");
        bp.className = "bp";
        bp.appendChild(document.createTextNode(gold ? "Gold-Blaupausen laut Tooltip" : "Blaupausen laut Tooltip"));
        var input = document.createElement("input");
        input.inputMode = "numeric";
        input.className = "bpCount";
        var out = document.createElement("output");
        input.addEventListener("input", function () {
          var price = Calc.blueprintPrice(loss, number(input) || 0, bonus);
          out.textContent = price == null ? "" : "→ sicher kostet dich eine Blaupause " + fmt.format(Math.round(price)) + " FP";
        });
        bp.appendChild(input);
        bp.appendChild(out);
        item.appendChild(bp);
      }
      rows.appendChild(item);
    });
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
    if (stored.arc) $("snArc").value = stored.arc;
    if (COSTS && COSTS.generated) $("snDate").textContent = COSTS.generated.split("-").reverse().join(".");

    select.addEventListener("change", function () { fillTotal(); save(); render(); });
    $("snLevel").addEventListener("input", function () { fillTotal(); render(); });
    $("snArc").addEventListener("input", function () { save(); render(); });
    $("snProgress").addEventListener("input", render);
    $("snTotal").addEventListener("input", render);
    $("snTaken").addEventListener("input", render);
    $("snipe").addEventListener("submit", function (event) { event.preventDefault(); });
    render();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})(window, document);
