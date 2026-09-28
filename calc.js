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
 *   Sichern        Was du selbst vorab einzahlst, damit der Platz nicht
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
   * bestimmen, die moeglichst viele davon auf den Punkt trifft — alle, wenn
   * es eine solche Kurve gibt (siehe exactFit).
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
    return fitPoints(curvePoints(curve));
  }

  /**
   * Die echten Werte einer Kurve als Stuetzpunkte [Stufe, Belohnung].
   * Echt heisst: aus dem Wiki ("w"). Geschaetzte Werte stammen selbst aus
   * dem Fit, sie koennten ihn nicht pruefen.
   * @param {object} curve
   * @returns {Array<number[]>}
   */
  function curvePoints(curve) {
    var points = [];
    for (var i = 0; i < curve.p1.length; i++) {
      if (curve.source[i] === "w" && curve.p1[i] > 0) points.push([i + 1, curve.p1[i]]);
    }
    return points;
  }

  /**
   * Der eigentliche Fit ueber eine Liste von Stuetzpunkten.
   * @param {Array<number[]>} points
   * @returns {{factor: number, exponent: number}|null}
   */
  function fitPoints(points) {
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
    if (best.miss === 0) return best;
    return exactFit(use) || best;
  }

  /**
   * Die Kurve suchen, die jeden Stuetzpunkt trifft, wo das Raster keine hat.
   *
   * Das Raster oben geht in Schritten von 0,0005 und nimmt den Median als
   * Faktor. Liegen die Stuetzpunkte weit auseinander — etwa ein paar im
   * Spiel abgelesene Stufen zwischen 40 und 212 —, ist der Bereich, der alle
   * trifft, oft schmaler als ein Rasterschritt, und das Raster greift an ihm
   * vorbei. Hier wird er direkt gesucht.
   *
   * Ein Punkt [l, v] wird getroffen, wenn v - 2,5 <= C * l^e < v + 2,5 ist,
   * logarithmisch also ln(v - 2,5) - e ln l <= ln C < ln(v + 2,5) - e ln l.
   * Der Spielraum fuer ln C, kleinste Obergrenze minus groesste Untergrenze,
   * ist als Minimum minus Maximum linearer Funktionen in e konkav — eine
   * Ternaersuche findet sein Maximum. Ist er dort positiv, gibt es die
   * Kurve, und genommen wird die mit dem groessten Abstand zu allen
   * Rundungsgrenzen: Exponent am Maximum, ln C in der Mitte des Spielraums.
   *
   * Greift nur, wenn das Raster Punkte verfehlt. Trifft es alle, bleibt es
   * bei seinem Ergebnis nahe am ueblichen Exponenten; eine andere Kurve aus
   * dem gleichwertigen Bereich wuerde die Schaetzungen nur grundlos
   * verschieben. Dieselbe Rechnung steht in tools/import.html.
   *
   * @param {Array<number[]>} use Stuetzpunkte [Stufe, Belohnung]
   * @returns {{factor: number, exponent: number, miss: number, distance: number}|null}
   */
  function exactFit(use) {
    function room(exponent) {
      var low = -Infinity;
      var high = Infinity;
      for (var i = 0; i < use.length; i++) {
        var shift = exponent * Math.log(use[i][0]);
        low = Math.max(low, Math.log(use[i][1] - 2.5) - shift);
        high = Math.min(high, Math.log(use[i][1] + 2.5) - shift);
      }
      return { low: low, high: high };
    }

    var from = EXPONENT_MIN;
    var to = EXPONENT_MAX;
    for (var step = 0; step < 200; step++) {
      var left = from + (to - from) / 3;
      var right = to - (to - from) / 3;
      var a = room(left);
      var b = room(right);
      if (a.high - a.low < b.high - b.low) from = left;
      else to = right;
    }

    var exponent = (from + to) / 2;
    var bounds = room(exponent);
    if (!(bounds.low < bounds.high)) return null;

    var factor = Math.exp((bounds.low + bounds.high) / 2);
    for (var i = 0; i < use.length; i++) {
      if (roundTo5(factor * Math.pow(use[i][0], exponent)) !== use[i][1]) return null;
    }
    return { exponent: exponent, factor: factor, miss: 0, distance: Math.abs(exponent - DEFAULT_EXPONENT) };
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

  /**
   * Ausblendtest: Wie gut trifft die Kurve Stufen, die sie nicht kennt?
   *
   * Es wird jeweils nur der untere Teil der echten Werte gefittet und der
   * Rest vorhergesagt — genau die Lage, in der p1Reward oberhalb des
   * Datensatzes steckt. Die Schnitte liegen bei diesen Anteilen der
   * hoechsten belegten Stufe.
   */
  var RELIABILITY_CUTS = [0.5, 0.65, 0.8];

  /** Mit weniger Stuetzpunkten unterhalb des Schnitts taugt der Fit nichts. */
  var RELIABILITY_MIN_FIT = 20;

  /** Unter so vielen echten Werten laesst sich nichts sinnvoll ausblenden. */
  var RELIABILITY_MIN_POINTS = 40;

  /**
   * Was noch als Treffer gilt. Belohnungen sind auf 5 gerundet; eine
   * Abweichung von genau einer Rundungsstufe ist kein Irrtum der Kurve,
   * sondern das Rauschen des Rundens.
   */
  var RELIABILITY_TOLERANCE = 5;

  /**
   * Den Ausblendtest auf einer Kurve durchfuehren.
   * @param {object} curve Eintrag aus CIPHER_DATA.curves
   * @returns {{samples: number, misses: number, worst: number}|null}
   *   null heisst: zu wenige echte Werte, die Kurve laesst sich nicht pruefen.
   */
  function measureReliability(curve) {
    var points = curvePoints(curve);
    if (points.length < RELIABILITY_MIN_POINTS) return null;

    var top = points[points.length - 1][0];
    var samples = 0;
    var misses = 0;
    var worst = 0;

    RELIABILITY_CUTS.forEach(function (share) {
      var cut = Math.round(top * share);
      var known = points.filter(function (point) { return point[0] <= cut; });
      if (known.length < RELIABILITY_MIN_FIT) return;

      var fit = fitPoints(known);
      if (!fit) return;

      points.forEach(function (point) {
        if (point[0] <= cut) return;
        samples++;
        var off = Math.abs(roundTo5(fit.factor * Math.pow(point[0], fit.exponent)) - point[1]);
        if (off > worst) worst = off;
        if (off > RELIABILITY_TOLERANCE) misses++;
      });
    });

    return samples ? { samples: samples, misses: misses, worst: worst } : null;
  }

  /**
   * Das zuletzt gemessene Ergebnis je Zeitalter.
   *
   * Der Ausblendtest legt mehrere Fits an und ist damit ein Vielfaches
   * teurer als curveFit — gerechnet wird er darum einmal. Der Vergleich
   * auf das Kurvenobjekt haelt den Zwischenspeicher ehrlich, wenn ein Test
   * einen eigenen Datensatz unterschiebt.
   */
  var reliabilities = {};

  function curveReliability(name, curve) {
    var cached = reliabilities[name];
    if (cached && cached.curve === curve) return cached.result;
    var result = measureReliability(curve);
    reliabilities[name] = { curve: curve, result: result };
    return result;
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
   * Plaetze markieren, die einen Platz ueber sich ueberholen: kleinere
   * Belohnung, aber hoehere Einzahlung.
   *
   * Aus Faktoren im zulaessigen Bereich kann das nicht entstehen — genau das
   * haelt der Einheitentest ueber den ganzen Datensatz fest, und deshalb
   * braucht der Faktorbereich keine Warnung. Ein getippter Betrag kennt die
   * Schranke aber nicht: wer P4 mit 500 eintraegt, waehrend P3 bei 300 steht,
   * hat eine Reihenfolge gebaut, die das Spiel so nicht vergibt. Gezaehlt
   * werden nur echt kleinere Belohnungen; zwei gleich hohe (P1 = P2 = 5 nach
   * dem Runden) trennt ohnehin nur der Faktor.
   *
   * @param {Array<object>} rows
   * @returns {boolean} ob mindestens eine Zeile ueberholt
   */
  function markOutOfOrder(rows) {
    var any = false;
    rows.forEach(function (row, index) {
      for (var above = 0; above < index; above++) {
        if (rows[above].reward > row.reward && rows[above].contribution < row.contribution) {
          row.outOfOrder = true;
          any = true;
          return;
        }
      }
    });
    return any;
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
   * Steht P1 nicht fest, rechnet die Absicherung vorsichtiger: options.p1Secure
   * gibt die kleinere P1-Belohnung vor, aus der `needed` seine Einzahlungen
   * ableitet. Belohnung und angezeigte Einzahlung kommen weiter aus options.p1.
   *
   * @param {object} options
   * @param {number} options.total Gesamtkosten der Stufe
   * @param {number} options.p1 Belohnung fuer Platz 1
   * @param {number} [options.p1Secure] Die P1-Belohnung, mit der die Absicherung
   *   rechnet; fehlt sie oder ist sie null, gilt options.p1. Ein hergeleitetes
   *   P1 liegt nie zu niedrig, aber gelegentlich 5 FP zu hoch — und zu hoch ist
   *   die gefaehrliche Richtung, weil `needed` dann zu klein ausfaellt und der
   *   Platz ueberbietbar bleibt. Mit dem kleineren Wert wird jeder Platz weiter
   *   vorgesichert. Ausnahme: Faellt durch den Zuschlag ein Platz heraus, der
   *   sonst angeboten wuerde, gilt der Plan ohne Zuschlag — ein Platz ohne
   *   Zuschlag ist mehr wert als gar kein Platz.
   * @param {number} options.factor Arche-Faktor in Prozent, gilt fuer jeden
   *   Platz ohne eigenen Wert
   * @param {Array<number|null>} [options.factors] Faktor je Platz; null oder
   *   fehlend heisst: options.factor gilt
   * @param {Array<number|null>} [options.payments] Fester Betrag je Platz, der
   *   die aus dem Faktor gerechnete Einzahlung ersetzt. Gedacht fuer einen
   *   Foerderer, dessen Einzahlung du kennst statt sie zu schaetzen — etwa
   *   weil er den Platz schon genommen hat. Ein fester Betrag ist von
   *   options.p1Secure unberuehrt: der Zuschlag gleicht die Unsicherheit einer
   *   hergeleiteten P1-Belohnung aus, eine abgelesene Zahl hat sie nicht.
   * @param {boolean[]} options.enabled Welche Plaetze angeboten werden (Laenge 5)
   * @param {boolean[]} [options.taken] Welche Plaetze schon vergeben sind.
   *   Ein vergebener Platz wird nicht mehr ausgeschrieben, bleibt aber in der
   *   Rechnung: seine Einzahlung zaehlt als Fremdkapital, seine Absicherung
   *   ist schon geleistet. Gilt nur fuer Plaetze, die auch `enabled` sind —
   *   wer einen Platz nicht anbietet, hat ihn auch nicht vergeben.
   * @param {number|null} [options.ownPaid] Was du selbst schon im Bauwerk hast.
   *   Fehlt die Zahl, nimmt der Plan an, dass du vor jedem vergebenen Platz
   *   der Reihe nach abgesichert hast. Mit der Zahl rechnet er vom Stand aus,
   *   der jetzt im Bauwerk ist: vergebene Plaetze sind mit ihrer Einzahlung
   *   drin, ohne dass davor etwas gesichert sein muss — so wie wenn P1 und P2
   *   eingezahlt haben, bevor du selbst etwas eingezahlt hast. Die offenen
   *   Plaetze werden von dort aus abgesichert, und zwar so, dass auch die
   *   vergebenen nicht mehr ueberboten werden koennen.
   * @returns {{
   *   rows: Array<{slot:number, reward:number, factor:number, contribution:number,
   *                offered:boolean, taken:boolean, secure:number|null,
   *                tooTight:boolean, fixed:boolean, outOfOrder:boolean}>,
   *   total:number, external:number, ownShare:number, ownPaid:number,
   *   upfront:number, upfrontOpen:number, remainder:number,
   *   anyTooTight:boolean, anyOutOfOrder:boolean
   * }}
   *   `upfront` ist die ganze Vorleistung, auch die vor schon vergebenen
   *   Plaetzen; `upfrontOpen` nur die, die fuer noch offene Plaetze aussteht.
   */
  function buildPlan(options) {
    var total = options.total;
    var factors = options.factors || [];
    var fixed = options.payments || [];
    var enabled = options.enabled;
    var taken = options.taken || [];
    var ownPaid = options.ownPaid != null && options.ownPaid >= 0 ? Math.floor(options.ownPaid) : null;

    /** Der Faktor, der fuer diesen Platz tatsaechlich gilt. */
    function factorFor(index) {
      return factors[index] != null ? factors[index] : options.factor;
    }

    /** Ob dieser Platz einen getippten Betrag hat statt eines gerechneten. */
    function isFixed(index) { return fixed[index] > 0; }

    /**
     * Die Einzahlungen aller fuenf Plaetze zu einer P1-Belohnung.
     * Ein fester Betrag gilt unveraendert — auch fuer die Absicherung, denn
     * er ist abgelesen und nicht aus der Belohnung hergeleitet.
     */
    function paymentsFor(p1) {
      return rewardChain(p1).map(function (reward, index) {
        return isFixed(index) ? Math.floor(fixed[index]) : contribution(reward, factorFor(index));
      });
    }

    // Was die Foerderer tatsaechlich einzahlen — das steht so im Plan.
    var payments = paymentsFor(options.p1);

    /**
     * Einen Plan rechnen, dessen Absicherung von `securePay` ausgeht.
     * @param {number[]} securePay Einzahlung je Platz, mit der `needed` rechnet
     */
    function planWith(securePay) {
      if (ownPaid != null) return planFromNow(securePay);
      var remaining = total;
      var upfront = 0; // Was du zahlst, bevor alle Plaetze vergeben sind
      var upfrontOpen = 0; // Davon der Teil fuer Plaetze, die noch offen sind
      var external = 0; // Was die Foerderer zusammen einzahlen
      var anyTooTight = false;

      var rows = rewardChain(options.p1).map(function (reward, index) {
        var pay = payments[index];
        var row = {
          slot: index + 1,
          reward: reward,
          factor: factorFor(index),
          contribution: pay,
          offered: Boolean(enabled[index]) && reward > 0,
          taken: false,
          secure: null,
          tooTight: false,
          fixed: isFixed(index),
          outOfOrder: false
        };
        if (!row.offered) return row;

        // Ein Platz ist sicher, sobald hoechstens noch 2x seine Einzahlung offen
        // ist: nach der Einzahlung bleibt dann genau `pay` uebrig, ein Nachzuegler
        // kann also hoechstens gleichziehen, nie ueberbieten.
        //
        // Das setzt die Spielregel voraus, dass bei gleichem Betrag der fruehere
        // Foerderer den Platz behaelt. So ist es in Forge of Empires; wuerde das
        // Spiel Gleichstand anders aufloesen, muesste hier `2 * pay - 1` stehen.
        var needed = Math.max(0, remaining - 2 * securePay[index]);
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

        // Ein vergebener Platz ist durchgerechnet wie ein angebotener — nur
        // ausgeschrieben wird er nicht mehr, und seine Absicherung ist
        // schon eingezahlt.
        if (taken[index]) {
          row.offered = false;
          row.taken = true;
        } else {
          upfrontOpen += needed;
        }
        return row;
      });

      return {
        rows: rows,
        total: total,
        external: external,
        ownShare: upfront + remaining,
        ownPaid: 0,
        upfront: upfront,
        upfrontOpen: upfrontOpen,
        remainder: remaining,
        anyTooTight: anyTooTight,
        anyOutOfOrder: markOutOfOrder(rows)
      };
    }

    /**
     * Den Plan vom Stand aus rechnen, der jetzt im Bauwerk ist.
     *
     * Vergebene Plaetze sind mit ihrer Einzahlung drin, dazu das, was du
     * selbst schon eingezahlt hast. Ein vergebener Platz ist sicher, sobald
     * hoechstens noch seine Einzahlung offen ist — solange mehr offen ist,
     * koennte jemand an ihm vorbeiziehen. Der erste offene Platz sichert
     * deshalb nicht nur sich selbst, sondern auch die vergebenen ab.
     * @param {number[]} securePay Einzahlung je Platz, mit der `needed` rechnet
     */
    function planFromNow(securePay) {
      var rows = rewardChain(options.p1).map(function (reward, index) {
        var inPlay = Boolean(enabled[index]) && reward > 0;
        return {
          slot: index + 1,
          reward: reward,
          factor: factorFor(index),
          contribution: payments[index],
          offered: inPlay && !taken[index],
          taken: inPlay && Boolean(taken[index]),
          secure: null,
          tooTight: false,
          fixed: isFixed(index),
          outOfOrder: false
        };
      });

      var external = 0;
      var cap = Infinity; // Hoechstens so viel darf offen sein, damit kein vergebener Platz faellt
      rows.forEach(function (row) {
        if (!row.taken) return;
        external += row.contribution;
        row.secure = 0;
        cap = Math.min(cap, row.contribution);
      });

      var remaining = Math.max(0, total - ownPaid - external);
      var upfrontOpen = 0;
      var anyTooTight = false;

      rows.forEach(function (row, index) {
        if (!row.offered) return;
        var pay = row.contribution;
        // Wie im Plan ohne Stand: nach der Einzahlung bleibt hoechstens `pay`
        // offen. Dazu darf nie mehr offen sein als der kleinste vergebene
        // Platz eingezahlt hat.
        var needed = Math.max(0, remaining - Math.min(2 * securePay[index], cap));
        if (remaining - needed < pay) {
          row.offered = false;
          row.tooTight = true;
          anyTooTight = true;
          return;
        }
        upfrontOpen += needed;
        remaining -= needed + pay;
        row.secure = needed;
        external += pay;
      });

      return {
        rows: rows,
        total: total,
        external: external,
        ownShare: total - external,
        ownPaid: ownPaid,
        upfront: ownPaid + upfrontOpen,
        upfrontOpen: upfrontOpen,
        remainder: remaining,
        anyTooTight: anyTooTight,
        anyOutOfOrder: markOutOfOrder(rows)
      };
    }

    var p1Secure = options.p1Secure != null ? options.p1Secure : options.p1;
    if (p1Secure === options.p1) return planWith(payments);

    var careful = planWith(paymentsFor(p1Secure));
    if (!careful.anyTooTight) return careful;

    // Lieber ein Platz ohne Zuschlag als gar kein Platz: kostet die
    // vorsichtigere Absicherung einen Platz, der sonst angeboten wuerde,
    // gilt der Plan ohne Zuschlag.
    var plain = planWith(payments);
    var lost = careful.rows.some(function (row, index) {
      var before = plain.rows[index];
      return (before.offered || before.taken) && !(row.offered || row.taken);
    });
    return lost ? plain : careful;
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
    curveReliability: curveReliability,
    buildPlan: buildPlan,
    chatLine: chatLine
  };
});
