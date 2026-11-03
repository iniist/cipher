const test = require("node:test");
const assert = require("node:assert/strict");
const Pause = require("../pause.js");

test("Stichtag ist der 5.11.2026, 0:00 Uhr deutscher Zeit", () => {
  assert.equal(new Date(Pause.PAUSE_FROM).toISOString(), "2026-11-04T23:00:00.000Z");
  assert.equal(
    new Date(Pause.PAUSE_FROM).toLocaleString("de-DE", { timeZone: "Europe/Berlin" }),
    "5.11.2026, 00:00:00"
  );
});

test("vor dem Stichtag keine Pause, ab dem Stichtag Pause", () => {
  assert.equal(Pause.isPaused(Pause.PAUSE_FROM - 1), false);
  assert.equal(Pause.isPaused(Pause.PAUSE_FROM), true);
  assert.equal(Pause.isPaused(Pause.PAUSE_FROM + 86400000), true);
});
