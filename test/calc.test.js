/**
 * Einheitentests fuer den Rechenkern.
 * Ausfuehren mit: npm test
 */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const Calc = require("../calc.js");
const DATA = require("../data.js");

const arc = DATA.buildings.find((b) => b.id === "The_Arc");
const observatory = DATA.buildings.find((b) => b.id === "Observatory");
const siphon = DATA.buildings.find((b) => b.id === "Shattered_Horizon_Siphon");

const allOn = [true, true, true, true, true];

test("roundTo5 rundet kaufmaennisch auf Vielfache von 5", () => {
  assert.equal(Calc.roundTo5(0), 0);
  assert.equal(Calc.roundTo5(2), 0);
  assert.equal(Calc.roundTo5(2.5), 5, "genau die Haelfte wird aufgerundet");
  assert.equal(Calc.roundTo5(7.4), 5);
  assert.equal(Calc.roundTo5(7.5), 10);
  assert.equal(Calc.roundTo5(100), 100);
});

test("rewardChain leitet P2 bis P5 aus P1 ab", () => {
  // 200 -> 100 -> 35 (100/3 = 33,3 -> 35) -> 10 (35/4 = 8,75 -> 10) -> 0 (10/5 = 2 -> 0)
  assert.deepEqual(Calc.rewardChain(200), [200, 100, 35, 10, 0]);
  assert.deepEqual(Calc.rewardChain(0), [0, 0, 0, 0, 0]);
  assert.equal(Calc.rewardChain(555).length, Calc.SLOTS);
});

test("contribution rundet mit dem Arche-Faktor ab", () => {
  assert.equal(Calc.contribution(100, 190), 190);
  assert.equal(Calc.contribution(100, 185), 185);
  // 35 * 1,90 = 66,5 -> das Spiel rechnet mit halben Punkten und rundet ab
  assert.equal(Calc.contribution(35, 190), 67);
  assert.equal(Calc.contribution(0, 200), 0);
});

test("totalCost liest die Stufen 1 bis 10 aus der Tabelle", () => {
  for (let level = 1; level <= 10; level++) {
    const result = Calc.totalCost(arc, level, {});
    assert.equal(result.value, arc.costs[level - 1]);
    assert.equal(result.source, "table");
  }
});

test("totalCost rechnet ab Stufe 11 mit der Formel", () => {
  const result = Calc.totalCost(arc, 11, {});
  assert.equal(result.source, "formula");
  assert.equal(result.value, Math.ceil(arc.base * Math.pow(1.025, 11) - 1e-7));
  assert.ok(result.value > arc.costs[9], "Stufe 11 kostet mehr als Stufe 10");
});

test("totalCost waechst ueber die Stufen monoton", () => {
  let previous = 0;
  for (let level = 1; level <= arc.maxLevel; level++) {
    const value = Calc.totalCost(arc, level, {}).value;
    assert.ok(value >= previous, `Stufe ${level} darf nicht billiger sein als ${level - 1}`);
    previous = value;
  }
});

test("totalCost bevorzugt einen eigenen Eintrag", () => {
  const overrides = { "The_Arc:11": 12345 };
  const result = Calc.totalCost(arc, 11, overrides);
  assert.deepEqual(result, { value: 12345, source: "manual" });
  // Nachbarstufen bleiben unberuehrt
  assert.equal(Calc.totalCost(arc, 12, overrides).source, "formula");
});

test("totalCost meldet nichts, wenn Basiswert und Eintrag fehlen", () => {
  assert.deepEqual(Calc.totalCost(siphon, 20, {}), { value: null, source: null });
});

test("totalCost rechnet ohne Basiswert aus dem eigenen Eintrag hoch", () => {
  const overrides = { "Shattered_Horizon_Siphon:20": 2500 };

  const same = Calc.totalCost(siphon, 20, overrides);
  assert.deepEqual(same, { value: 2500, source: "manual" });

  const higher = Calc.totalCost(siphon, 25, overrides);
  assert.equal(higher.source, "derived");
  assert.equal(higher.from, 20);
  assert.equal(higher.value, Math.ceil((2500 / Math.pow(1.025, 20)) * Math.pow(1.025, 25) - 1e-7));
  assert.ok(higher.value > 2500);

  // Unterhalb von Stufe 11 wird nicht hochgerechnet
  assert.deepEqual(Calc.totalCost(siphon, 5, overrides), { value: null, source: null });
});

test("totalCost nimmt beim Hochrechnen den hoechsten eigenen Eintrag", () => {
  const overrides = {
    "Shattered_Horizon_Siphon:15": 1000,
    "Shattered_Horizon_Siphon:40": 9000,
    "Shattered_Horizon_Siphon:22": 3000,
    "The_Arc:60": 1 // anderes Bauwerk, darf nicht stoeren
  };
  assert.equal(Calc.totalCost(siphon, 50, overrides).from, 40);
});

test("p1Reward liest die Kurve des Zeitalters", () => {
  const result = Calc.p1Reward(observatory, 1, DATA.curves, {});
  assert.equal(result.value, DATA.curves["Ohne Zeitalter"].p1[0]);
  assert.equal(result.source, "table");
});

test("p1Reward kennzeichnet geschaetzte und widerspruechliche Stufen", () => {
  const curve = DATA.curves["Ohne Zeitalter"];
  const conflictLevel = curve.source.indexOf("x") + 1;
  assert.ok(conflictLevel > 0, "der Datensatz enthaelt mindestens eine widerspruechliche Stufe");
  assert.equal(Calc.p1Reward(observatory, conflictLevel, DATA.curves, {}).source, "conflict");
});

test("p1Reward rechnet oberhalb der bekannten Kurve weiter", () => {
  const curve = DATA.curves[observatory.curve];
  const last = curve.p1.length;
  const beyond = Calc.p1Reward(observatory, last + 1, DATA.curves, {});

  assert.equal(beyond.source, "derived", "jenseits der Kurve ist jeder Wert hergeleitet");
  assert.ok(beyond.value > curve.p1[last - 1], "die Belohnung waechst weiter");
  assert.equal(beyond.value % 5, 0, "Belohnungen sind durch 5 teilbar");

  // Der Sprung ueber die Kante darf nicht groesser sein als die Schritte davor.
  const step = curve.p1[last - 1] - curve.p1[last - 2];
  assert.ok(beyond.value - curve.p1[last - 1] <= step + 5, "die Kurve knickt an der Kante nicht");
});

test("die Kurve laeuft auch weit oberhalb der Daten monoton", () => {
  let previous = 0;
  for (let level = 200; level <= 1000; level += 50) {
    const value = Calc.p1Reward(observatory, level, DATA.curves, {}).value;
    assert.ok(value > previous, `Stufe ${level}: ${value} faellt gegenueber ${previous}`);
    previous = value;
  }
});

/**
 * Der Rechenkern legt denselben Fit an wie tools/import.html beim Erzeugen
 * des Datensatzes. Solange das stimmt, ist die Fortsetzung oberhalb der
 * Kurve nahtlos — und ein Auseinanderdriften der beiden Stellen faellt hier
 * auf, nicht erst in einem krummen Plan.
 */
test("der Fit reproduziert jeden geschaetzten Wert des Datensatzes", () => {
  let checked = 0;
  for (const [era, curve] of Object.entries(DATA.curves)) {
    const fit = Calc.fitCurve(curve);
    assert.ok(fit, `${era}: ohne Fit laesst sich nichts fortsetzen`);
    for (let index = 0; index < curve.p1.length; index++) {
      if (curve.source[index] !== "e") continue;
      checked++;
      assert.equal(
        Calc.roundTo5(fit.factor * Math.pow(index + 1, fit.exponent)), curve.p1[index],
        `${era} Stufe ${index + 1}: Laufzeit-Fit weicht vom Datensatz ab`);
    }
  }
  assert.ok(checked > 1000, `es wurden nur ${checked} geschaetzte Stufen geprueft`);
});

/**
 * Der Ausblendtest ist die Grundlage dafuer, wie laut die Oberflaeche einen
 * hochgerechneten Wert kommentiert. Er darf darum weder eine saubere Kurve
 * schlechtreden noch eine krumme durchwinken.
 */
test("curveReliability findet auf einer exakten Kurve keine Abweichung", () => {
  // Eine Kurve, die genau der Potenzfunktion folgt, die der Fit sucht.
  const levels = 120;
  const curve = { p1: [], source: "w".repeat(levels) };
  for (let level = 1; level <= levels; level++) {
    curve.p1.push(Calc.roundTo5(30 * Math.pow(level, 1.206)));
  }

  const result = Calc.curveReliability("Prueffall exakt", curve);
  assert.ok(result, "120 echte Werte reichen zum Pruefen");
  assert.ok(result.samples > 50, `zu wenige Proben: ${result.samples}`);
  assert.equal(result.misses, 0, "eine exakte Kurve wird auch ausgeblendet getroffen");
  // Mehr als eine Rundungsstufe darf dabei nirgends herauskommen: der
  // Faktor wird aus bereits gerundeten Werten geschaetzt, das reicht als
  // ganze Unschaerfe.
  assert.ok(result.worst <= 5, `groesste Abweichung war ${result.worst} FP`);
});

test("curveReliability schweigt, wo zu wenige echte Werte stehen", () => {
  const curve = { p1: [], source: "w".repeat(30) };
  for (let level = 1; level <= 30; level++) curve.p1.push(Calc.roundTo5(30 * Math.pow(level, 1.206)));
  assert.equal(Calc.curveReliability("Prueffall kurz", curve), null);

  // Geschaetzte Werte zaehlen nicht mit: sie stammen selbst aus dem Fit.
  const guessed = { p1: [], source: "e".repeat(120) };
  for (let level = 1; level <= 120; level++) guessed.p1.push(Calc.roundTo5(30 * Math.pow(level, 1.206)));
  assert.equal(Calc.curveReliability("Prueffall geschaetzt", guessed), null);
});

test("curveReliability merkt sich das Ergebnis je Kurvenobjekt", () => {
  const curve = DATA.curves["Bronzezeit"];
  assert.equal(Calc.curveReliability("Bronzezeit", curve), Calc.curveReliability("Bronzezeit", curve));
});

test("der Ausblendtest trennt verlaessliche von wackligen Zeitaltern", () => {
  // Diese beiden Zeitalter traegt auch der Browsertest: in der Bronzezeit
  // steht ueber der Wiki-Grenze kein Hinweis, in der Virtuellen Zukunft schon.
  const bronze = Calc.curveReliability("Bronzezeit", DATA.curves["Bronzezeit"]);
  assert.equal(bronze.misses, 0, "die Bronzezeit trifft jede ausgeblendete Stufe auf 5 FP genau");

  const virtual = Calc.curveReliability("Virtuelle Zukunft", DATA.curves["Virtuelle Zukunft"]);
  assert.ok(virtual.misses > 0, "die Virtuelle Zukunft tut das nicht");
  assert.ok(virtual.worst > 5, `groesste Abweichung war nur ${virtual.worst} FP`);

  // Jede gepruefte Kurve nennt entweder Zahlen oder gar nichts.
  for (const [era, curve] of Object.entries(DATA.curves)) {
    const result = Calc.curveReliability(era, curve);
    if (result === null) continue;
    assert.ok(result.samples > 0, `${era}: ein Ergebnis ohne Proben ist keines`);
    assert.ok(result.misses <= result.samples, `${era}: mehr Fehlschuesse als Proben`);
    assert.ok(result.worst >= 0);
  }
});

test("p1Reward bevorzugt einen eigenen Eintrag", () => {
  assert.deepEqual(
    Calc.p1Reward(observatory, 1, DATA.curves, { "Observatory:1": 25 }),
    { value: 25, source: "manual" }
  );
});

test("p1Reward meldet nichts ohne hinterlegte Kurve", () => {
  assert.deepEqual(Calc.p1Reward(siphon, 20, DATA.curves, {}), { value: null, source: null });
});

test("buildPlan verteilt die Gesamtkosten vollstaendig", () => {
  const plan = Calc.buildPlan({ total: 10000, p1: 800, factor: 190, enabled: allOn });
  assert.equal(plan.external + plan.ownShare, plan.total, "Fremd plus Eigenanteil ergibt die Gesamtkosten");
  assert.equal(plan.upfront + plan.remainder, plan.ownShare, "Eigenanteil zerfaellt in vorab und Rest");
  assert.equal(plan.rows.length, Calc.SLOTS);
});

test("buildPlan sichert jeden Platz gegen Ueberbieten ab", () => {
  const plan = Calc.buildPlan({ total: 10000, p1: 800, factor: 190, enabled: allOn });
  let remaining = plan.total;
  for (const row of plan.rows) {
    if (!row.offered) continue;
    remaining -= row.secure;
    assert.ok(
      remaining <= 2 * row.contribution,
      `P${row.slot}: nach dem Vorabbetrag darf hoechstens die doppelte Einzahlung offen sein`
    );
    remaining -= row.contribution;
  }
  assert.equal(remaining, plan.remainder);
});

test("buildPlan laesst abgewaehlte Plaetze aus", () => {
  const plan = Calc.buildPlan({
    total: 10000,
    p1: 800,
    factor: 190,
    enabled: [true, false, true, false, false]
  });
  assert.deepEqual(plan.rows.map((row) => row.offered), [true, false, true, false, false]);
  assert.equal(plan.external + plan.ownShare, plan.total);
});

test("buildPlan bietet Plaetze ohne Belohnung nicht an", () => {
  // P5 faellt bei kleinem P1 auf 0 und ist damit kein Angebot wert
  const plan = Calc.buildPlan({ total: 5000, p1: 50, factor: 190, enabled: allOn });
  const zeroRows = plan.rows.filter((row) => row.reward === 0);
  assert.ok(zeroRows.length > 0);
  assert.ok(zeroRows.every((row) => !row.offered));
});

test("buildPlan markiert Plaetze, die nicht mehr hineinpassen", () => {
  // Winzige Stufe, riesige Belohnung: nach P1 ist kein Platz mehr frei
  const plan = Calc.buildPlan({ total: 100, p1: 400, factor: 190, enabled: allOn });
  assert.ok(plan.anyTooTight);
  assert.ok(plan.rows.some((row) => row.tooTight));
  assert.equal(plan.external + plan.ownShare, plan.total);
});

test("buildPlan kommt ohne angebotene Plaetze aus", () => {
  const plan = Calc.buildPlan({
    total: 10000,
    p1: 800,
    factor: 190,
    enabled: [false, false, false, false, false]
  });
  assert.equal(plan.external, 0);
  assert.equal(plan.upfront, 0);
  assert.equal(plan.ownShare, 10000);
  assert.equal(plan.remainder, 10000);
  assert.ok(!plan.anyTooTight);
});

test("buildPlan: ein hoeherer Faktor macht Foerdern lohnender", () => {
  const low = Calc.buildPlan({ total: 10000, p1: 800, factor: 185, enabled: allOn });
  const high = Calc.buildPlan({ total: 10000, p1: 800, factor: 200, enabled: allOn });
  assert.ok(high.external > low.external, "mehr Arche-Bonus bringt mehr Fremdkapital");
  assert.ok(high.ownShare < low.ownShare);
});

test("buildPlan bleibt ueber den gesamten Datensatz in sich stimmig", () => {
  let checked = 0;
  for (const building of DATA.buildings) {
    for (let level = 1; level <= building.maxLevel; level += 13) {
      const total = Calc.totalCost(building, level, {}).value;
      const p1 = Calc.p1Reward(building, level, DATA.curves, {}).value;
      if (total == null || p1 == null) continue;

      for (const factor of [185, 190, 195, 200]) {
        const plan = Calc.buildPlan({ total, p1, factor, enabled: allOn });
        checked++;

        assert.equal(plan.external + plan.ownShare, plan.total,
          `${building.id} Stufe ${level} Faktor ${factor}: Summe stimmt nicht`);
        assert.ok(plan.ownShare >= 0 && plan.external >= 0);
        assert.ok(plan.remainder >= 0, "es darf nie mehr verteilt werden als vorhanden");
        assert.ok(plan.upfront >= 0);

        for (const row of plan.rows) {
          assert.ok(row.reward >= 0);
          assert.ok(row.contribution >= 0);
          if (row.offered) assert.ok(row.secure >= 0);
          else assert.equal(row.secure, null);
        }
      }
    }
  }
  assert.ok(checked > 500, `es sollten viele Kombinationen geprueft werden, waren aber ${checked}`);
});

test("chatLine listet die Plaetze von hinten nach vorne", () => {
  const plan = Calc.buildPlan({ total: 10000, p1: 800, factor: 190, enabled: allOn });
  const plain = Calc.chatLine(plan, "Dani Arche", false);
  assert.match(plain, /^Dani Arche P5 P4 P3 P2 P1$/);

  const withPoints = Calc.chatLine(plan, "Dani Arche", true);
  assert.match(withPoints, /^Dani Arche P5\(\d+\) P4\(\d+\) P3\(\d+\) P2\(\d+\) P1\(\d+\)$/);
});

test("chatLine kommt ohne Namen aus und bleibt bei leerem Plan leer", () => {
  const plan = Calc.buildPlan({ total: 10000, p1: 800, factor: 190, enabled: [true, false, false, false, false] });
  assert.equal(Calc.chatLine(plan, "Arche", false), "Arche P1");
  assert.equal(Calc.chatLine(plan, "", false), "P1");

  const empty = Calc.buildPlan({ total: 10000, p1: 800, factor: 190, enabled: [false, false, false, false, false] });
  assert.equal(Calc.chatLine(empty, "Arche", false), "");
});

// ---------------------------------------------------------- Faktor je Platz

test("fuenf gleiche Faktoren ergeben exakt den Plan des einen Faktors", () => {
  // Die wichtigste Zusicherung des Umbaus: wer die Plaetze nicht einzeln
  // einstellt, bekommt bis auf das letzte Feld dasselbe wie vorher.
  let compared = 0;

  for (const building of DATA.buildings) {
    for (const level of [1, 5, 10, 11, 20, 40, 63, 80, 120, 200]) {
      if (level > building.maxLevel) continue;
      const total = Calc.totalCost(building, level, {}).value;
      const p1 = Calc.p1Reward(building, level, DATA.curves, {}).value;
      if (total == null || p1 == null) continue;

      for (const factor of [180, 185, 190, 195, 200]) {
        const einer = Calc.buildPlan({ total, p1, factor, enabled: allOn });
        const fuenf = Calc.buildPlan({
          total, p1, factor,
          factors: [factor, factor, factor, factor, factor],
          enabled: allOn
        });
        assert.deepEqual(fuenf, einer,
          `${building.id} Stufe ${level} Faktor ${factor}: Plaene weichen ab`);
        compared++;
      }
    }
  }

  assert.ok(compared > 1000, `zu wenige Vergleiche: ${compared}`);
});

test("fehlende Eintraege in factors fallen auf den Standardfaktor zurueck", () => {
  const argument = { total: 10000, p1: 800, factor: 190, enabled: allOn };
  const voll = Calc.buildPlan(argument);

  // null, undefined und ein zu kurzes Feld bedeuten alle "nimm den Standard"
  for (const factors of [[null, null, null, null, null], [], [null], undefined]) {
    assert.deepEqual(Calc.buildPlan({ ...argument, factors }), voll,
      `factors=${JSON.stringify(factors)} haette den Standard nehmen muessen`);
  }
});

test("ein eigener Faktor wirkt nur auf seinen Platz und die Plaetze darunter", () => {
  const argument = { total: 10000, p1: 800, factor: 190, enabled: allOn };
  const gleich = Calc.buildPlan(argument);
  const p3Schwach = Calc.buildPlan({ ...argument, factors: [null, null, 180, null, null] });

  // P1 und P2 stehen vor P3 und bleiben unberuehrt
  assert.equal(p3Schwach.rows[0].contribution, gleich.rows[0].contribution);
  assert.equal(p3Schwach.rows[0].secure, gleich.rows[0].secure);
  assert.equal(p3Schwach.rows[1].contribution, gleich.rows[1].contribution);
  assert.equal(p3Schwach.rows[1].secure, gleich.rows[1].secure);

  // P3 selbst zahlt weniger
  assert.ok(p3Schwach.rows[2].contribution < gleich.rows[2].contribution);

  // Und der Eigenanteil steigt um genau das, was P3 weniger einzahlt —
  // die Plaetze darunter verschieben sich, die Summe bleibt aufgegangen.
  assert.equal(p3Schwach.external + p3Schwach.ownShare, p3Schwach.total);
  assert.ok(p3Schwach.ownShare > gleich.ownShare);
});

test("ein schwaecherer Faktor verlangt mehr vorher zu sichern", () => {
  // Kein Zufall, sondern die Formel: needed = remaining - 2 * pay. Wer
  // weniger einzahlt, ist leichter zu ueberbieten und braucht mehr Vorlauf.
  const argument = { total: 10000, p1: 800, factor: 200, enabled: allOn };
  const stark = Calc.buildPlan(argument);
  const schwach = Calc.buildPlan({ ...argument, factors: [180, null, null, null, null] });

  assert.ok(schwach.rows[0].contribution < stark.rows[0].contribution);
  assert.ok(schwach.rows[0].secure > stark.rows[0].secure,
    "P1 mit schwaecherer Arche muss weiter vorgesichert werden");
});

test("der Plan nennt zu jedem Platz den Faktor, mit dem er gerechnet wurde", () => {
  const plan = Calc.buildPlan({
    total: 10000, p1: 800, factor: 190,
    factors: [200, null, 180, null, null],
    enabled: allOn
  });
  assert.deepEqual(plan.rows.map((row) => row.factor), [200, 190, 180, 190, 190]);
});

// ------------------------------------------------------- Gleichstand-Regel

test("nach dem Sichern bleibt genau eine Einzahlung offen — nicht weniger, nicht mehr", () => {
  // Die Absicherung rechnet needed = remaining − 2·pay. Sie verlaesst sich
  // darauf, dass bei gleichem Betrag der fruehere Foerderer den Platz
  // behaelt (so ist es im Spiel). Ein Nachzuegler darf also gleichziehen,
  // aber nie darueber hinaus kommen. Dieser Test haelt fest, dass die
  // Formel genau diesen Rand trifft — wer sie "sicherer" machen will,
  // aendert damit bewusst die Annahme.
  const plan = Calc.buildPlan({ total: 10000, p1: 800, factor: 190, enabled: allOn });

  let remaining = plan.total;
  for (const row of plan.rows) {
    if (!row.offered) continue;
    remaining -= row.secure;
    if (row.secure > 0) {
      // Vor der Einzahlung sind genau 2·pay offen …
      assert.equal(remaining, 2 * row.contribution, `P${row.slot}: vor der Einzahlung`);
    }
    remaining -= row.contribution;
    // … und danach hoechstens noch pay: Gleichstand moeglich, Ueberbieten nicht.
    assert.ok(remaining <= row.contribution, `P${row.slot}: nach der Einzahlung bleiben ${remaining} offen`);
  }
  assert.equal(remaining, plan.remainder);
});
