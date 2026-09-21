/*!
 * cipher — Rechenkern
 *
 * Reine Funktionen ohne DOM- und ohne Speicherzugriff. Alles, was hier drin
 * steht, laesst sich isoliert testen (siehe test/calc.test.js).
 *
 * Begriffe:
 *   Gesamtkosten   Forge-Punkte, die eine Stufe insgesamt kostet.
 *   P1..P5         Die fuenf Maezen-Plaetze. P1 zahlt am meisten Belohnung aus.
 *   Faktor         Arche-Bonus als Ganzzahl in Prozent (190 = 1,90).
 *   Einzahlen      Was ein Foerderer zahlen muss, um den Platz zu bekommen.
 *   Vorher sichern Was du selbst vorab einzahlst, damit der Platz nicht
 *                  ueberboten werden kann.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.CipherCalc = factory();
})(typeof self !== "undefined" ? self : globalThis, function () {
  "use strict";

  /** Anzahl der Maezen-Plaetze. */
  var SLOTS = 5;

  /** Wachstum der Gesamtkosten je Stufe oberhalb von Stufe 10. */
  var GROWTH = 1.025;

  /** Toleranz gegen Gleitkomma-Rauschen vor dem Aufrunden. */
  var EPSILON = 1e-7;

  /**
   * Die P1-Kurve eines Zeitalters folgt C * Stufe^e. Diese Grenzen fuer den
   * Exponenten stammen aus tools/import.html, das denselben Fit auf die
   * Wiki-Werte legt; der Vorgabewert gilt, wenn zu wenige Stuetzpunkte da
   * sind, um ihn auszurechnen.
   */
  var DEFAULT_EXPONENT = 1.206;
  var EXPONENT_MIN = 1.18;
  var EXPONENT_MAX = 1.2305;
  var EXPONENT_STEP = 0.0005;

  /**
   * Kaufmaennisch auf ein Vielfaches von 5 runden.
   * Belohnungen im Spiel sind immer durch 5 teilbar.
   * @param {number} value
   * @returns {number}
   */
  function roundTo5(value) {
    return 5 * Math.floor(value / 5 + 0.5);
  }

  /**
   * Die Belohnungen aller fuenf Plaetze aus der P1-Belohnung ableiten.
   * P2 ist P1/2, P3 ist P2/3, P4 ist P3/4, P5 ist P4/5 — jeweils auf 5 gerundet.
   * @param {number} p1 Belohnung fuer Platz 1
   * @returns {number[]} Belohnungen P1..P5
   */
  function rewardChain(p1) {
    var rewards = [p1];
    for (var slot = 2; slot <= SLOTS; slot++) {
      rewards.push(roundTo5(rewards[slot - 2] / slot));
    }
    return rewards;
  }

  /**
   * Was ein Foerderer fuer einen Platz einzahlen muss.
   * Das Spiel rundet den mit dem Arche-Faktor multiplizierten Wert ab,
   * rechnet aber intern mit halben Punkten — daher das "+ 50".
   * @param {number} reward Belohnung des Platzes
   * @param {number} factor Arche-Faktor in Prozent (z. B. 190)
   * @returns {number}
   */
  function contribution(reward, factor) {
    return Math.floor((reward * factor + 50) / 100);
  }

  /**
   * Gesamtkosten einer Stufe bestimmen.
   *
   * Reihenfolge der Quellen:
   *   1. "manual"    Ein Wert, den die Nutzerin aus dem Spiel eingetragen hat.
   *   2. "table"     Stufen 1-10 stehen direkt im Wiki.
   *   3. "formula"   Ab Stufe 11 gilt A * 1,025^Stufe.
   *   4. "derived"   Ohne Basiswert: aus dem hoechsten eigenen Eintrag hochgerechnet.
   *
   * @param {object} building Eintrag aus CIPHER_DATA.buildings
   * @param {number} level Stufe (1-basiert)
   * @param {Object<string, number>} overrides Eigene Eintraege, Schluessel "id:level"
   * @returns {{value: number|null, source: string|null, from?: number}}
   */
  function totalCost(building, level, overrides) {
    overrides = overrides || {};
    var key = building.id + ":" + level;

    if (overrides[key] > 0) return { value: overrides[key], source: "manual" };

    if (building.base != null) {
      if (level <= 10 && building.costs) {
        return { value: building.costs[level - 1], source: "table" };
      }
      return {
        value: Math.ceil(building.base * Math.pow(GROWTH, level) - EPSILON),
        source: "formula"
      };
    }

    // Kein Basiswert im Datensatz: aus dem hoechsten eigenen Eintrag ab Stufe 11
    // hochrechnen. Die Kostenkurve ist rein exponentiell, ein Stuetzpunkt reicht.
    var anchor = highestOverride(building.id, overrides);
    if (anchor && level >= 11) {
      var base = anchor.value / Math.pow(GROWTH, anchor.level);
      return {
        value: Math.ceil(base * Math.pow(GROWTH, level) - EPSILON),
        source: "derived",
        from: anchor.level
      };
    }

    return { value: null, source: null };
  }

  /**
   * Den eigenen Eintrag mit der hoechsten Stufe (>= 11) fuer ein Bauwerk finden.
   * @param {string} buildingId
   * @param {Object<string, number>} overrides
   * @returns {{level: number, value: number}|null}
   */
  function highestOverride(buildingId, overrides) {
    var best = null;
    for (var key in overrides) {
      if (!Object.prototype.hasOwnProperty.call(overrides, key)) continue;
      var split = key.lastIndexOf(":");
      if (split < 0 || key.slice(0, split) !== buildingId) continue;
      var level = Number(key.slice(split + 1));
      if (!(level >= 11)) continue;
      if (!best || level > best.level) best = { level: level, value: overrides[key] };
    }
    return best;
  }

  /** Median einer nicht leeren Zahlenliste. */
  function median(values) {
    var sorted = values.slice().sort(function (a, b) { return a - b; });
    var middle = sorted.length >> 1;
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  /**
   * Aus den echten Werten einer Kurve die Potenzfunktion C * Stufe^e
   * bestimmen, die moeglichst viele davon auf den Punkt trifft.
   *
   * Dieselbe Rechnung steht in tools/import.html, das damit die Luecken im
   * Datensatz fuellt. Hier wird sie gebraucht, weil der Datensatz nur so
   * weit reicht, wie das Wiki Stufen kennt — wer sein Bauwerk darueber
   * hinaus gezogen hat, bekaeme sonst gar keine Zahl. Die Werte ab Stufe 30
   * beschreiben die Kurve am besten; erst wenn zu wenige davon da sind,
   * kommen die niedrigen dazu.
   *
   * @param {object} curve Eintrag aus CIPHER_DATA.curves
   * @returns {{factor: number, exponent: number}|null}
   */
  function fitCurve(curve) {
    var points = [];
    for (var i = 0; i < curve.p1.length; i++) {
      if (curve.source[i] === "w" && curve.p1[i] > 0) points.push([i + 1, curve.p1[i]]);
    }

    var use = points.filter(function (point) { return point[0] >= 30; });
    if (use.length < 5) use = points.filter(function (point) { return point[0] >= 11; });
    if (!use.length) return null;

    function factorFor(exponent) {
      return median(use.map(function (point) { return point[1] / Math.pow(point[0], exponent); }));
    }

    /** Wie viele Stuetzpunkte dieser Exponent verfehlt. */
    function misses(exponent, factor) {
      return use.filter(function (point) {
        return roundTo5(factor * Math.pow(point[0], exponent)) !== point[1];
      }).length;
    }

    var best = { exponent: DEFAULT_EXPONENT, factor: factorFor(DEFAULT_EXPONENT) };
    if (use.length < 3) return best;

    best.miss = misses(best.exponent, best.factor);
    best.distance = 0;
    for (var e = EXPONENT_MIN; e <= EXPONENT_MAX; e += EXPONENT_STEP) {
      var exponent = Number(e.toFixed(4));
      var factor = factorFor(exponent);
      var miss = misses(exponent, factor);
      var distance = Math.abs(exponent - DEFAULT_EXPONENT);
      // Bei gleich vielen Fehlern gewinnt der Exponent, der dem ueblichen
      // naeher liegt — sonst wackelt die Kurve mit jedem neuen Wert.
      if (miss < best.miss || (miss === best.miss && distance < best.distance)) {
        best = { exponent: exponent, factor: factor, miss: miss, distance: distance };
      }
    }
    return best;
  }

  /**
   * Der zuletzt berechnete Fit je Zeitalter.
   *
   * Der Fit kostet einen Durchlauf ueber gut hundert Exponenten und aendert
   * sich nie, solange der Datensatz derselbe ist. Der Vergleich auf das
   * Kurvenobjekt haelt den Zwischenspeicher ehrlich, wenn ein Test einen
   * eigenen Datensatz unterschiebt.
   */
  var fits = {};

  function curveFit(name, curve) {
    var cached = fits[name];
    if (cached && cached.curve === curve) return cached.fit;
    var fit = fitCurve(curve);
    fits[name] = { curve: curve, fit: fit };
    return fit;
  }

  /** Herkunftszeichen im Datensatz in sprechende Namen uebersetzen. */
  var SOURCE_NAMES = { w: "table", e: "derived", x: "conflict" };

  /**
   * P1-Belohnung einer Stufe bestimmen.
   * @param {object} building Eintrag aus CIPHER_DATA.buildings
   * @param {number} level Stufe (1-basiert)
   * @param {object} curves CIPHER_DATA.curves
   * @param {Object<string, number>} overrides Eigene Eintraege, Schluessel "id:level"
   * @returns {{value: number|null, source: string|null}}
   */
  function p1Reward(building, level, curves, overrides) {
    overrides = overrides || {};
    var key = building.id + ":" + level;

    if (overrides[key] > 0) return { value: overrides[key], source: "manual" };
    if (!building.curve) return { value: null, source: null };

    var curve = curves[building.curve];
    if (!curve) return { value: null, source: null };

    var value = curve.p1[level - 1];
    // "w" = Wiki, "e" = geschaetzt, "x" = widerspruechlich
    if (value != null) return { value: value, source: SOURCE_NAMES[curve.source[level - 1]] || null };

    // Jenseits der gespeicherten Stufen: die Kurve des Zeitalters weiterrechnen.
    var fit = curveFit(building.curve, curve);
    if (!fit) return { value: null, source: null };
    return { value: roundTo5(fit.factor * Math.pow(level, fit.exponent)), source: "derived" };
  }

  /**
   * Den Foerderplan fuer eine Stufe berechnen.
   *
   * Idee: Die Plaetze werden von P1 abwaerts vergeben. Bevor ein Platz
   * angeboten wird, muss der Fortschritt so weit sein, dass niemand mehr
   * ueberbieten kann — genau das ist der Betrag unter "vorher sichern".
   * Was am Ende uebrig bleibt, zahlst du selbst ein und levelst damit.
   *
   * Jeder Platz kann seinen eigenen Arche-Faktor haben, denn der Bonus
   * gehoert dem Foerderer, nicht dem Bauwerk. Die Absicherung traegt das
   * ohne Zutun: `needed` rechnet mit der Einzahlung *dieses* Platzes, ein
   * schwaecherer Faktor bedeutet also automatisch mehr vorher sichern —
   * was stimmt, weil ein kleinerer Beitrag leichter zu ueberbieten ist.
   *
   * @param {object} options
   * @param {number} options.total Gesamtkosten der Stufe
   * @param {number} options.p1 Belohnung fuer Platz 1
   * @param {number} options.factor Arche-Faktor in Prozent, gilt fuer jeden
   *   Platz ohne eigenen Wert
   * @param {Array<number|null>} [options.factors] Faktor je Platz; null oder
   *   fehlend heisst: options.factor gilt
   * @param {boolean[]} options.enabled Welche Plaetze angeboten werden (Laenge 5)
   * @returns {{
   *   rows: Array<{slot:number, reward:number, factor:number, contribution:number,
   *                offered:boolean, secure:number|null, tooTight:boolean}>,
   *   total:number, external:number, ownShare:number,
   *   upfront:number, remainder:number, anyTooTight:boolean
   * }}
   */
  function buildPlan(options) {
    var total = options.total;
    var factors = options.factors || [];
    var enabled = options.enabled;

    /** Der Faktor, der fuer diesen Platz tatsaechlich gilt. */
    function factorFor(index) {
      return factors[index] != null ? factors[index] : options.factor;
    }

    var remaining = total;
    var upfront = 0; // Was du zahlst, bevor alle Plaetze vergeben sind
    var external = 0; // Was die Foerderer zusammen einzahlen
    var anyTooTight = false;

    var rows = rewardChain(options.p1).map(function (reward, index) {
      var pay = contribution(reward, factorFor(index));
      var row = {
        slot: index + 1,
        reward: reward,
        factor: factorFor(index),
        contribution: pay,
        offered: Boolean(enabled[index]) && reward > 0,
        secure: null,
        tooTight: false
      };
      if (!row.offered) return row;

      // Ein Platz ist sicher, sobald hoechstens noch 2x seine Einzahlung offen
      // ist: nach der Einzahlung bleibt dann genau `pay` uebrig, ein Nachzuegler
      // kann also hoechstens gleichziehen, nie ueberbieten.
      //
      // Das setzt die Spielregel voraus, dass bei gleichem Betrag der fruehere
      // Foerderer den Platz behaelt. So ist es in Forge of Empires; wuerde das
      // Spiel Gleichstand anders aufloesen, muesste hier `2 * pay - 1` stehen.
      var needed = Math.max(0, remaining - 2 * pay);
      if (remaining - needed < pay) {
        // Der Platz passt rechnerisch nicht mehr in die verbleibende Stufe.
        row.offered = false;
        row.tooTight = true;
        anyTooTight = true;
        return row;
      }

      upfront += needed;
      remaining -= needed;
      row.secure = needed;
      remaining -= pay;
      external += pay;
      return row;
    });

    return {
      rows: rows,
      total: total,
      external: external,
      ownShare: upfront + remaining,
      upfront: upfront,
      remainder: remaining,
      anyTooTight: anyTooTight
    };
  }

  /**
   * Die Zeile fuer den Foerderchat bauen.
   * @param {object} plan Ergebnis von buildPlan
   * @param {string} heading Name und Bauwerk, z. B. "Dani Arche"
   * @param {boolean} withPoints Einzahlungsbetraege mit ausgeben
   * @returns {string} Leerer String, wenn kein Platz angeboten wird
   */
  function chatLine(plan, heading, withPoints) {
    var offered = plan.rows.filter(function (row) { return row.offered; }).reverse();
    if (!offered.length) return "";
    var parts = offered.map(function (row) {
      return withPoints ? "P" + row.slot + "(" + row.contribution + ")" : "P" + row.slot;
    });
    return [heading, parts.join(" ")].filter(Boolean).join(" ");
  }

  return {
    SLOTS: SLOTS,
    GROWTH: GROWTH,
    roundTo5: roundTo5,
    rewardChain: rewardChain,
    contribution: contribution,
    totalCost: totalCost,
    p1Reward: p1Reward,
    fitCurve: fitCurve,
    buildPlan: buildPlan,
    chatLine: chatLine
  };
});
