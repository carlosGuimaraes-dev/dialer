/**
 * CRM-side conversation link helpers (agencyConversations).
 *
 * Source of truth for the Twenty shape is the schema manifest
 * (`lib/twenty/schema/manifest.ts`): the object, its link/metadata fields,
 * and the nullable agencyProspect / agencyPhone / agencyLead relations all
 * live there and are provisioned by `applySchema`. Nothing here creates
 * schema.
 *
 * Thread identity uses the messaging layer's canonical key
 * (`routes/messages/helpers.pairKey`, ours-first: "ours|theirs") for both
 * resolve-before-create and history lookup, so there is exactly one key
 * construction in the codebase. Message bodies and delivery state live in
 * agencyMessages / Blaster, never on this row.
 */

export interface ConversationLink {
  agencyProspectId?: string | null;
  agencyLeadId?: string | null;
}

/**
 * PATCH payload that preserves the SAME conversation across prospect -> lead
 * promotion: attach the new lead id, keep the existing prospect id.
 * The caller passes the conversation's current relation ids; nothing is
 * cleared. Pure — the route performs the Twenty update.
 */
export function promotionPatch(current: ConversationLink, leadId: string): Record<string, unknown> {
  const patch: Record<string, unknown> = { agencyLeadId: leadId };
  if (current.agencyProspectId) patch.agencyProspectId = current.agencyProspectId;
  return patch;
}
