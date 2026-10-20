/**
 * buyer <-> dialer "lead" row. Buyers are the cash buyers/investors the
 * wholesale deals are assigned to; in dialer language they are the secondary
 * contact list ("Leads" page, type "lead" in the combined table). Pure.
 */

/** buyer record, as far as the leads pages read it. */
export interface BuyerRecord {
  id: string;
  name?: string | null;
  stage?: string | null;
  source?: string | null;
  callOutcome?: string | null;
  lastCallAt?: string | null;
  lastCallSummary?: string | null;
  callOutcomeProcessed?: boolean | null;
  notes?: string | null;
  companyId?: string | null;
  pointOfContactId?: string | null;
  ownerId?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Buyer stage -> dialer status. The workspace stage is INSERTED..DISQUALIFIED
 * (see the live SELECT on buyer.stage); the dialer pipeline collapses it to
 * six buckets. The write path prefers coldCallStatus (dedicated dialer
 * column) and only falls back to the workspace stage.
 */
const BUYER_STAGE_TO_FRONTEND: Record<string, string> = {
  INSERTED: "new",
  RESEARCH: "new",
  READY_FOR_CONTACT: "new",
  CONTACT_ATTEMPTED: "contacted",
  CONTACTED: "contacted",
  QUALIFIED: "interested",
  ACTIVE_BUYER: "converted",
  NOT_INTERESTED: "not_interested",
  NO_RESPONSE: "callback",
  INVALID_CONTACT: "not_interested",
  DO_NOT_CONTACT: "do_not_contact",
  ON_HOLD: "callback",
  DISQUALIFIED: "not_interested",
};

const BUYER_OUTCOME_TO_FRONTEND: Record<string, string> = {
  INTERESTED: "interested",
  NOT_INTERESTED: "not_interested",
  CALLBACK_REQUESTED: "callback",
  DO_NOT_CALL: "do_not_contact",
  BUYBOX_REQUESTED: "interested",
  NO_ANSWER: "callback",
  VOICEMAIL: "callback",
  WRONG_NUMBER: "not_interested",
  OTHER: "contacted",
};

export const FRONTEND_TO_BUYER_STAGE: Record<string, string> = {
  new: "NEW",
  contacted: "CONTACTED",
  interested: "INTERESTED",
  not_interested: "NOT_INTERESTED",
  callback: "CALLBACK",
  converted: "CONVERTED",
  do_not_contact: "DO_NOT_CONTACT",
};

export function buyerToFrontendStatus(r: BuyerRecord): string {
  const cold = FRONTEND_TO_BUYER_STAGE[String((r as unknown as { coldCallStatus?: string }).coldCallStatus || "").toLowerCase()];
  if (cold) return String((r as unknown as { coldCallStatus?: string }).coldCallStatus).toLowerCase() === "do_not_contact" ? "do_not_contact" : cold;
  const outcome = BUYER_OUTCOME_TO_FRONTEND[String((r as unknown as { callOutcome?: string }).callOutcome || "").toUpperCase()];
  if (outcome) return outcome;
  return BUYER_STAGE_TO_FRONTEND[String(r.stage || "").toUpperCase()] ?? "new";
}

/** Phone/email live on the buyer's point of contact (a person row). */
export function mapBuyerListItem(r: BuyerRecord, contact?: { phone?: string | null; email?: string | null } | null) {
  const [first, ...rest] = String(r.name ?? "").trim().split(/\s+/).filter(Boolean);
  return {
    id: r.id,
    first_name: first ?? null,
    last_name: rest.join(" ") || null,
    company: null,
    phone: contact?.phone ?? null,
    email: contact?.email ?? null,
    status: buyerToFrontendStatus(r),
    created_at: r.createdAt ?? null,
    updated_at: r.updatedAt ?? null,
  };
}

export function mapBuyerDetail(r: BuyerRecord, contact?: { phone?: string | null; email?: string | null; name?: string | null } | null) {
  return {
    ...mapBuyerListItem(r, contact),
    buyer_stage: r.stage ?? null,
    source: r.source ?? null,
    call_outcome: r.callOutcome ?? null,
    last_call_at: r.lastCallAt ?? null,
    last_call_summary: r.lastCallSummary ?? null,
    notes: r.notes ?? null,
    company_id: r.companyId ?? null,
    point_of_contact_id: r.pointOfContactId ?? null,
    point_of_contact_name: contact?.name ?? null,
    owner_id: r.ownerId ?? null,
  };
}

export function mapBuyerUpdateResult(r: BuyerRecord) {
  return mapBuyerDetail(r);
}

/** PATCH/POST bodies -> Buyer columns (stage mirrors the dialer pipeline). */
export function frontendToBuyerPayload(input: {
  first_name?: string; last_name?: string; phone?: string; email?: string;
  status?: string; source?: string; notes?: string;
}): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  const name = [input.first_name, input.last_name].filter(Boolean).join(" ").trim();
  if (name) payload.name = name;
  if (input.notes !== undefined) payload.notes = input.notes || null;
  if (input.source !== undefined) payload.source = input.source || null;
  if (input.status !== undefined) {
    const mapped = FRONTEND_TO_BUYER_STAGE[input.status];
    if (mapped) payload.coldCallStatus = mapped;
  }
  return payload;
}
