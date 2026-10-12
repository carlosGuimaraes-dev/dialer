import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanFilters, cleanScope, mapFilterView } from "./helpers.js";

test("keeps only flat string filters with safe keys", () => {
  assert.deepEqual(cleanFilters({ status: "new", assignedTo: "__me", bad: 3, "no spaces": "x", nested: { a: 1 } }), {
    status: "new",
    assignedTo: "__me",
  });
  assert.deepEqual(cleanFilters(null), {});
  assert.deepEqual(cleanFilters(["status"]), {});
});

test("an unknown scope falls back to the dock", () => {
  assert.equal(cleanScope("contacts"), "contacts");
  assert.equal(cleanScope("../etc"), "dock");
  assert.equal(cleanScope(undefined), "dock");
});

test("reads filters stored as JSON text or as an object", () => {
  const base = { id: "1", name: "Mine", scope: "dock", memberId: "m" };
  assert.deepEqual(mapFilterView({ ...base, filters: '{"status":"new"}' }).filters, { status: "new" });
  assert.deepEqual(mapFilterView({ ...base, filters: { city: "Kingston" } }).filters, { city: "Kingston" });
  assert.deepEqual(mapFilterView({ ...base, filters: "not json" }).filters, {});
});
