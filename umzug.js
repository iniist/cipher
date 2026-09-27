/*!
 * cipher — Umzug auf die eigene Domain
 *
 * Laeuft nur unter der alten Adresse cipher-calc.netlify.app. Browser trennen
 * den localStorage je Adresse: was dort gespeichert ist (Favoriten, eigene
 * Werte, Sammlung, Einstellungen), saehe die neue Adresse nie. Darum liest
 * dieses Skript die cipher-Eintraege und haengt sie beim Weiterleiten hinter
 * das "#" der neuen Adresse. Der Teil hinter dem "#" wird nie an einen Server
 * geschickt; app.js uebernimmt ihn dort und entfernt ihn sofort wieder.
 *
 * Mitgenommen wird nur zur Startseite. Der Rundgang und die Rechtsseiten
 * werten nichts aus; wer dort landet, nimmt die Daten beim naechsten Aufruf
 * des Rechners unter der alten Adresse mit — gespeichert bleiben sie ja.
 */
(function () {
  "use strict";

  var TARGET = "https://foe-foerderrechner.com";

  /** Nur diese Eintraege gehoeren cipher (lgr- ist der Vorgaenger). */
  var PREFIXES = ["cipher:", "lgr-"];

  /** Pfade, unter denen der Rechner steht und die Daten auswertet. */
  var CALCULATOR = ["/", "/index.html", "/umzug.html"];

  function collect() {
    var data = {};
    var any = false;
    try {
      var storage = window.localStorage;
      for (var i = 0; i < storage.length; i++) {
        var key = storage.key(i);
        var own = PREFIXES.some(function (prefix) { return key.indexOf(prefix) === 0; });
        if (!own) continue;
        data[key] = storage.getItem(key);
        any = true;
      }
    } catch (error) {
      // Speicher gesperrt: dann gibt es auch nichts mitzunehmen.
    }
    return any ? data : null;
  }

  var path = window.location.pathname;
  var calculator = CALCULATOR.indexOf(path) >= 0;
  var target = TARGET + (path === "/umzug.html" ? "/" : path) + window.location.search;

  var data = calculator ? collect() : null;
  target += data
    ? "#umzug=" + encodeURIComponent(JSON.stringify({ v: 1, d: data }))
    : window.location.hash;

  window.location.replace(target);
})();
