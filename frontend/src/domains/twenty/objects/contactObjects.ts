/*
 * The Twenty object behind each dialer contact role.
 *
 * The dialer's own schema named them agencyProspects/agencyLeads. The
 * wholesale workspace names them landOpportunities/buyers, and that is what
 * the backend reads and writes (backend/src/lib/wholesale/objects.ts), so any
 * deep link, field-options fetch or change-history lookup has to use the same
 * names. Overridable with the same env vars the backend honours.
 */
const env = import.meta.env as Record<string, string | undefined>;

export const CONTACT_OBJECTS = {
  prospects: env.VITE_TWENTY_OBJ_PROSPECTS || "landOpportunities",
  leads: env.VITE_TWENTY_OBJ_LEADS || "buyers",
  calls: env.VITE_TWENTY_OBJ_CALLS || "agencyCalls",
  phones: env.VITE_TWENTY_OBJ_PHONES || "agencyPhones",
  campaigns: env.VITE_TWENTY_OBJ_CAMPAIGNS || "agencyCampaigns",
  scripts: env.VITE_TWENTY_OBJ_SCRIPTS || "agencyScripts",
  messages: env.VITE_TWENTY_OBJ_MESSAGES || "agencyMessages",
  callCampaigns: env.VITE_TWENTY_OBJ_CALL_CAMPAIGNS || "callCampaigns",
} as const;

/** Plural name for a contact role ("prospect" -> landOpportunities). */
export function contactObjectName(type: "prospect" | "lead"): string {
  return type === "lead" ? CONTACT_OBJECTS.leads : CONTACT_OBJECTS.prospects;
}

/** Singular name for a contact role, for /object/<singular>/<id> links. */
export function contactObjectSingular(type: "prospect" | "lead"): string {
  return contactObjectName(type).replace(/ies$/, "y").replace(/s$/, "");
}
