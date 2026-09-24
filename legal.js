/*!
 * cipher — Skript für Impressum und Datenschutz
 *
 * Nur zwei Aufgaben: den Themenwechsler bedienen (mit demselben Speicher-
 * schlüssel wie die Anwendung) und, sofern vorhanden, den Knopf zum Löschen
 * aller lokal gemerkten Daten.
 */
(function (window, document) {
  "use strict";

  var STATE_KEY = "cipher:state";
  var CIPHER_KEYS = ["cipher:state", "cipher:favorites", "cipher:totals", "cipher:p1",
                     "cipher:collection", "cipher:shorts"];
  var LEGACY_KEYS = ["lgr-state", "lgr-t", "lgr-p1"];
  var THEMES = ["light", "dark", "contrast", "writer", "space", "forge"];

  /** Das Theme anzeigen. */
  function showTheme(theme) {
    if (THEMES.indexOf(theme) < 0) return;
    document.documentElement.dataset.theme = theme;
    document.querySelectorAll(".modes button").forEach(function (button) {
      button.setAttribute("aria-pressed", String(button.dataset.mode === theme));
    });
  }

  /**
   * Den Wechsel ueberblenden. Die View Transitions API fotografiert die alte
   * Seite, `apply` stellt die neue ein, und CSS oder eine Animation gibt sie
   * frei. Ohne die API oder bei reduzierter Bewegung wird sofort umgeschaltet.
   *
   * PROTOTYP: ?uebergang=blende|vorhang|schraeg|kreis waehlt die Variante zum
   * Vergleichen. Vor dem Mergen bleibt nur die gewaehlte uebrig.
   */
  var REVEALS = ["blende", "vorhang", "schraeg", "kreis"];

  function revealTheme(apply, origin) {
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!document.startViewTransition || reduce || !origin) {
      apply();
      return;
    }
    var root = document.documentElement;
    var wanted = new URLSearchParams(window.location.search).get("uebergang");
    var kind = REVEALS.indexOf(wanted) >= 0 ? wanted : REVEALS[0];
    root.dataset.reveal = kind;
    var transition = document.startViewTransition(apply);
    transition.finished.then(function () { delete root.dataset.reveal; }, function () { delete root.dataset.reveal; });
    if (kind !== "kreis") return;

    // Der Kreis waechst vom gedrueckten Knopf bis in die entfernteste Ecke.
    var box = origin.getBoundingClientRect();
    var x = box.left + box.width / 2;
    var y = box.top + box.height / 2;
    var radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
    transition.ready.then(function () {
      root.animate(
        { clipPath: ["circle(0 at " + x + "px " + y + "px)", "circle(" + radius + "px at " + x + "px " + y + "px)"] },
        { duration: 700, easing: "cubic-bezier(.65, 0, .35, 1)", pseudoElement: "::view-transition-new(root)" }
      );
    }).catch(function () { /* Uebergang abgebrochen — das Theme steht trotzdem. */ });
  }

  /**
   * Das Theme anzeigen und merken. Gespeichert wird nur auf Klick: beim
   * Laden das Standard-Theme zurueckzuschreiben legte `cipher:state` schon
   * an, wenn jemand nur die Datenschutzerklaerung lesen wollte — und genau
   * die begruendet die Speicherung damit, dass sie gewuenscht ist.
   */
  function chooseTheme(theme, origin) {
    if (THEMES.indexOf(theme) < 0) return;
    var changed = theme !== document.documentElement.dataset.theme;
    revealTheme(function () { showTheme(theme); }, changed ? origin : null);
    try {
      var state = JSON.parse(window.localStorage.getItem(STATE_KEY) || "{}");
      state.theme = theme;
      window.localStorage.setItem(STATE_KEY, JSON.stringify(state));
    } catch (error) { /* Speicher gesperrt — dann gilt das Theme nur hier. */ }
  }

  var modes = document.querySelector(".modes");
  if (modes) {
    modes.addEventListener("click", function (event) {
      var button = event.target.closest("button");
      if (button) chooseTheme(button.dataset.mode, button);
    });
    showTheme(document.documentElement.dataset.theme || "dark");
  }

  var wipeButton = document.getElementById("wipe");
  if (wipeButton) {
    wipeButton.addEventListener("click", function () {
      var removed = 0;
      CIPHER_KEYS.concat(LEGACY_KEYS).forEach(function (key) {
        try {
          if (window.localStorage.getItem(key) !== null) removed += 1;
          window.localStorage.removeItem(key);
        } catch (error) { /* nichts zu tun */ }
      });
      document.getElementById("wipeResult").textContent = removed
        ? "Erledigt: " + removed + " Eintrag" + (removed === 1 ? "" : "e") + " gelöscht."
        : "Es war nichts gespeichert.";
    });
  }
})(window, document);
