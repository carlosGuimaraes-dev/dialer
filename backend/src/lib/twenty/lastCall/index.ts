import { twentyGraphqlClient } from "../graphql/index.js";
import { createLogger } from "../../logger/index.js";
import { lastOutcomes, type CallStub } from "./helpers/index.js";
import { OBJECTS, contactRelationId } from "../../wholesale/objects.js";

export * from "./helpers/index.js";

const log = createLogger("last-call");

/** Calls are walked newest first (createdAt, as the Last call column orders them), 200 a page, at most this many pages. */
const PAGE = 200;
const MAX_PAGES = 50;
/** The Contacts table asks often (facets, every filter change); calls change slowly. */
const TTL_MS = 30_000;

let cached: { at: number; value: Promise<Map<string, string>> } | null = null;

async function load(): Promise<Map<string, string>> {
  const client: any = twentyGraphqlClient();
  const prospectKey = contactRelationId("prospects");
  const leadKey = contactRelationId("leads");
  const calls: CallStub[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const r: any = await client.query({
      [OBJECTS.calls]: {
        __args: { first: PAGE, offset: page * PAGE, orderBy: [{ createdAt: "DescNullsLast" }, { id: "AscNullsFirst" }] },
        edges: { node: { [prospectKey]: true, [leadKey]: true, disposition: true, status: true } },
      },
    });
    const nodes = ((r?.[OBJECTS.calls]?.edges ?? []) as any[]).map((e: any) => ({
      agencyProspectId: e.node[prospectKey],
      agencyLeadId: e.node[leadKey],
      disposition: e.node.disposition,
      status: e.node.status,
    })) as CallStub[];
    calls.push(...nodes);
    if (nodes.length < PAGE) break;
    if (page === MAX_PAGES - 1) log.info(`Last-call index stopped at ${calls.length} calls`);
  }
  return lastOutcomes(calls);
}

/**
 * Contact id -> how its most recent call ended, for every contact that has
 * been called. Cached for 30 seconds; `fresh` drops the cache (after a call
 * is saved, so the filter reflects it).
 */
export function lastCallIndex(fresh = false): Promise<Map<string, string>> {
  if (!fresh && cached && Date.now() - cached.at < TTL_MS) return cached.value;
  const value = load();
  cached = { at: Date.now(), value };
  value.catch(() => {
    if (cached?.value === value) cached = null;
  });
  return value;
}

/** Drop the cache: the next Contacts request sees a call saved just now. */
export function forgetLastCalls(): void {
  cached = null;
}
