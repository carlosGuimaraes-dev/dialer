import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { fetchMetadataObjects, findTargetObject } from "./meta.js";

// fetch is stubbed below, so these only satisfy config loading — no network.
process.env.TWENTY_BASE_URL ??= "https://twenty.local";
process.env.TWENTY_API_KEY ??= "test-key";

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

function metadataPage(names: string[]) {
  return {
    data: names.map((namePlural, i) => ({ nameSingular: namePlural.replace(/s$/, ""), namePlural, fields: [], id: `id-${i}` })),
    totalCount: names.length,
    pageInfo: { hasNextPage: false },
  };
}

test("lookup succeeds when the target is outside the default first 60 objects", async () => {
  // The workspace holds 69 objects; the endpoint's default page is 60 and
  // agencyLeads sorts past it. The helper must ask for a verified larger
  // page, not accept the default.
  const firstSixty = Array.from({ length: 60 }, (_, i) => `customObject${i}`);
  const all = [...firstSixty, "agencyProspects", "agencyLeads"];
  let requestedUrl = "";
  const makeRes = (names: string[]) => {
    const res: any = {
      ok: true,
      status: 200,
      json: async () => metadataPage(names),
      text: async () => "",
    };
    res.clone = () => makeRes(names);
    return res;
  };
  globalThis.fetch = (async (url: any) => {
    requestedUrl = String(url);
    const limit = new URL(String(url)).searchParams.get("limit");
    return makeRes(limit ? all : firstSixty);
  }) as any;

  const objects = await fetchMetadataObjects();
  assert.match(requestedUrl, /limit=200/);
  assert.equal(objects.length, 62);
  assert.ok(findTargetObject(objects as any, "agencyLeads"), "agencyLeads must be found");
  assert.ok(findTargetObject(objects as any, "agencyProspect"), "singular lookup still works");
});
