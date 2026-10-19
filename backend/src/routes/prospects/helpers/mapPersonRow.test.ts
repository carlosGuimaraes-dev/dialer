import { test } from "node:test";
import assert from "node:assert/strict";
import { mapPersonListItem } from "./mapPersonRow.js";
import { contactTypes } from "./query.js";
import { hasCompanyFilter, personGqlQuery } from "./queryGql.js";

test("a decision maker becomes a person row with a dialable number", () => {
  const row = mapPersonListItem({
    id: "p1", name: "Ana Ruiz Lopez", jobTitle: "VP Logistics", prospectId: "c1",
    phones: { primaryPhoneNumber: "2015550123", primaryPhoneCallingCode: "+1" },
    emails: { primaryEmail: "ana@acme.com" },
  });
  assert.equal(row.first_name, "Ana");
  assert.equal(row.last_name, "Ruiz Lopez");
  assert.equal(row.jobTitle, "VP Logistics");
  assert.equal(row.prospectId, "c1");
  assert.equal(row.email, "ana@acme.com");
  // 555-01xx is fictional: never dialled.
  assert.equal(row.phone, null);
  assert.equal(mapPersonListItem({ id: "p2", name: "Bo", phones: { primaryPhoneNumber: "4845718730", primaryPhoneCallingCode: "+1" } }).phone, "+14845718730");
});

test("people are opt-in: only the Type filter brings them in", () => {
  assert.deepEqual(contactTypes(undefined), { prospects: true, leads: true, people: false });
  assert.deepEqual(contactTypes("person"), { prospects: false, leads: false, people: true });
  assert.deepEqual(contactTypes("prospect|person"), { prospects: true, leads: false, people: true });
});

test("company filters reach people through their prospect", () => {
  assert.equal(hasCompanyFilter({ assignedTo: "5ecd97b9-5949-4cfd-a2f4-a5f88f9c1ec0" }), true);
  assert.equal(hasCompanyFilter({ q: "ana", name: "ana" }), false);
  assert.deepEqual(personGqlQuery({}, ["c1", "c2"]).filter, { prospectId: { in: ["c1", "c2"] } });
  assert.deepEqual(personGqlQuery({ q: "logistics" }).filter, { or: [{ name: { ilike: "%logistics%" } }, { jobTitle: { ilike: "%logistics%" } }] });
});
