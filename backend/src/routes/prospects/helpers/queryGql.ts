/*
 * GraphQL form of the Contacts table query. Twenty's REST API pages by
 * cursor only; GraphQL also takes an `offset`, which is what lets the table
 * fetch any slice of the list (e.g. after the user drags the scrollbar to the
 * middle) instead of walking every page before it, the way Twenty's own
 * record table does.
 *
 * Every filter and sort names a field its object actually has (see
 * lib/wholesale/fields.ts): Twenty rejects a whole query on an unknown field,
 * so a column the object lacks becomes "matches nothing" instead.
 */

import { contactFields, type ContactFieldMap } from "../../../lib/wholesale/fields.js";

const STATUS_TO_TWENTY: Record<string, string> = {
  new: "NEW",
  contacted: "CONTACTED",
  interested: "INTERESTED",
  not_interested: "NOT_INTERESTED",
  callback: "CALLBACK",
  converted: "CONVERTED",
  do_not_contact: "DO_NOT_CONTACT",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function list(raw: unknown): string[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  return raw
    .split("|")
    .map((v) => v.trim().slice(0, 120))
    .filter(Boolean)
    .slice(0, 50);
}

type Filter = Record<string, unknown>;

/** A filter that can never match, for a column the object does not have. */
const NO_MATCH: Filter = { id: { in: ["00000000-0000-4000-8000-000000000000"] } };

function statusFilter(raw: unknown, field: string): Filter | null {
  const statuses = list(raw)
    .map((s) => STATUS_TO_TWENTY[s.toLowerCase()])
    .filter(Boolean);
  if (!statuses.length) return null;
  const clauses: Filter[] = [{ [field]: { in: statuses } }];
  if (statuses.includes("NEW")) clauses.push({ [field]: { is: "NULL" } });
  return clauses.length > 1 ? { or: clauses } : clauses[0];
}

/** `field in values`, where "__blank" also matches an empty field. */
function inOrBlank(field: string | null, values: string[]): Filter | null {
  if (!values.length) return null;
  if (!field) return NO_MATCH;
  const named = values.filter((v) => v !== "__blank");
  const clauses: Filter[] = named.length ? [{ [field]: { in: named } }] : [];
  if (values.includes("__blank")) clauses.push({ or: [{ [field]: { is: "NULL" } }, { [field]: { eq: "" } }] });
  return clauses.length > 1 ? { or: clauses } : clauses[0];
}

/** Relation id `in` values, where "__blank" matches no relation (ids have no empty string). */
function idInOrBlank(field: string | null, values: string[]): Filter | null {
  if (!values.length) return null;
  if (!field) return NO_MATCH;
  const ids = values.filter((v) => UUID.test(v));
  const clauses: Filter[] = ids.length ? [{ [field]: { in: ids } }] : [];
  if (values.includes("__blank")) clauses.push({ [field]: { is: "NULL" } });
  return clauses.length > 1 ? { or: clauses } : (clauses[0] ?? null);
}

/** SELECT `in` values (Twenty option values are UPPER_SNAKE), "__blank" = not set. */
function selectInOrBlank(field: string | null, values: string[]): Filter | null {
  if (!values.length) return null;
  if (!field) return NO_MATCH;
  const named = values.filter((v) => /^[A-Z0-9_]+$/.test(v));
  const clauses: Filter[] = named.length ? [{ [field]: { in: named } }] : [];
  if (values.includes("__blank")) clauses.push({ [field]: { is: "NULL" } });
  return clauses.length > 1 ? { or: clauses } : (clauses[0] ?? null);
}

function contains(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().slice(0, 120) : "";
}

/**
 * Ids from the last-call filter: only these (`in`), or all but these
 * (`notIn`, for "Never called"). Resolved by the route from the call index.
 */
export interface IdScope {
  in?: string[];
  notIn?: string[];
}

function idScope(scope?: IdScope): Filter | null {
  if (scope?.in) return { id: { in: scope.in } };
  if (scope?.notIn?.length) return { not: { id: { in: scope.notIn } } };
  return null;
}

/** The field a table column sorts on, or createdAt when the object has no such column. */
function sortField(params: Record<string, unknown>, f: ContactFieldMap): string {
  const column = typeof params.sort === "string" ? params.sort : "";
  const byColumn: Record<string, string | null> = {
    name: f.name,
    company: f.company,
    industry: f.industry,
    status: f.status,
    state: f.state,
    city: f.city,
    country: f.country,
    phone: f.phone,
    created: f.createdAt,
  };
  return byColumn[column] ?? f.createdAt;
}

function orderBy(params: Record<string, unknown>, f: ContactFieldMap): Record<string, string>[] {
  const field = sortField(params, f);
  const dir = params.dir === "asc" ? "AscNullsLast" : params.dir === "desc" ? "DescNullsLast" : field === f.createdAt ? "DescNullsLast" : "AscNullsLast";
  // Tie-break on id so rows never swap between pages.
  return [{ [field]: dir }, { id: "AscNullsFirst" }];
}

function combine(parts: Filter[]): Filter | undefined {
  return parts.length === 0 ? undefined : parts.length === 1 ? parts[0] : { and: parts };
}

/** Values are passed as GraphQL variables, never spliced into a query string. */
export function contactGqlQuery(params: Record<string, unknown>, f: ContactFieldMap, scope?: IdScope) {
  const parts: Filter[] = [];
  const text = typeof params.q === "string" ? params.q.trim().slice(0, 120) : "";
  if (text) {
    const like = `%${text}%`;
    parts.push({ or: f.search.map((name) => ({ [name]: { ilike: like } })) });
  }
  const status = statusFilter(params.status, f.status);
  if (status) parts.push(status);
  const name = contains(params.name);
  if (name) parts.push({ [f.name]: { ilike: `%${name}%` } });
  const phone = contains(params.phone);
  if (phone && f.phone) parts.push({ [f.phone]: { ilike: `%${phone}%` } });
  const columns: [string, string | null][] = [
    ["country", f.country],
    ["industry", f.industry],
    ["company", f.company],
    ["state", f.state],
    ["city", f.city],
  ];
  for (const [param, field] of columns) {
    const clause = inOrBlank(field, list(params[param]));
    if (clause) parts.push(clause);
  }
  const selects: [string, string | null][] = [
    ["leadSource", f.leadSource],
    ["offer", f.offer],
  ];
  for (const [param, field] of selects) {
    const clause = selectInOrBlank(field, list(params[param]));
    if (clause) parts.push(clause);
  }
  const assigned = idInOrBlank(f.assignedTo, list(params.assignedTo));
  if (assigned) parts.push(assigned);
  const ids = idScope(scope);
  if (ids) parts.push(ids);
  const campaigns = idInOrBlank(f.campaign, list(params.campaign));
  if (campaigns) parts.push(campaigns);
  return { filter: combine(parts), orderBy: orderBy(params, f) };
}

/** Prospect-role query; `plural` picks the object's field map. */
export function prospectGqlQuery(params: Record<string, unknown>, scope?: IdScope, plural = "agencyProspects") {
  return contactGqlQuery(params, contactFields(plural), scope);
}

/** Columns only some contact objects have: a filter on one leaves the others out. */
const OPTIONAL_COLUMNS = ["country", "industry", "company", "state", "city", "assignedTo", "leadSource", "offer"] as const;

/**
 * Lead-role query, or null when a filter names a column the lead object does
 * not have (it cannot match any lead, so the table shows prospects alone).
 */
export function leadGqlQuery(params: Record<string, unknown>, scope?: IdScope, plural = "agencyLeads") {
  const f = contactFields(plural);
  const missing = OPTIONAL_COLUMNS.some((k) => list(params[k]).length > 0 && !f[k]);
  if (missing) return null;
  return contactGqlQuery(params, f, scope);
}

// A person has a name, a job title and phones; the place, status and assignee belong to their company.
const PERSON_SORT: Record<string, string> = { name: "name", created: "createdAt" };

/** Filters that describe a person's company: people are matched through their prospect. */
const COMPANY_FILTERS = ["status", "country", "industry", "company", "state", "city", "assignedTo", "leadSource", "offer", "campaign"];

/** True when the query filters on something only the person's prospect has (assignee, country, status...). */
export function hasCompanyFilter(params: Record<string, unknown>): boolean {
  return COMPANY_FILTERS.some((k) => list(params[k]).length > 0);
}

/**
 * People. Search, name and phone match the person; company filters arrive as the ids of the prospects that passed
 * them (`prospectIds`, resolved by the route), so "People assigned to me in PA" works like any other type.
 *
 * `ownerRelation` is the person field pointing back at a prospect (agencyPerson.prospectId, person.ownedLandOpportunities
 * in the wholesale workspace), so the same filter works on either object.
 */
export function personGqlQuery(params: Record<string, unknown>, prospectIds?: string[], ownerRelation = "prospectId") {
  const parts: Filter[] = [];
  const text = typeof params.q === "string" ? params.q.trim().slice(0, 120) : "";
  if (text) parts.push({ or: ["name", "jobTitle"].map((f) => ({ [f]: { ilike: `%${text}%` } })) });
  const name = contains(params.name);
  if (name) parts.push({ name: { ilike: `%${name}%` } });
  const phone = contains(params.phone);
  if (phone) parts.push({ phones: { primaryPhoneNumber: { ilike: `%${phone}%` } } });
  if (prospectIds) parts.push({ [ownerRelation]: { id: { in: prospectIds } } });
  const field = PERSON_SORT[typeof params.sort === "string" ? params.sort : ""] ?? "createdAt";
  const dir = params.dir === "desc" ? "DescNullsLast" : "AscNullsLast";
  return { filter: combine(parts), orderBy: [{ [field]: dir }, { id: "AscNullsFirst" }] };
}

/** Window requested by the table: offset 0..∞, limit 1..200. */
export function pageWindow(params: Record<string, unknown>) {
  const offset = Math.max(0, Number.parseInt(String(params.offset ?? "0"), 10) || 0);
  const limit = Math.min(200, Math.max(1, Number.parseInt(String(params.limit ?? "50"), 10) || 50));
  return { offset, limit };
}
