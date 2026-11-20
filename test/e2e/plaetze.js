/**
 * Hilfen fuer die Haekchen der Plaetze.
 *
 * Ein Tipp aufs Haekchen schaltet drei Zustaende durch: angeboten ->
 * vergeben -> aus -> angeboten. Playwrights uncheck() kommt zwar auch
 * irgendwie bei "aus" an, verlaesst sich dabei aber auf sein eigenes
 * Nachklicken. Hier steht der Weg ausdruecklich.
 */

/** Die Checkbox eines Platzes, 0-basiert. */
const haekchen = (page, slot) => page.locator(`#rows input[data-slot="${slot}"]`);

/** Einen angebotenen Platz auf "vergeben" stellen: ein Tipp. */
async function vergeben(page, slot) {
  await haekchen(page, slot).click();
}

/** Einen angebotenen Platz abwaehlen: ueber "vergeben" nach "aus". */
async function abwaehlen(page, slot) {
  await haekchen(page, slot).click();
  await haekchen(page, slot).click();
}

/**
 * Die Spalte "Sichern", Zeile fuer Zeile, ohne die Summe darunter: "+2.660",
 * "Sicher", "vergeben", "–" ...
 */
const schritte = (page) => page.locator("#rows td.pre").evaluateAll((zellen) =>
  zellen.map((zelle) => {
    const kopie = zelle.cloneNode(true);
    kopie.querySelectorAll(".pre-sum").forEach((summe) => summe.remove());
    return kopie.textContent.trim();
  }));

/**
 * Die laufende Summe unter jedem Schritt, als Text wie im Spiel ("62.061");
 * null, wo keine steht.
 */
const summen = (page) => page.locator("#rows td.pre").evaluateAll((zellen) =>
  zellen.map((zelle) => {
    const summe = zelle.querySelector(".pre-sum");
    return summe ? summe.textContent.replace(/^Σ\s*insgesamt\s*/, "").trim() : null;
  }));

module.exports = { haekchen, vergeben, abwaehlen, schritte, summen };
