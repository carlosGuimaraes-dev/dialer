/**
 * Which Twenty field backs each column of the Contacts table, per contact
 * object. The dialer's own objects (agencyProspect/agencyLead) carry every
 * column; the wholesale objects carry the same ideas under their own names,
 * and miss a few (no country, no campaign, no member assignee). Twenty
 * rejects a filter or a sort on a field the object does not have, so the
 * query builders read this map instead of hard-coding one object's fields.
 *
 * A `null` entry means the object has no such column: a filter on it cannot
 * match, and callers either drop it (facets) or skip that contact type.
 */
export interface ContactFieldMap {
  /** Overview search covers these (all text/searchable). */
  search: string[];
  name: string;
  /** Scalar text column holding the phone number, when the object has one. */
  phone: string | null;
  /** The dialer's "company" column (the firm, or the parcel for land). */
  company: string | null;
  industry: string | null;
  state: string | null;
  city: string | null;
  country: string | null;
  leadSource: string | null;
  campaign: string | null;
  /** Workspace-member assignee column, when the object has one. */
  assignedTo: string | null;
  /** Wholesale offer/industry-copy column. */
  offer: string | null;
  /** Status column the dialer reads and writes. */
  status: string;
  createdAt: string;
}

export const AGENCY_PROSPECT_FIELDS: ContactFieldMap = {
  search: ["name", "niche", "city", "region", "country", "phone", "email"],
  name: "name",
  phone: "phone",
  company: "niche",
  industry: "niche",
  state: "region",
  city: "city",
  country: "country",
  leadSource: "leadSource",
  campaign: "campaignIdId",
  assignedTo: "assignedToId",
  offer: "offer",
  status: "coldCallStatus",
  createdAt: "createdAt",
};

export const AGENCY_LEAD_FIELDS: ContactFieldMap = {
  search: ["name", "contactName"],
  name: "name",
  phone: "phone",
  company: null,
  industry: null,
  state: null,
  city: null,
  country: null,
  leadSource: null,
  campaign: "campaignIdId",
  assignedTo: null,
  offer: null,
  status: "coldCallStatus",
  createdAt: "createdAt",
};

/** landOpportunity: the property itself is the record, so "company" is the parcel. */
export const WHOLESALE_OPPORTUNITY_FIELDS: ContactFieldMap = {
  search: ["name", "ownerName", "parcelNumber", "city", "county", "state", "phone", "email"],
  name: "name",
  phone: "phone",
  company: "parcelNumber",
  industry: "propertyType",
  state: "state",
  city: "city",
  country: null,
  leadSource: "leadSource",
  campaign: null,
  assignedTo: null,
  offer: null,
  status: "coldCallStatus",
  createdAt: "createdAt",
};

/** buyer: a firm plus its point of contact; no place, industry or campaign. */
export const WHOLESALE_BUYER_FIELDS: ContactFieldMap = {
  search: ["name", "notes"],
  name: "name",
  phone: null,
  company: null,
  industry: null,
  state: null,
  city: null,
  country: null,
  leadSource: "source",
  campaign: null,
  assignedTo: null,
  offer: null,
  status: "coldCallStatus",
  createdAt: "createdAt",
};

/**
 * The map for a contact role, by the Twenty object's plural name. Unknown
 * objects fall back to the agency shape, which is what the dialer's own
 * schema creates.
 */
export function contactFields(plural: string): ContactFieldMap {
  if (plural === "landOpportunities") return WHOLESALE_OPPORTUNITY_FIELDS;
  if (plural === "buyers") return WHOLESALE_BUYER_FIELDS;
  if (plural === "agencyLeads") return AGENCY_LEAD_FIELDS;
  return AGENCY_PROSPECT_FIELDS;
}
