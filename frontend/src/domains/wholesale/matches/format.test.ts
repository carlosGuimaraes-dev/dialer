import { test } from "node:test";
import assert from "node:assert/strict";
import { areas, lotSizeRange, priceRange } from "./format";

test("a buybox price range reads with or without both ends", () => {
  assert.equal(priceRange(25000, 120000), "$25,000 – $120,000");
  assert.equal(priceRange(null, 120000), "up to $120,000");
  assert.equal(priceRange(25000, null), "from $25,000");
  assert.equal(priceRange(null, null), null);
});

test("lot sizes use a plain thousands separator", () => {
  assert.equal(lotSizeRange(5000, 9000), "5,000–9,000 sq ft");
  assert.equal(lotSizeRange(null, 9000), "up to 9,000 sq ft");
  assert.equal(lotSizeRange(5000, null), "from 5,000 sq ft");
  assert.equal(lotSizeRange(null, null), null);
});

test("areas join states, counties and cities, skipping the empty ones", () => {
  assert.equal(
    areas({ states: ["TX"], counties: ["Collin"], cities: [] }),
    "TX, Collin",
  );
});
