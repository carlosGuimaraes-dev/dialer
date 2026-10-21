import { test } from "node:test";
import assert from "node:assert/strict";
import { amount, mapBuilderMatch, mapBuybox, values } from "./helpers.js";

test("a buybox maps its money, size and geography for the panel", () => {
  const b = mapBuybox({
    id: "b",
    name: "  North Texas  ",
    status: "ACTIVE",
    minPrice: { amount: 25000, currencyCode: "USD" },
    maxPrice: 120000,
    minLotSizeSqFt: 5000,
    states: ["TX", "OK"],
    counties: "Collin, Denton",
    zoning: null,
  });
  assert.equal(b.name, "North Texas");
  assert.equal(b.min_price, 25000);
  assert.equal(b.max_price, 120000);
  assert.deepEqual(b.states, ["TX", "OK"]);
  assert.deepEqual(b.counties, ["Collin", "Denton"]);
  assert.deepEqual(b.zoning, []);
});

test("a builder match keeps both the overall score and its parts", () => {
  const m = mapBuilderMatch({
    id: "m",
    name: "",
    matchScore: 82,
    priceScore: 90,
    proximityScore: 60,
    buyboxFitScore: 95,
    builderMaxPrice: { amount: 150000, currencyCode: "USD" },
    builder: { id: "x", name: "Wayne Homes" },
    buybox: { id: "y", name: "Collin County" },
  });
  assert.equal(m.name, "Wayne Homes");
  assert.equal(m.builder_id, "x");
  assert.equal(m.match_score, 82);
  assert.deepEqual(m.score, { price: 90, proximity: 60, buybox_fit: 95 });
  assert.equal(m.max_price, 150000);
  assert.equal(m.buybox?.name, "Collin County");
});

test("a match with no score yet reads as active with empty parts", () => {
  const m = mapBuilderMatch({ id: "m", isActive: null });
  assert.equal(m.name, "Unnamed match");
  assert.equal(m.match_score, null);
  assert.equal(m.is_active, true);
  assert.equal(m.buybox, null);
});

test("amount and values tolerate the shapes Twenty sends", () => {
  assert.equal(amount(null), null);
  assert.equal(amount({ amount: "0" }), 0);
  assert.equal(amount({}), null);
  assert.deepEqual(values(["A", "", 3]), ["A"]);
  assert.deepEqual(values(""), []);
});
