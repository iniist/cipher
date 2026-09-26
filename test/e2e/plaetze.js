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

module.exports = { haekchen, vergeben, abwaehlen };
