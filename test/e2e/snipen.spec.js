/**
 * Arche-Sniper (snipen.html): A eigene Arche, B Ziel, C fremde Plätze,
 * D Zielen mit Balken und Schieber.
 */
const { test, expect } = require("@playwright/test");

async function eintragen(page, werte) {
  for (const [id, wert] of Object.entries(werte)) await page.fill("#" + id, wert);
}

/** Ein Bauwerk über die Auswahl wählen, wie ein Mensch: Knopf, suchen, tippen. */
async function bauwerk(page, suche, name) {
  await page.click("#buildingPick");
  await page.fill("#pickerFilter", suche);
  await page.locator("#pickerList [role=option]", { hasText: name }).first().click();
  await expect(page.locator("#picker")).toBeHidden();
}

async function arche(page, stufe) {
  await page.fill("#snArc", stufe);
  await page.click("#arcSave");
}

test("die Arche wird gemerkt und klappt zu", async ({ page }) => {
  await page.goto("/snipen.html");
  await expect(page.locator("#arcForm")).toBeVisible();
  await arche(page, "188");
  await expect(page.locator("#arcForm")).toBeHidden();
  await expect(page.locator("#arcSummary")).toContainText("Arche\u00a0188 · Kupfer\u00a099\u00a0% · Gold\u00a021\u00a0%");
  await page.reload();
  await expect(page.locator("#arcSummary")).toContainText("Arche 188");
  await page.click("#arcSummary");
  await expect(page.locator("#snArc")).toBeFocused();
});

test("Arche 183 beim Nachbarn: P1 ist zu teuer zum Sichern", async ({ page }) => {
  await page.goto("/snipen.html");
  await arche(page, "188");
  await expect(page.locator("#stepResult")).toBeHidden();
  await eintragen(page, { snLevel: "183", snProgress: "34.456" });
  await expect(page.locator("#snTotal")).toHaveValue("127.430");
  await expect(page.locator("#snTaken input")).toHaveCount(7);
  await expect(page.locator("#snSummary")).toHaveText("Noch offen: 92.974 FP · Gold-Stufe · dein Bonus: Gold 21 %");
  await expect(page.locator("#snSplit")).toHaveText("Im Balken: 34.456 FP · davon Besitzer 34.456 · Fremde 0");

  await page.click('#snChips button[data-slot="1"]');
  await expect(page.locator("#lValue")).toHaveText("13.460");
  await expect(page.locator("#lSafe")).toHaveText("46.487");
  // Voreingestellt: die Gewinngrenze — drauf, aber angreifbar.
  await expect(page.locator("#snPayNum")).toHaveValue("13.460");
  await expect(page.locator("#snStatus")).toHaveText("P1 · angreifbar");
  await expect(page.locator("#snFill")).toHaveClass(/angreifbar/);

  // Sichern kostet 33.027 FP mehr; 8 Gold-BP + 2 Bonus → 3.303 FP je Stück.
  await page.fill("#snPayNum", "46.487");
  await expect(page.locator("#snStatus")).toHaveText("P1 · sicher, aber mit Verlust");
  await expect(page.locator("#snFill")).toHaveClass(/sicher/);
  await expect(page.locator("#snProfit")).toHaveText("−33.027 FP");
  await page.fill("#snBp", "8");
  await expect(page.locator("#snBpOut")).toHaveText("→ eine Blaupause kostet dich 3.303 FP");
});

test("kurz vor voll: cipher wählt den lohnendsten Platz und den sicheren Betrag", async ({ page }) => {
  await page.goto("/snipen.html");
  await arche(page, "188");
  await eintragen(page, { snLevel: "183", snProgress: "124.430", snP1: "13.000", snP2: "6.000", snP3: "1.200" });
  // Offen 3.000. P3: (3000 + 1200) / 2 = 2.100 ≤ 2.243 → +143.
  await expect(page.locator("#snSplit")).toHaveText("Im Balken: 124.430 FP · davon Besitzer 104.230 · Fremde 20.200");
  await expect(page.locator('#snChips button[aria-pressed="true"]')).toHaveAttribute("data-slot", "3");
  await expect(page.locator("#snPayNum")).toHaveValue("2.100");
  await expect(page.locator("#snStatus")).toHaveText("P3 · sicher");
  await expect(page.locator("#snProfit")).toHaveText("+143 FP");

  // Ein FP weniger: noch P3, aber angreifbar.
  await page.fill("#snPayNum", "2.099");
  await expect(page.locator("#snStatus")).toHaveText("P3 · angreifbar");
  // Zu wenig für einen Platz.
  await page.fill("#snPayNum", "0");
  await expect(page.locator("#snStatus")).toHaveText("Kein Platz");
  await expect(page.locator("#snFill")).toHaveClass(/kein/);
});

test("der Schieber bewegt den Einsatz", async ({ page }) => {
  await page.goto("/snipen.html");
  await arche(page, "188");
  await eintragen(page, { snLevel: "183", snProgress: "124.430" });
  await page.locator("#snPay").fill("1500");
  await expect(page.locator("#snPayNum")).toHaveValue("1.500");
  await expect(page.locator("#snStatus")).toHaveText("P1 · sicher");
});

test("Blaupausen sind für die Arche geschätzt, sonst leer", async ({ page }) => {
  await page.goto("/snipen.html");
  await arche(page, "188");
  await eintragen(page, { snLevel: "181", snProgress: "0" });
  await page.click('#snChips button[data-slot="1"]');
  await expect(page.locator("#snBp")).toHaveValue("8");
  await expect(page.locator("#snBpLabel")).toContainText("geschätzt ca. 8");
  await bauwerk(page, "hydra", "HYDRA");
  await eintragen(page, { snLevel: "89" });
  await expect(page.locator("#snBp")).toHaveValue("");
  await expect(page.locator("#snSummary")).toHaveText("Noch offen: 28.556 FP · Kupfer-Stufe · dein Bonus: Kupfer 99 %");
  await expect(page.locator("#snTaken input")).toHaveCount(5);
});

test("ohne Kosten in der Tabelle fragt die Seite nach der rechten Zahl", async ({ page }) => {
  await page.goto("/snipen.html");
  await arche(page, "0");
  await expect(page.locator("#arcSummary")).toContainText("Keine Arche");
  await eintragen(page, { snLevel: "501" });
  await expect(page.locator("#snSplit")).toContainText("rechte Zahl am Balken");
  await eintragen(page, { snTotal: "10.300.000", snProgress: "10.000.000" });
  await expect(page.locator("#snSummary")).toContainText("Noch offen: 300.000 FP");
});

test("die Seite steht nicht im Index", async ({ page }) => {
  await page.goto("/snipen.html");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex");
});

test("Marken und Legende setzen den Einsatz", async ({ page }) => {
  await page.goto("/snipen.html");
  await arche(page, "188");
  await eintragen(page, { snLevel: "183", snProgress: "124.430", snP1: "13.000", snP2: "6.000" });
  await page.click('#snChips button[data-slot="3"]');
  await page.click('.legend button.take');
  await expect(page.locator("#snPayNum")).toHaveValue("1");
  await expect(page.locator("#snStatus")).toHaveText("P3 · angreifbar");
  await page.click(".legend button.safe");
  await expect(page.locator("#snPayNum")).toHaveValue("1.500");
  await expect(page.locator("#snStatus")).toHaveText("P3 · sicher");
  await expect(page.locator("label", { hasText: "Nächste Stufe" })).toHaveCount(1);
});

test("andere Bauwerke: keine Schätzung, aber ein Hinweis", async ({ page }) => {
  await page.goto("/snipen.html");
  await arche(page, "188");
  await bauwerk(page, "obsi", "Observatorium");
  await eintragen(page, { snLevel: "150", snProgress: "0" });
  await expect(page.locator("#snBp")).toHaveValue("");
  await expect(page.locator("#snBpNote")).toContainText("Für dieses Bauwerk schätzt cipher noch nicht");
});

test("der Griff rastet an den Marken ein, die Feinschritte zählen genau", async ({ page }) => {
  await page.goto("/snipen.html");
  await arche(page, "188");
  await eintragen(page, { snLevel: "183", snProgress: "124.430", snP1: "13.000", snP2: "6.000", snP3: "1.200" });
  // Offen 3.000, P3 sicher ab 2.100: 2.080 liegt nah genug dran.
  await page.locator("#snPay").fill("2080");
  await expect(page.locator("#snPayNum")).toHaveValue("2.100");
  await page.click('.stepper button[data-step="-1"]');
  await expect(page.locator("#snPayNum")).toHaveValue("2.099");
  await expect(page.locator("#snStatus")).toHaveText("P3 · angreifbar");
  await expect(page.locator("#snDetail")).toHaveText("Noch nicht sicher: Wer 900 FP einzahlt, überholt dich. Sicher bist du ab 2.100 FP.");
});

test("Empfehlung, Status an den Plätzen und Verlust trotz sicher", async ({ page }) => {
  await page.goto("/snipen.html");
  await arche(page, "188");
  await eintragen(page, { snLevel: "183", snProgress: "124.430", snP1: "13.000", snP2: "6.000", snP3: "1.200" });
  await expect(page.locator("#snAdvice")).toHaveText("Nimm P3: 2.100 FP einzahlen, sicher, +143 FP.");
  await expect(page.locator('#snChips button[data-slot="3"]')).toHaveAttribute("aria-label", "P3, lohnt");
  await expect(page.locator('#snChips button[data-slot="1"] small')).toHaveText("– nicht drin");

  await eintragen(page, { snProgress: "34.456", snP1: "", snP2: "", snP3: "" });
  await page.click('#snChips button[data-slot="1"]');
  await page.click(".legend button.safe");
  await expect(page.locator("#snStatus")).toHaveText("P1 · sicher, aber mit Verlust");
});

test("das Ziel übersteht ein Neuladen, „Neues Ziel“ leert es", async ({ page }) => {
  await page.goto("/snipen.html");
  await arche(page, "188");
  await eintragen(page, { snLevel: "183", snProgress: "124.430", snP1: "13.000" });
  await page.click('#snChips button[data-slot="4"]');
  await page.reload();
  await expect(page.locator("#snLevel")).toHaveValue("183");
  await expect(page.locator("#snP1")).toHaveValue("13.000");
  await expect(page.locator('#snChips button[aria-pressed="true"]')).toHaveAttribute("data-slot", "4");
  await page.click("#snClear");
  await expect(page.locator("#snLevel")).toHaveValue("");
  await expect(page.locator("#stepResult")).toBeHidden();
});

test("eine volle Stufe zeigt keine alten Zahlen", async ({ page }) => {
  await page.goto("/snipen.html");
  await arche(page, "188");
  await eintragen(page, { snLevel: "183", snProgress: "124.430" });
  await expect(page.locator("#snAim")).toBeVisible();
  await eintragen(page, { snProgress: "127.430" });
  await expect(page.locator("#snSummary")).toHaveText("Die Stufe ist schon voll.");
  await expect(page.locator("#snAim")).toBeHidden();
});

test.describe("Bauwerksauswahl wie im Förderrechner", () => {
  test("Knopf zeigt Name und Zeitalter, die Liste ist nach Zeitalter gruppiert", async ({ page }) => {
    await page.goto("/snipen.html");
    await expect(page.locator("#buildingPickName")).toHaveText("Die Arche");
    await expect(page.locator("#buildingPickEra")).toHaveText("Zukunft");
    await expect(page.locator("#snBuilding")).toBeHidden();
    await page.click("#buildingPick");
    await expect(page.locator("#picker")).toBeVisible();
    await expect(page.locator("#buildingPick")).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator(".picker-era").first()).toBeVisible();
    await expect(page.locator('#pickerList [aria-selected="true"]')).toContainText("Die Arche");
  });

  test("Suche nach Kürzel und Zeitalter, Enter wählt", async ({ page }) => {
    await page.goto("/snipen.html");
    await page.click("#buildingPick");
    await page.fill("#pickerFilter", "AO");
    await expect(page.locator("#pickerList [role=option]").first()).toContainText("Arktische Orangerie");
    await page.fill("#pickerFilter", "titan");
    await expect(page.locator("#pickerCount")).toHaveText("3 Bauwerke gefunden.");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(page.locator("#picker")).toBeHidden();
    await expect(page.locator("#buildingPickEra")).toHaveText("Titan");
    await expect(page.locator("#buildingPick")).toBeFocused();
  });

  test("Esc leert erst die Suche, dann schließt es", async ({ page }) => {
    await page.goto("/snipen.html");
    await page.click("#buildingPick");
    await page.fill("#pickerFilter", "zeus");
    await page.keyboard.press("Escape");
    await expect(page.locator("#pickerFilter")).toHaveValue("");
    await expect(page.locator("#picker")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("#picker")).toBeHidden();
    await expect(page.locator("#buildingPickName")).toHaveText("Die Arche");
  });

  test("das gewählte Bauwerk wird gemerkt", async ({ page }) => {
    await page.goto("/snipen.html");
    await bauwerk(page, "kraken", "Kraken");
    await page.reload();
    await expect(page.locator("#buildingPickName")).toContainText("Kraken");
  });
});
