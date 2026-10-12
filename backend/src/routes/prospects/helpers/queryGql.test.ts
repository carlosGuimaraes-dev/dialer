import { test } from "node:test";
import assert from "node:assert/strict";
import { leadGqlQuery, prospectGqlQuery } from "./queryGql.js";

const A = "5ecd97b9-5949-4cfd-a2f4-a5f88f9c1ec0";
const B = "2bcf9327-d52f-445c-927b-05e687a559a6";

test("filters prospects by who they are assigned to, including unassigned", () => {
  assert.deepEqual(prospectGqlQuery({ assignedTo: A }).filter, { assignedToId: { in: [A] } });
  assert.deepEqual(prospectGqlQuery({ assignedTo: `${A}|__blank` }).filter, {
    or: [{ assignedToId: { in: [A] } }, { assignedToId: { is: "NULL" } }],
  });
});

test("filters prospects by lead source and offer, ignoring values that are not Twenty options", () => {
  assert.deepEqual(prospectGqlQuery({ leadSource: "HIRING_SIGNAL", offer: "BOTH|bad value" }).filter, {
    and: [{ leadSource: { in: ["HIRING_SIGNAL"] } }, { offer: { in: ["BOTH"] } }],
  });
});

test("filters by several campaigns, and skips ids that are not uuids", () => {
  assert.deepEqual(prospectGqlQuery({ campaign: `${A}|${B}|nope` }).filter, { campaignIdId: { in: [A, B] } });
  assert.deepEqual(leadGqlQuery({ campaign: B })?.filter, { campaignIdId: { in: [B] } });
});

test("a prospect-only filter leaves leads out", () => {
  assert.equal(leadGqlQuery({ assignedTo: A }), null);
  assert.equal(leadGqlQuery({ leadSource: "HIRING_SIGNAL" }), null);
});
