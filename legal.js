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
   * Den Wechsel als Vorhang zeigen: die neue Seite senkt sich mit weicher
   * Kante von oben ueber die alte. Die View Transitions API fotografiert
   * dafuer die alte Seite, `apply` stellt die neue ein, das Absenken macht
   * CSS (siehe "Themenwechsel" in styles.css). Ohne die API, bei reduzierter
   * Bewegung oder ohne Anlass (`animate` falsch) wird sofort umgeschaltet.
   */
  function revealTheme(apply, animate) {
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!document.startViewTransition || reduce || !animate) {
      apply();
      return;
    }
    document.startViewTransition(apply);
  }

  /**
   * Das Theme anzeigen und merken. Gespeichert wird nur auf Klick: beim
   * Laden das Standard-Theme zurueckzuschreiben legte `cipher:state` schon
   * an, wenn jemand nur die Datenschutzerklaerung lesen wollte — und genau
   * die begruendet die Speicherung damit, dass sie gewuenscht ist.
   */
  function chooseTheme(theme) {
    if (THEMES.indexOf(theme) < 0) return;
    var changed = theme !== document.documentElement.dataset.theme;
    revealTheme(function () { showTheme(theme); }, changed);
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
      if (button) chooseTheme(button.dataset.mode);
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
