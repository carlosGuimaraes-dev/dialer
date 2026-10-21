import { Router } from "express";
import { authMiddleware, AuthRequest } from "../../middleware/auth.js";
import { listTwenty, listTwentyAll, createTwenty, updateTwenty, deleteTwenty, getTwenty, fetchTwenty } from "../../lib/twenty/client/index.js";
import { twentyGraphqlClient } from "../../lib/twenty/graphql/index.js";
import { contactTypes, idList } from "./helpers/query.js";
import { realText } from "./helpers/placeholders.js";
import { hasCompanyFilter, leadGqlQuery, pageWindow, personGqlQuery, prospectGqlQuery, type IdScope } from "./helpers/queryGql.js";
import { mapPersonListItem } from "./helpers/mapPersonRow.js";
import { lastCallIndex, NEVER_CALLED, outcomeCounts } from "../../lib/twenty/lastCall/index.js";
import { mapLeadToFrontend } from "../leads/helpers/index.js";
import { guardContactStatus } from "../../lib/pipelines/index.js";
import { checkSmsRoute, offerMachine, onPageSent, toE164 } from "@dialer/shared";
import { frameAllowed, framingHeaders, prospectPageUrl } from "../../lib/website/index.js";
import { createLogger } from "../../lib/logger/index.js";
import { resolveActor } from "../../lib/twenty/actor/index.js";
import { listWorkspaceMembers } from "../../lib/twenty/workspaceMember/index.js";
import { OBJECTS, contactRelationId } from "../../lib/wholesale/objects.js";
import { contactFields } from "../../lib/wholesale/fields.js";
import {
  mapOpportunityListItem,
  mapOpportunityDetail,
  mapOpportunityUpdateResult,
  mapOpportunityCreateResult,
  frontendToOpportunityPayload,
} from "../../lib/wholesale/landOpportunity/map.js";
import { mapBuyerListItem, buyerContactOf } from "../../lib/wholesale/buyer/map.js";
import type { AgencyProspect, AgencyCampaign, IndustryRouting } from "./types.js";
import {
  selectValue,
  slugifyIndustryValue,
  mapProspectListItem,
  mapProspectDetail,
  mapProspectUpdateResult,
  frontendStatusToTwenty,
  normalizeRequiredProspectFields,
} from "./helpers/index.js";

const router = Router();
router.use(authMiddleware);

const log = createLogger('prospects');

/** The Twenty object behind "prospect" (landOpportunities in the wholesale workspace). */
const PROSPECT_OBJECT = OBJECTS.prospects as string;
const LEAD_OBJECT = OBJECTS.leads as string;
const CALL_OBJECT = OBJECTS.calls as string;
const PERSON_OBJECT = OBJECTS.people as string;
const CAMPAIGN_OBJECT = OBJECTS.campaigns as string;
const PROSPECT_RELATION_ID = contactRelationId("prospects");
const LEAD_RELATION_ID = contactRelationId("leads");

/** Which columns each contact object actually has (filters and sorts depend on it). */
const PROSPECT_FIELDS = contactFields(PROSPECT_OBJECT);
const LEAD_FIELDS = contactFields(LEAD_OBJECT);

/**
 * The person field that points back at its company: agencyPerson.prospectId,
 * or person.ownedLandOpportunities in the wholesale workspace (one seller has
 * many people). Drives the People list and its company filter.
 */
const PERSON_OWNER_FIELD = PROSPECT_OBJECT === "landOpportunities" ? "ownedLandOpportunities" : "prospectId";

/** A person's company id, whatever object backs the company. */
const personCompanyId = (r: any): string | null => {
  const owner = r?.[PERSON_OWNER_FIELD];
  if (typeof owner === "string") return owner;
  if (Array.isArray(owner)) return owner[0]?.id ?? null;
  return null;
};

/** Row -> Contacts table entry, whatever object backs "prospect" today. */
const mapProspectRow = (r: any) =>
  PROSPECT_OBJECT === "agencyProspects" ? mapProspectListItem(r) : mapOpportunityListItem(r);

/** Row -> Contacts table entry for "lead" (buyers in the wholesale workspace). */
const mapLeadRow = (r: any) => {
  if (LEAD_OBJECT === "agencyLeads") return mapLeadToFrontend(r);
  return mapBuyerListItem(r, buyerContactOf(r));
};

/** Detail/patch views follow the same object switch. */
const mapProspectDetailView = (r: any) =>
  PROSPECT_OBJECT === "agencyProspects" ? mapProspectDetail(r) : mapOpportunityDetail(r);
const mapProspectUpdateView = (r: any) =>
  PROSPECT_OBJECT === "agencyProspects" ? mapProspectUpdateResult(r) : mapOpportunityUpdateResult(r);

/**
 * Industry routing read from the agencyCampaign row — the only source of
 * urlKey/funnel/template bases. Linked campaign first, else the campaign
 * whose industryId matches the prospect label. Null = unconfigured
 * (callers surface explicit states, never invented defaults).
 *
 * Stays in the router: it performs Twenty I/O, and helpers are pure.
 */
async function resolveIndustryRouting(prospect: AgencyProspect): Promise<IndustryRouting | null> {
  const linked: any = (prospect as any).campaignId ?? (prospect as any).campaignIdId;
  const linkedId = typeof linked === "string" ? linked : linked?.id;
  if (linkedId) {
    try {
      const campaign: any = await getTwenty<any>(CAMPAIGN_OBJECT, linkedId);
      if (campaign?.urlKey) return campaign;
    } catch {
      // fall through to industryId filter
    }
  }
  const label = selectValue(prospect.label);
  if (!label) return null;
  try {
    const campaigns = await listTwenty<any>(CAMPAIGN_OBJECT, {
      limit: 1,
      filter: `industryId[eq]:${label}`,
    } as any);
    if (campaigns[0]?.urlKey) return campaigns[0];
  } catch (err: any) {
    log.info(`Campaign routing lookup failed: ${(err as any)?.message}`);
  }
  return null;
}

router.get("/", async (_req, res) => {
  try {
    log.info('Listing prospects from Twenty CRM');
    const prospects = await listTwentyAll<AgencyProspect>(PROSPECT_OBJECT);

    // Fetch campaigns to resolve campaign types
    let campaignMap: Record<string, string> = {};
    try {
      const campaigns = await listTwenty<AgencyCampaign>(CAMPAIGN_OBJECT, 100);
      campaignMap = Object.fromEntries(campaigns.map(c => [c.id, c.utmSource || 'outbound']));
    } catch {
      // Campaign lookup is best-effort; proceed without it
    }

    const mapped = prospects.map(mapProspectListItem);

    log.info(`Returning ${mapped.length} prospects`);
    res.json(mapped);
  } catch (err: any) {
    log.error("Failed to list prospects:", err.message);
    res.status(500).json({ error: "Failed to fetch prospects from Twenty", details: err.message });
  }
});

/**
 * GET /api/prospects/page?offset=0&limit=50&q=&status=&country=&type=&sort=&dir=
 *
 * One window of contacts (prospects then leads, or leads first when the Type
 * column is sorted descending) with search, filters and sort applied by
 * Twenty, plus the total. Paged by offset through Twenty's GraphQL API, so the
 * table can fetch whatever slice is on screen, the way Twenty's own record
 * table virtualizes, instead of walking every page before it.
 */
router.get("/page", async (req, res) => {
  try {
    const params = req.query as Record<string, unknown>;
    const types = contactTypes(params.type);
    const { offset, limit } = pageWindow(params);
    const client: any = twentyGraphqlClient();

    const PROSPECT_NODE = { __scalar: true, phoneNumber: { __scalar: true }, primaryPhone: { __scalar: true }, videoUrl: { __scalar: true } };
    // A buyer keeps its phone and email on its point of contact, not on the row.
    const LEAD_NODE = LEAD_OBJECT === "buyers"
      ? { __scalar: true, pointOfContact: { __scalar: true, phones: { __scalar: true }, emails: { __scalar: true } } }
      : { __scalar: true, email: { __scalar: true }, phone: { __scalar: true } };
    // Last call filter: the contacts whose newest call ended that way, or
    // (Never called) every contact without a call.
    let scope: IdScope | undefined;
    const lastCall = typeof params.lastCall === "string" ? params.lastCall.trim() : "";
    if (lastCall) {
      const index = await lastCallIndex();
      if (lastCall === NEVER_CALLED) scope = { notIn: [...index.keys()] };
      else {
        const ids = [...index.entries()].filter(([, outcome]) => outcome === lastCall).map(([id]) => id);
        if (ids.length === 0) return res.json({ offset, rows: [], totalCount: 0, counts: { prospect: 0, lead: 0, person: 0 } });
        scope = { in: ids };
      }
    }
    const pq = types.prospects ? prospectGqlQuery(params, scope, PROSPECT_OBJECT) : null;
    const lq = types.leads ? leadGqlQuery(params, scope, LEAD_OBJECT) : null;

    // People (decision makers): company filters (assignee, country, status, last call...) match through the
    // person's prospect, so first collect the prospects that pass them.
    let peq: ReturnType<typeof personGqlQuery> | null = null;
    if (types.people) {
      let prospectIds: string[] | undefined;
      if (hasCompanyFilter(params) || scope) {
        const companyQ = prospectGqlQuery(params, scope, PROSPECT_OBJECT);
        prospectIds = [];
        let after: string | undefined;
        for (let page = 0; page < 25; page++) {
          const r: any = await client.query({
            [PROSPECT_OBJECT]: {
              __args: { first: 200, ...(after ? { after } : {}), ...(companyQ.filter ? { filter: companyQ.filter } : {}) },
              edges: { node: { id: true } },
              pageInfo: { hasNextPage: true, endCursor: true },
            },
          });
          prospectIds.push(...((r?.[PROSPECT_OBJECT]?.edges ?? []) as any[]).map((e: any) => e.node.id as string));
          if (!r?.[PROSPECT_OBJECT]?.pageInfo?.hasNextPage) break;
          after = r[PROSPECT_OBJECT].pageInfo.endCursor;
        }
      }
      peq = prospectIds && prospectIds.length === 0 ? null : personGqlQuery(params, prospectIds, PERSON_OWNER_FIELD);
    }
    const PERSON_NODE = { __scalar: true, phones: { __scalar: true }, emails: { __scalar: true }, ...(PERSON_OWNER_FIELD === "prospectId" ? {} : { [PERSON_OWNER_FIELD]: { __scalar: true } }) };

    const fetchSlice = async (object: string, q: { filter?: unknown; orderBy: unknown }, node: object, first: number, skip: number) => {
      const r: any = await client.query({
        [object]: { __args: { first: Math.max(1, first), offset: skip, orderBy: q.orderBy, ...(q.filter ? { filter: q.filter } : {}) }, totalCount: true, edges: { node } },
      });
      return { rows: (r?.[object]?.edges ?? []).map((e: any) => e.node), total: r?.[object]?.totalCount ?? 0 };
    };

    // Totals first (1-row queries), so the table can size its scroll area.
    const [pTotal, lTotal, peTotal] = await Promise.all([
      pq ? fetchSlice(PROSPECT_OBJECT, pq, { id: true }, 1, 0).then((r) => r.total) : Promise.resolve(0),
      // Leads are a bonus to the prospect list: if Twenty rejects the lead query, show prospects alone.
      lq
        ? fetchSlice(LEAD_OBJECT, lq, { id: true }, 1, 0)
            .then((r) => r.total)
            .catch((err) => {
              log.info(`Lead query skipped: ${err.message}`);
              return 0;
            })
        : Promise.resolve(0),
      peq ? fetchSlice(PERSON_OBJECT, peq, { id: true }, 1, 0).then((r) => r.total) : Promise.resolve(0),
    ]);

    const sources = [
      pq && pTotal > 0 ? { object: PROSPECT_OBJECT, q: pq, node: PROSPECT_NODE, total: pTotal, type: "prospect", map: mapProspectRow } : null,
      lq && lTotal > 0 ? { object: LEAD_OBJECT, q: lq, node: LEAD_NODE, total: lTotal, type: "lead", map: mapLeadRow } : null,
      peq && peTotal > 0
        ? {
            object: PERSON_OBJECT,
            q: peq,
            node: PERSON_NODE,
            total: peTotal,
            type: "person",
            map: (r: any) => ({ ...mapPersonListItem(r), prospectId: personCompanyId(r) }),
          }
        : null,
    ].filter((x): x is NonNullable<typeof x> => !!x);
    if (params.sort === "contact_type" && params.dir === "desc") sources.reverse();

    // Walk the window [offset, offset + limit) across the sources in order.
    let rows: any[] = [];
    let skip = offset;
    for (const src of sources) {
      if (rows.length >= limit) break;
      if (skip >= src.total) {
        skip -= src.total;
        continue;
      }
      const slice = await fetchSlice(src.object, src.q, src.node, limit - rows.length, skip);
      rows = rows.concat(slice.rows.map((r: any) => ({ ...src.map(r), type: src.type })));
      skip = 0;
    }

    // A person shows their company: its name, place, status, assignee and campaign (one request for the window).
    const companyOf = new Map<string, any>();
    const personCompanies = [...new Set(rows.filter((r) => r.type === "person" && r.prospectId).map((r) => r.prospectId as string))];
    if (personCompanies.length) {
      try {
        const r: any = await client.query({
          [PROSPECT_OBJECT]: { __args: { first: personCompanies.length, filter: { id: { in: personCompanies } } }, edges: { node: PROSPECT_NODE } },
        });
        for (const e of (r?.[PROSPECT_OBJECT]?.edges ?? []) as any[]) companyOf.set(e.node.id, mapProspectRow(e.node));
      } catch (err: any) {
        log.info(`Company lookup for people skipped: ${err.message}`);
      }
      rows = rows.map((r) => {
        const c = r.type === "person" ? companyOf.get(r.prospectId) : null;
        if (!c) return r;
        const company = [c.first_name, c.last_name].filter(Boolean).join(" ");
        return { ...r, company: company || r.company, niche: c.niche, country: c.country, state: c.state, city: c.city, status: c.status, assignedToId: c.assignedToId ?? null, campaign_id: c.campaign_id ?? null };
      });
    }

    // Last call per contact in this window: one request, not per row. A person's calls are logged on their company.
    const prospectIds = [...new Set([...rows.filter((r) => r.type === "prospect").map((r) => r.id), ...personCompanies])];
    const leadIds = rows.filter((r) => r.type === "lead").map((r) => r.id);
    const last = new Map<string, { id: string; status: string | null; at: string | null }>();
    const clauses = [
      prospectIds.length ? `${PROSPECT_RELATION_ID}[in]:[${prospectIds.join(",")}]` : null,
      leadIds.length ? `${LEAD_RELATION_ID}[in]:[${leadIds.join(",")}]` : null,
    ].filter(Boolean) as string[];
    if (clauses.length) {
      try {
        const calls: any = await fetchTwenty(CALL_OBJECT, {
          limit: 200,
          query: { filter: clauses.length > 1 ? `or(${clauses.join(",")})` : clauses[0], order_by: "createdAt[DescNullsLast]" },
        });
        for (const c of calls?.data?.[CALL_OBJECT] ?? []) {
          const owner = c[PROSPECT_RELATION_ID] || c[LEAD_RELATION_ID];
          if (owner && !last.has(owner)) last.set(owner, { id: c.id, status: c.disposition || c.status || null, at: c.startedAt ?? c.createdAt ?? null });
        }
      } catch (err: any) {
        log.info(`Last-call lookup skipped: ${err.message}`);
      }
    }

    res.json({
      offset,
      rows: rows.map((r) => ({ ...r, lastCall: last.get(r.type === "person" ? r.prospectId : r.id) ?? null })),
      totalCount: pTotal + lTotal + peTotal,
      counts: { prospect: pTotal, lead: lTotal, person: peTotal },
    });
  } catch (err: any) {
    log.error("Failed to page contacts:", err.message);
    res.status(500).json({ error: "Failed to fetch contacts from Twenty", details: err.message });
  }
});

/**
 * GET /api/prospects/facets — how many contacts have each status, country,
 * industry and campaign, counted by Twenty (groupBy), so filter menus show
 * counts without the browser loading the records.
 */
router.get("/facets", async (_req, res) => {
  try {
    const client: any = twentyGraphqlClient();
    const group = async (field: string) => {
      const r: any = await client.query({
        [`${PROSPECT_OBJECT}GroupBy`]: { __args: { groupBy: [{ [field]: true }], limit: 500 }, groupByDimensionValues: true, totalCount: true },
      });
      const out: Record<string, number> = {};
      for (const g of (r?.[`${PROSPECT_OBJECT}GroupBy`] ?? []) as any[]) {
        const key = g?.groupByDimensionValues?.[0];
        // Import placeholders ("unknown") are not a value anyone filters by: leave them out of the menus.
        if (typeof key === "string" && key !== "" && realText(key) === undefined) continue;
        out[key === null || key === undefined || key === "" ? "__blank" : String(key)] = g.totalCount ?? 0;
      }
      return out;
    };
    const none = () => ({}) as Record<string, number>;
    // Group on the fields this object has (landOpportunity has no country, no
    // campaign, no member assignee): a missing column counts as "no counts".
    const maybe = (field: string | null) => (field ? group(field) : Promise.resolve({}) as Promise<Record<string, number>>);
    const [status, country, industry, campaign, creators, state, city, assignedTo, leadSource, offer, memberNames, campaignNames, last] = await Promise.all([
      group(PROSPECT_FIELDS.status),
      maybe(PROSPECT_FIELDS.country),
      maybe(PROSPECT_FIELDS.industry),
      maybe(PROSPECT_FIELDS.campaign),
      group("createdByMemberId").catch(none),
      maybe(PROSPECT_FIELDS.state),
      maybe(PROSPECT_FIELDS.city),
      maybe(PROSPECT_FIELDS.assignedTo),
      maybe(PROSPECT_FIELDS.leadSource),
      maybe(PROSPECT_FIELDS.offer),
      // Names for the id-valued menus (Assigned to, Campaign).
      listWorkspaceMembers()
        .then((ms) => Object.fromEntries(ms.map((m) => [m.id, [m.firstName, m.lastName].filter(Boolean).join(" ").trim() || m.userEmail || m.id])))
        .catch(() => ({}) as Record<string, string>),
      listTwenty<AgencyCampaign>(CAMPAIGN_OBJECT, 200)
        .then((cs) => Object.fromEntries(cs.map((c: any) => [c.id, String(c.name ?? c.id)])))
        .catch(() => ({}) as Record<string, string>),
      // A failed call walk only loses the Last call counts, not the other filters.
      lastCallIndex().catch((err) => {
        log.info(`Last-call counts skipped: ${err.message}`);
        return null;
      }),
    ]);
    const creator = Object.entries(creators).reduce((sum, [k, n]) => (k === "__blank" ? sum : sum + n), 0);
    // The country grouping is the prospect count when the object has it; else ask Twenty directly.
    const total = Object.keys(country).length
      ? Object.values(country).reduce((a, b) => a + b, 0)
      : Number(((await fetchTwenty(PROSPECT_OBJECT, { limit: 1 })) as any)?.totalCount ?? 0);
    const leadsBody: any = await fetchTwenty(LEAD_OBJECT, { limit: 1 });
    // People are opt-in in the table (Type -> People), so they count in the Type menu but not in the total.
    const peopleBody: any = await fetchTwenty(PERSON_OBJECT, { limit: 1 }).catch(() => null);
    const people = typeof peopleBody?.totalCount === "number" ? peopleBody.totalCount : 0;
    const leads = typeof leadsBody?.totalCount === "number" ? leadsBody.totalCount : 0;
    const lastCall = last ? { ...outcomeCounts(last), [NEVER_CALLED]: Math.max(0, total + leads - last.size) } : {};
    res.json({
      total: total + leads,
      type: { prospect: total, lead: leads, person: people },
      status,
      country,
      industry,
      campaign,
      creator,
      state,
      city,
      lastCall,
      assignedTo,
      leadSource,
      offer,
      names: { member: memberNames, campaign: campaignNames },
    });
  } catch (err: any) {
    log.error("Failed to count prospect facets:", err.message);
    res.status(500).json({ error: "Failed to count contacts in Twenty", details: err.message });
  }
});

/**
 * GET /api/prospects/lookup?ids=a,b — just the contacts a page needs (names
 * for call history, a campaign's numbers), prospects or leads, at most 200
 * ids per request.
 */
router.get("/lookup", async (req, res) => {
  try {
    const ids = idList(req.query.ids);
    if (ids.length === 0) return res.json([]);
    // An id may be a prospect or a lead (calls point at either); ask both.
    const filter = `id[in]:[${ids.join(",")}]`;
    const [prospects, leads]: any[] = await Promise.all([
      fetchTwenty(PROSPECT_OBJECT, { limit: 200, query: { filter } }),
      fetchTwenty(LEAD_OBJECT, { limit: 200, query: { filter } }).catch(() => null),
    ]);
    res.json([
      ...(((prospects?.data ?? {} as any)[PROSPECT_OBJECT] ?? []) as AgencyProspect[]).map((r: any) => ({ ...mapProspectRow(r), type: "prospect" })),
      ...(((leads?.data ?? {} as any)[LEAD_OBJECT] ?? []) as any[]).map((r: any) => ({ ...mapLeadRow(r), type: "lead" })),
    ]);
  } catch (err: any) {
    log.error("Failed to look up prospects:", err.message);
    res.status(500).json({ error: "Failed to fetch contacts from Twenty", details: err.message });
  }
});

router.get("/:id", async (req, res) => {
  try {
    log.info(`Getting prospect ${req.params.id}`);
    const id = req.params.id as string;
    const prospect = await getTwenty<AgencyProspect>(PROSPECT_OBJECT, id);

    const mapped = mapProspectDetailView(prospect);

    res.json(mapped);
  } catch (err: any) {
    log.error(`Failed to get prospect ${req.params.id}:`, err.message);
    res.status(404).json({ error: "Prospect not found" });
  }
});

router.post("/", async (req: AuthRequest, res) => {
  try {
    const {
      first_name, last_name, phone, email, website,
      address, city, state, zip, status, source, tags, notes, dnc,
    } = req.body;

    const fullName = [first_name, last_name].filter(Boolean).join(" ").trim();
    const fullAddress = [address, city, state, zip].filter(Boolean).join(", ");

    // Map our status to the workspace's status column (coldCallStatus on
    // agency objects, opportunityStatus on landOpportunities).
    const coldCallStatus = frontendStatusToTwenty(status, dnc);

    log.info(`Creating prospect: ${fullName}`);

    let payload: Record<string, unknown>;
    if (PROSPECT_OBJECT === "agencyProspects") {
      // agencyProspect is shared with the offer funnel, whose NOT NULL contract
      // (website, geo, niche, label, slug) the manual-entry form cannot always
      // satisfy. Normalize rather than relax the object, so the funnel's
      // workflows keep working.
      const normalized = normalizeRequiredProspectFields({
        name: fullName,
        phone,
        email,
        website,
        fullAddress,
        city,
        region: state,
        source,
        now: Date.now(),
      });
      if (normalized.missing.length > 0) {
        res.status(400).json({
          error:
            normalized.missing.includes("phone")
              ? "A prospect needs a phone number - there is nothing to call without one."
              : "A prospect needs a city - the campaign routes on geography.",
          missing: normalized.missing,
        });
        return;
      }
      payload = {
        ...normalized.payload,
        rating: 0,
        reviewCount: 0,
        externalId: undefined,
        outboundState: tags?.[0],
        coldCallStatus,
        ...(notes ? { notes } : {}),
        ...(req.workspaceMemberId ? { createdByMemberId: req.workspaceMemberId } : {}),
      };
    } else {
      // The wholesale seller record is the parcel: a phone is the only thing
      // a call needs, and the address line is what names the record when the
      // form leaves the name empty.
      if (!String(phone ?? "").trim()) {
        res.status(400).json({
          error: "A prospect needs a phone number - there is nothing to call without one.",
          missing: ["phone"],
        });
        return;
      }
      payload = {
        ...frontendToOpportunityPayload({ first_name, last_name, phone, email, address, city, state, zip, notes }),
        name: fullName || address || String(phone).trim(),
        coldCallStatus,
        ...(source ? { leadSource: source } : {}),
      };
    }

    const result = await createTwenty<any>(PROSPECT_OBJECT, payload, await resolveActor(req));
    const prospect = result.data || result;

    const mapped = PROSPECT_OBJECT === "agencyProspects"
      ? {
          id: prospect.id,
          first_name,
          last_name,
          phone,
          email,
          website,
          address,
          city,
          state,
          zip,
          status: coldCallStatus === "DO_NOT_CONTACT" ? "do_not_contact" : "new",
          source,
          tags: tags || null,
          notes: notes,
          dnc: Boolean(dnc),
          sync_id: prospect.externalId,
          created_at: prospect.createdAt || new Date().toISOString(),
          updated_at: prospect.updatedAt || new Date().toISOString(),
        }
      : mapOpportunityCreateResult(prospect, { first_name, last_name, phone, email, address, city, state, zip, status, source, notes });

    log.info(`Created prospect ${prospect.id}`);
    res.status(201).json(mapped);
  } catch (err: any) {
    // website and slug carry UNIQUE indexes, so re-adding a business the funnel
    // already knows about is a real outcome, not a server fault.
    if (/duplicate entry|unique constraint/i.test(String(err?.message || ""))) {
      log.info(`Prospect create rejected as duplicate: ${err.message}`);
      res.status(409).json({
        error: "A prospect with that website already exists.",
        conflict: "website",
      });
      return;
    }
    log.error("Failed to create prospect:", err.message);
    res.status(500).json({ error: "Failed to create prospect in Twenty", details: err.message });
  }
});

router.patch("/:id", async (req: AuthRequest, res) => {
  try {
    log.info(`Updating prospect ${req.params.id}`);

    const {
      first_name, last_name, phone, email, website,
      address, city, state, zip, status, source, tags, notes, dnc,
      campaign_id,
    } = req.body;

    // Each object takes its own column names: landOpportunity has no website,
    // slug or campaign, and the wholesale form writes address parts, not one
    // composed address line.
    const wholesale = PROSPECT_OBJECT !== "agencyProspects";
    const payload: any = wholesale
      ? frontendToOpportunityPayload({ first_name, last_name, phone, email, address, city, state, zip, notes, status })
      : {};

    if (wholesale) {
      // frontendToOpportunityPayload already mapped status; the guard below
      // rewrites it after checking the transition.
      if (status !== undefined) delete payload.coldCallStatus;
      if (source !== undefined) payload.leadSource = source || null;
      if (email !== undefined) payload.email = email || null;
    } else {
      if (first_name !== undefined || last_name !== undefined) {
        const fullName = [first_name, last_name].filter(Boolean).join(" ").trim();
        if (fullName) payload.name = fullName;
      }
      if (phone !== undefined) payload.phone = phone;
      if (email !== undefined) payload.email = email;
      if (website !== undefined) payload.website = website;
      if (address !== undefined || city !== undefined || state !== undefined || zip !== undefined) {
        const fullAddress = [address, city, state, zip].filter(Boolean).join(", ");
        if (fullAddress) payload.fullAddress = fullAddress;
      }
      if (city !== undefined) payload.city = city;
      if (state !== undefined) payload.region = state;
      if (source !== undefined) payload.niche = source;
      if (notes !== undefined) payload.notes = notes || null;
      if (tags?.[0] !== undefined) payload.outboundState = tags[0];
      if (campaign_id !== undefined) payload.campaignIdId = campaign_id || null;
      if (req.body.assignedToId !== undefined) payload.assignedToId = req.body.assignedToId || null;
    }

    // Status changes follow the contact pipeline (packages/shared
    // contact-status): a move it does not allow is refused with the reason.
    if (status !== undefined || dnc) {
      const guard = await guardContactStatus(PROSPECT_OBJECT, req.params.id as string, status, { dnc, reopen: req.body?.reopen === true });
      if (!guard.ok) {
        res.status(guard.status).json({ error: guard.reason, code: "INVALID_TRANSITION" });
        return;
      }
      payload.coldCallStatus = guard.to;
    }

    if (Object.keys(payload).length === 0) {
      res.status(400).json({ error: "No fields to update" });
      return;
    }

    const id = req.params.id as string;
    const result = await updateTwenty<any>(PROSPECT_OBJECT, id, payload, await resolveActor(req));
    const prospect = result.data || result;

    const mapped = mapProspectUpdateView(prospect);

    log.info(`Updated prospect ${prospect.id}`);
    res.json(mapped);
  } catch (err: any) {
    log.error(`Failed to update prospect ${req.params.id}:`, err.message);
    res.status(500).json({ error: "Failed to update prospect in Twenty", details: err.message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    log.info(`Deleting prospect ${req.params.id}`);
    const id = req.params.id as string;

    await deleteTwenty(PROSPECT_OBJECT, id);

    log.info(`Deleted prospect ${id}`);
    res.status(204).end();
  } catch (err: any) {
    log.error(`Failed to delete prospect ${req.params.id}:`, err.message);
    res.status(500).json({ error: "Failed to delete prospect from Twenty", details: err.message });
  }
});

/**
 * GET /api/prospects/:id/website-status
 * Server-side aggregation for SendWebsiteWidget (Twenty key never leaves backend):
 * prospect messaging/video block + INDUSTRY agencyOffer + computed template/offer URLs.
 * Offer is industry-only (name == INDUSTRY:{urlKey}); industry routing (urlKey,
 * funnel/template bases, pack) is read from the agencyCampaign row — never
 * hardcoded, never defaulted. Missing rows surface as explicit nulls.
 */
router.get("/:id/website-status", async (req, res) => {
  try {
    const id = req.params.id as string;
    if (PROSPECT_OBJECT !== "agencyProspects") {
      // The offer site, the industry copy and the outreach labels belong to the
      // agency funnel, which the wholesale workspace does not have: say so
      // instead of serving a half-empty panel.
      res.json({ applicable: false, reason: "The offer site is only configured for agency prospects." });
      return;
    }
    const prospect = await getTwenty<AgencyProspect>(PROSPECT_OBJECT, id);

    // Industry routing from the campaign row: linked campaign first, else the
    // campaign whose industryId matches the prospect label.
    const routing = await resolveIndustryRouting(prospect);
    const industryKey = routing?.urlKey || null;
    const funnelBase = (routing?.funnelBaseUrl || "").replace(/\/$/, "");
    const templateBase = (routing?.templateBaseUrl || "").replace(/\/$/, "");
    const pack = routing?.packDir || null;

    // Offer lookup: the INDUSTRY row, never the per-prospect row.
    let offer: any = null;
    if (industryKey) {
      try {
        const offers = await listTwenty<any>('agencyOffers', {
          limit: 1,
          filter: `name[eq]:INDUSTRY:${industryKey}`,
        } as any);
        offer = offers[0] ?? null;
      } catch (err: any) {
        log.info(`No industry offer INDUSTRY:${industryKey} for prospect ${id}: ${err.message}`);
      }
    }

    // Effective video: industry CUSTOM override wins, else the prospect video.
    const prospectVideoUrl =
      typeof prospect.videoUrl === "string"
        ? prospect.videoUrl
        : (prospect.videoUrl as any)?.primaryLinkUrl || undefined;
    const offerMode = String(offer?.videoMode || "PROSPECT").toUpperCase();
    const overrideUrl =
      typeof offer?.videoUrl === "string"
        ? offer.videoUrl
        : offer?.videoUrl?.primaryLinkUrl || undefined;
    const effectiveVideoUrl =
      offerMode === "CUSTOM" && overrideUrl ? overrideUrl : prospectVideoUrl;

    // Canonical phone: PHONES composite first, legacy TEXT fallback.
    const phoneE164 = toE164(prospect.phoneNumber as any) || toE164(prospect.primaryPhone as any) || toE164(prospect.phone) || prospect.phone;

    // Absolute "website we built" URL: phi /offer/:industry/:slug lineup
    // (same slug as the funnel). Null when unconfigured — never invented.
    // No trailing slash (the Vercel rewrites match slash-less paths).
    const niche = prospect.niche || "";
    const labelValue = selectValue(prospect.label) || (niche ? slugifyIndustryValue(niche) : "UNLABELED");
    const slug = prospect.slug || "";
    const prospectId = prospect.id;
    const templateKey = slug || prospectId;
    const templateUrl = industryKey && templateBase ? `${templateBase}/offer/${industryKey}/${templateKey}` : null;
    const funnelSrc = funnelBase ? `${funnelBase}/offer/prospect/${prospectId}` : null;

    // The one page we send: on the offer site, previewable only when the
    // offer site's frame-ancestors lists the dialer's origin.
    const pageUrl = prospectPageUrl(prospectId);
    const origin = typeof req.query.origin === "string" ? req.query.origin : "";
    const framing = origin ? await framingHeaders(pageUrl) : null;
    const previewAllowed = framing ? frameAllowed(framing, origin) : false;

    res.json({
      applicable: true,
      page: {
        url: pageUrl,
        previewAllowed,
        previewBlockedReason: previewAllowed
          ? null
          : framing
            ? `${new URL(pageUrl).host} does not allow ${origin ? new URL(origin).host : "this app"} to embed it (Content-Security-Policy frame-ancestors).`
            : "The offer site could not be reached to check embedding.",
      },
      prospect: {
        id: prospectId,
        slug,
        niche,
        label: selectValue(prospect.label),
        labelValue,
        website: prospect.website,
        phone: prospect.phone,
        phoneE164,
        country: prospect.country,
        city: prospect.city,
        region: prospect.region,
        videoStatus: selectValue(prospect.videoStatus),
        videoSource: prospect.videoSource,
        videoError: prospect.videoError,
        videoUrl: prospect.videoUrl ?? null,
        outboundState: selectValue(prospect.outboundState),
        outboundLabel: selectValue(prospect.outboundLabel),
        smsMetadata: prospect.smsMetadata ?? null,
        whatsappStatus: selectValue(prospect.whatsappStatus),
      },
      offer: offer ? {
        id: offer.id,
        title: offer.title,
        heroH1: offer.heroH1,
        status: offer.status,
        ctaType: offer.ctaType,
        videoMode: offer.videoMode,
        industryId: offer.industryId,
        videoUrl: effectiveVideoUrl ? { primaryLinkUrl: effectiveVideoUrl } : (offer.videoUrl ?? null),
      } : null,
      urls: {
        industryKey,
        pack,
        slug,
        // Cosmetic display URL (industry + slug); the funnel resolves by prospect ID
        offerDisplayUrl: industryKey && slug ? `/offer/${industryKey}/${slug}` : null,
        funnelSrc,
        templateUrl,
        templateAvailable: templateUrl !== null,
      },
    });
  } catch (err: any) {
    log.error(`Failed to get website-status for ${req.params.id}:`, err.message);
    res.status(404).json({ error: "Prospect not found" });
  }
});

/**
 * POST /api/prospects/:id/website-sent
 * Logs that the prospect's page was sent. The outreach pipeline decides the
 * new outboundLabel (packages/shared onPageSent); refuses opted-out prospects
 * (409) and cross-country sends (422, checkSmsRoute).
 */
router.post("/:id/website-sent", async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    const { templateUrl, offerUrl, fromNumber, body } = req.body ?? {};
    const sentAt = new Date().toISOString();
    const current = await getTwenty<AgencyProspect>(PROSPECT_OBJECT, id);

    // Same rules as the SPA (packages/shared outreach): an opted-out prospect
    // gets nothing, and a number only texts its own country.
    const event = onPageSent(selectValue(current.outboundLabel));
    if (!event.ok) {
      res.status(409).json({ error: event.reason, code: "INVALID_TRANSITION" });
      return;
    }
    const toNumber = toE164(current.phoneNumber as any) || toE164(current.primaryPhone as any) || toE164(current.phone) || "";
    if (fromNumber) {
      const route = checkSmsRoute({ number: fromNumber }, { number: toNumber, country: current.country });
      if (!route.ok) {
        res.status(422).json({ error: route.reason, code: "SMS_ROUTE_BLOCKED" });
        return;
      }
    }

    let advancedLabel: string | null = null;
    if (event.changed) {
      await updateTwenty(PROSPECT_OBJECT, id, { outboundLabel: event.to }, await resolveActor(req));
      advancedLabel = event.to;
    }

    log.info(`Website sent logged for prospect ${id} from ${fromNumber || "unknown"}`);
    res.json({
      success: true,
      prospectId: id,
      sentAt,
      templateUrl: templateUrl ?? null,
      offerUrl: offerUrl ?? null,
      fromNumber: fromNumber ?? null,
      bodyPreview: typeof body === "string" ? body.slice(0, 280) : null,
      outboundLabel: advancedLabel,
    });
  } catch (err: any) {
    log.error(`Failed to log website-sent for ${req.params.id}:`, err.message);
    res.status(500).json({ error: "Failed to log website sent", details: err.message });
  }
});

/**
 * POST /api/prospects/:id/ensure-offer
 * Resolves the funnel 404 at the industry level: returns the INDUSTRY:{id}
 * offer for the prospect's industry, or creates it (neutral copy, ACTIVE,
 * videoMode=PROSPECT) so /offer/:industry/:slug + funnel links work immediately.
 * Per-prospect rows are never created here.
 */
router.post("/:id/ensure-offer", async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    if (PROSPECT_OBJECT !== "agencyProspects") {
      // Industry copy belongs to the agency funnel; the wholesale workspace has none.
      res.status(404).json({ error: "Industry not configured for prospect" });
      return;
    }
    const prospect = await getTwenty<AgencyProspect>(PROSPECT_OBJECT, id);
    const routing = await resolveIndustryRouting(prospect);
    if (!routing?.urlKey) {
      res.status(404).json({ error: "Industry not configured for prospect" });
      return;
    }
    const industryKey = routing.urlKey;
    const twentyValue = selectValue((routing as any).industryId) || selectValue(prospect.label) || "";
    const rowName = `INDUSTRY:${industryKey}`;

    const existing = await listTwenty<any>('agencyOffers', {
      limit: 1,
      filter: `name[eq]:${rowName}`,
    } as any);
    if (existing[0]) {
      res.json({ action: "existing" as const, industryKey, offer: existing[0] });
      return;
    }

    // Neutral seed copy only — the operator tailors it in the builder.
    const created = await createTwenty<any>('agencyOffers', {
      name: rowName,
      title: `Free Consultation`,
      heroH1: `Book Your Free Consultation`,
      heroLede: {
        blocknote: null,
        markdown: `Answer a few quick questions and book your free consultation call.`,
      },
      status: offerMachine.state("ACTIVE"),
      industryId: twentyValue || undefined,
      videoMode: "PROSPECT",
    });
    const offer = (created as any).data || created;
    log.info(`Created industry offer ${rowName} (${offer.id}) via prospect ${id}`);
    res.status(201).json({ action: "created" as const, industryKey, offer });
  } catch (err: any) {
    log.error(`Failed to ensure offer for ${req.params.id}:`, err.message);
    res.status(500).json({ error: "Failed to ensure offer", details: err.message });
  }
});

export default router;
