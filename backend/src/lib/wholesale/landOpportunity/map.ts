/**
 * landOpportunity <-> dialer "prospect" row. The Contacts table, the dialer
 * dock and every call flow read these dialer field names; the wholesale
 * workspace stores them on LandOpportunity columns. Pure.
 */

/** landOpportunity record, as far as the contact pages read it. */
export interface LandOpportunityRecord {
  id: string;
  name?: string | null;
  ownerName?: string | null;
  parcelNumber?: string | null;
  county?: string | null;
  state?: string | null;
  city?: string | null;
  propertyAddress?: string | null;
  zipCode?: string | null;
  zoning?: string | null;
  lotSizeSqFt?: number | null;
  propertyType?: string | null;
  askingPrice?: number | unknown;
  estimatedValue?: number | unknown;
  proposedOffer?: number | unknown;
  counteroffer?: number | unknown;
  opportunityStatus?: string | null;
  sellerStage?: string | null;
  negotiationStatus?: string | null;
  transactionStatus?: string | null;
  contractReadiness?: string | null;
  sellerInterest?: string | null;
  callOutcome?: string | null;
  lastCallAt?: string | null;
  lastCallSummary?: string | null;
  callOutcomeProcessed?: boolean | null;
  leadSource?: string | null;
  notes?: string | null;
  ownerContactId?: string | null;
  assignedBuilderId?: string | null;
  sourceUrl?: unknown;
  createdAt?: string;
  updatedAt?: string;
}

/** Workspace live SELECT vocabulary (landOpportunity.callOutcome). */
const OUTCOME_TO_FRONTEND: Record<string, string> = {
  INTERESTED: "interested",
  NOT_INTERESTED: "not_interested",
  CALLBACK_REQUESTED: "callback",
  DO_NOT_CALL: "do_not_contact",
  OFFER_REQUESTED: "interested",
  NO_ANSWER: "callback",
  VOICEMAIL: "callback",
  WRONG_NUMBER: "not_interested",
  OTHER: "contacted",
};

/** Workspace live SELECT vocabulary (landOpportunity.sellerStage). */
const SELLER_STAGE_TO_FRONTEND: Record<string, string> = {
  NEW_LEAD: "new",
  RESEARCH: "new",
  READY_FOR_OUTREACH: "new",
  CONTACT_ATTEMPTED: "contacted",
  CONTACTED: "contacted",
  INTERESTED: "interested",
  NEGOTIATION: "interested",
  ASSIGNED_CLOSED: "converted",
  NOT_INTERESTED: "not_interested",
  NO_RESPONSE: "callback",
  INVALID_CONTACT: "not_interested",
  DO_NOT_CONTACT: "do_not_contact",
  ON_HOLD: "callback",
};

/** Workspace live SELECT vocabulary (landOpportunity.opportunityStatus). */
const OPPORTUNITY_STATUS_TO_FRONTEND: Record<string, string> = {
  NEW: "new",
  RESEARCHING: "new",
  QUALIFIED: "contacted",
  PRESENTED_TO_BUILDER: "interested",
  NEGOTIATION: "interested",
  PURCHASED: "converted",
  REJECTED: "not_interested",
  ON_HOLD: "callback",
};

/** Frontend status -> the coldCallStatus SELECT on the borrowed object. */
export const FRONTEND_TO_OPPORTUNITY_STATUS: Record<string, string> = {
  new: "NEW",
  contacted: "CONTACTED",
  interested: "INTERESTED",
  not_interested: "NOT_INTERESTED",
  callback: "CALLBACK",
  converted: "CONVERTED",
  do_not_contact: "DO_NOT_CONTACT",
};

/** Dialer "company" column: the parcel identifies the property, not a firm. */
function companyOf(r: LandOpportunityRecord): string | null {
  return r.parcelNumber || r.county || null;
}

/** Location line the table shows under the name. */
export function locationLine(r: LandOpportunityRecord): string | null {
  return [r.city, r.state, r.county].filter(Boolean).join(", ") || null;
}

/** First phone-style contact value on the record (owner callback number). */
export function opportunityPhone(r: LandOpportunityRecord): string | null {
  const raw = (r as unknown as { phone?: unknown }).phone;
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return null;
}

/** The status the dialer pipeline sees. sellerStage wins (finer grained), then callOutcome, then opportunityStatus. */
export function opportunityToFrontendStatus(r: LandOpportunityRecord): string {
  const stage = SELLER_STAGE_TO_FRONTEND[String(r.sellerStage || "").toUpperCase()];
  if (stage) return stage;

  const outcome = OUTCOME_TO_FRONTEND[String(r.callOutcome || "").toUpperCase()];
  if (outcome) return outcome;

  return OPPORTUNITY_STATUS_TO_FRONTEND[String(r.opportunityStatus || "").toUpperCase()] ?? "new";
}

/** list/lookup row for the Contacts table. */
export function mapOpportunityListItem(r: LandOpportunityRecord) {
  const [first, ...rest] = String(r.name ?? "").trim().split(/\s+/).filter(Boolean);
  return {
    id: r.id,
    first_name: first ?? null,
    last_name: rest.join(" ") || null,
    company: companyOf(r),
    phone: opportunityPhone(r),
    email: null,
    city: r.city ?? null,
    state: r.state ?? null,
    country: r.state ?? null,
    status: opportunityToFrontendStatus(r),
    created_at: r.createdAt ?? null,
    updated_at: r.updatedAt ?? null,
  };
}

/** Detail payload for the contact page and the dock panel. */
export function mapOpportunityDetail(r: LandOpportunityRecord) {
  return {
    ...mapOpportunityListItem(r),
    address: r.propertyAddress ?? null,
    zip: r.zipCode ?? null,
    county: r.county ?? null,
    zoning: r.zoning ?? null,
    lot_size_sqft: r.lotSizeSqFt ?? null,
    property_type: r.propertyType ?? null,
    asking_price: r.askingPrice ?? null,
    estimated_value: r.estimatedValue ?? null,
    proposed_offer: r.proposedOffer ?? null,
    counteroffer: r.counteroffer ?? null,
    opportunity_status: r.opportunityStatus ?? null,
    seller_stage: r.sellerStage ?? null,
    negotiation_status: r.negotiationStatus ?? null,
    transaction_status: r.transactionStatus ?? null,
    contract_readiness: r.contractReadiness ?? null,
    seller_interest: r.sellerInterest ?? null,
    call_outcome: r.callOutcome ?? null,
    last_call_at: r.lastCallAt ?? null,
    last_call_summary: r.lastCallSummary ?? null,
    lead_source: r.leadSource ?? null,
    notes: r.notes ?? null,
    owner_contact_id: r.ownerContactId ?? null,
    assigned_builder_id: r.assignedBuilderId ?? null,
    source_url: r.sourceUrl ?? null,
  };
}

/** PATCH result (same shape the dialer already renders). */
export function mapOpportunityUpdateResult(r: LandOpportunityRecord) {
  return mapOpportunityDetail(r);
}

/** CREATE result with the form fields echoed back. */
export function mapOpportunityCreateResult(
  r: LandOpportunityRecord,
  form: { first_name?: string; last_name?: string; phone?: string; email?: string; address?: string; city?: string; state?: string; zip?: string; status?: string; source?: string; notes?: string },
) {
  return {
    ...mapOpportunityDetail(r),
    first_name: form.first_name ?? null,
    last_name: form.last_name ?? null,
    phone: form.phone ?? null,
    email: form.email ?? null,
    address: form.address ?? null,
    city: form.city ?? null,
    state: form.state ?? null,
    zip: form.zip ?? null,
    status: form.status ?? "new",
    source: form.source ?? null,
    notes: form.notes ?? null,
  };
}

/**
 * LandOpportunity columns the dialer form writes. `name` falls back to the
 * address so the workspace never holds an anonymous parcel.
 */
export function frontendToOpportunityPayload(input: {
  first_name?: string; last_name?: string; phone?: string; email?: string;
  address?: string; city?: string; state?: string; zip?: string;
  county?: string; status?: string; source?: string; notes?: string;
}): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  const name = [input.first_name, input.last_name].filter(Boolean).join(" ").trim();
  if (name) payload.name = name;
  if (input.address !== undefined) payload.propertyAddress = input.address;
  if (input.city !== undefined) payload.city = input.city;
  if (input.state !== undefined) payload.state = input.state;
  if (input.zip !== undefined) payload.zipCode = input.zip;
  if (input.county !== undefined) payload.county = input.county;
  if (input.notes !== undefined) payload.notes = input.notes || null;
  if (input.phone !== undefined) payload.phone = input.phone || null;
  if (input.email !== undefined) payload.email = input.email || null;
  if (input.status !== undefined) {
    const mapped = FRONTEND_TO_OPPORTUNITY_STATUS[input.status];
    if (mapped) payload.coldCallStatus = mapped;
  }
  return payload;
}

/** "CALLBACK — see notes" style digest written to lastCallSummary. Pure. */
export function callOutcomeSummary(disposition?: string | null, notes?: string | null): string {
  const parts = [disposition ? `Outcome: ${disposition}` : null, notes?.trim() || null].filter(Boolean);
  return parts.join(" — ").slice(0, 500);
}
