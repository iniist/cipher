/*!
 * cipher — Pause zum Prestige-Update
 *
 * Mit dem Prestige-Update vom 5. November 2026 rechnet Forge of Empires
 * Stufenkosten und Maezen-Belohnungen neu. Der Datensatz und die Regeln in
 * calc.js gelten bis dahin, danach nicht mehr. Statt falscher Zahlen zeigt
 * cipher ab diesem Zeitpunkt einen Hinweis.
 *
 * Die Datei laeuft im <head>, vor dem ersten Frame: Sie setzt nur die
 * Klasse "paused" auf <html>, das Ausblenden erledigt das CSS. So blitzt
 * der Rechner nicht kurz auf, und app.js bleibt unberuehrt: gespeicherte
 * Favoriten und Einstellungen bleiben, wie sie sind.
 *
 * Aufheben: diese Datei und ihre Einbindung entfernen, sobald calc.js und
 * data.js das neue System kennen.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else api.apply(root.document, Date.now());
})(typeof self !== "undefined" ? self : globalThis, function () {
  "use strict";

  /** 5. November 2026, 0:00 Uhr in Deutschland (MEZ = UTC+1). */
  var PAUSE_FROM = Date.UTC(2026, 10, 4, 23, 0, 0);

  function isPaused(now) {
    return now >= PAUSE_FROM;
  }

  function apply(document, now) {
    if (document && isPaused(now)) document.documentElement.classList.add("paused");
  }

  return { PAUSE_FROM: PAUSE_FROM, isPaused: isPaused, apply: apply };
});
