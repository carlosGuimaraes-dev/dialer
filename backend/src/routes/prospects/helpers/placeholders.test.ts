import { test } from "node:test";
import assert from "node:assert/strict";
import { realPhone, realText, realWebsite, withoutPlaceholders } from "./placeholders.js";

test("import placeholders read as empty", () => {
  assert.equal(realText("unknown"), undefined);
  assert.equal(realText(" Unknown "), undefined);
  assert.equal(realText(""), undefined);
  assert.equal(realText("Chatham"), "Chatham");
});

test("a phone is only kept when it can be dialled", () => {
  assert.equal(realPhone("unknown"), undefined);
  assert.equal(realPhone("+1 201-216-1500 (f27a41)"), "+1 201-216-1500");
  assert.equal(realPhone("(484) 509-0600"), "(484) 509-0600");
  assert.equal(realPhone("ext 12"), undefined);
  assert.equal(realPhone("412-555-0102"), undefined);
  assert.equal(realPhone("+1 412 555 0199"), undefined);
  assert.equal(realPhone("412-555-2100"), "412-555-2100");
});

test("websites lose the uniqueness tag", () => {
  assert.equal(realWebsite("www.shipco.com/#f27a41"), "www.shipco.com");
  assert.equal(realWebsite("https://acme.com"), "https://acme.com");
  assert.equal(realWebsite("unknown"), undefined);
});

test("a prospect keeps its real values and drops the placeholders", () => {
  const p = withoutPlaceholders({ id: "1", name: "Shipco", city: "unknown", region: "unknown", phone: "unknown", website: "www.shipco.com/#f27a41", niche: "Customs forwarder" } as any);
  assert.equal(p.city, undefined);
  assert.equal(p.region, undefined);
  assert.equal(p.phone, undefined);
  assert.equal(p.website, "www.shipco.com");
  assert.equal(p.niche, "Customs forwarder");
  assert.equal(p.name, "Shipco");
});
