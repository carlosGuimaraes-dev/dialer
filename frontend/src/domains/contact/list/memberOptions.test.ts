import { test } from "node:test";
import assert from "node:assert/strict";
import { ME, UNASSIGNED, memberOptions, resolveMember } from "./memberOptions";

const names = { a: "Matthew", b: "Abel Giddings", c: "Mandeep Singh" };

test("lists every workspace member, not only the ones with prospects", () => {
  const options = memberOptions(names, { a: 158, [UNASSIGNED]: 40 }, null);
  assert.deepEqual(
    options.map((o) => [o.label, o.count]),
    [
      ["Abel Giddings", 0],
      ["Mandeep Singh", 0],
      ["Matthew", 158],
      ["Unassigned", 40],
    ],
  );
});

test("puts Me first and leaves the signed-in member out of the rest", () => {
  const options = memberOptions(names, { a: 158 }, "a");
  assert.equal(options[0].value, ME);
  assert.equal(options[0].count, 158);
  assert.ok(!options.some((o) => o.value === "a"));
});

test("keeps an assignee that has no name yet", () => {
  const options = memberOptions({}, { z: 3 }, null);
  assert.deepEqual(options[0], { value: "z", label: "Unknown member", count: 3 });
});

test("Me resolves to the signed-in member, or Unassigned when nobody is signed in", () => {
  assert.equal(resolveMember(ME, "a"), "a");
  assert.equal(resolveMember(ME, null), UNASSIGNED);
  assert.equal(resolveMember("b", "a"), "b");
});
