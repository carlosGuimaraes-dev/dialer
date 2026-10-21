/**
 * Wholesale remap: the dialer speaks agency* (agencyProspects, agencyLeads,
 * agencyCalls, ...), the wholesale workspace speaks landOpportunities,
 * buyers, people. Every Twenty object name the dialer reads or writes goes
 * through OBJECTS, so re-pointing the whole app at the wholesale model is a
 * table change, not a code search.
 *
 * Relation fields follow their object: calls link to a landOpportunity via
 * landOpportunityId (was agencyProspectId), to a buyer via buyerId (was
 * agencyLeadId). The frontend keeps its "prospect"|"lead" contact types;
 * they are roles over these objects, not new Twenty objects.
 */
export const OBJECTS = {
  prospects: process.env.TWENTY_OBJ_PROSPECTS || "landOpportunities",
  leads: process.env.TWENTY_OBJ_LEADS || "buyers",
  calls: process.env.TWENTY_OBJ_CALLS || "agencyCalls",
  phones: process.env.TWENTY_OBJ_PHONES || "agencyPhones",
  people: process.env.TWENTY_OBJ_PEOPLE || "people",
  campaigns: process.env.TWENTY_OBJ_CAMPAIGNS || "agencyCampaigns",
  scripts: process.env.TWENTY_OBJ_SCRIPTS || "agencyScripts",
  messages: process.env.TWENTY_OBJ_MESSAGES || "agencyMessages",
  conversations: process.env.TWENTY_OBJ_CONVERSATIONS || "agencyConversations",
  callCampaigns: process.env.TWENTY_OBJ_CALL_CAMPAIGNS || "callCampaigns",
  filterViews: process.env.TWENTY_OBJ_FILTER_VIEWS || "dialerFilterViews",
  audioSessions: process.env.TWENTY_OBJ_AUDIO_SESSIONS || "dialerAudioSessions",
} as const;

export type ContactObjectKey = "prospects" | "leads";

/** Relation-id column on the call object for a contact role. */
export function contactRelationId(key: ContactObjectKey): string {
  return key === "leads" ? "buyerId" : "landOpportunityId";
}

/**
 * The dialer's agencyProspectId/agencyLeadId request fields mapped onto the
 * wholesale relation columns. Accepts both spellings so payloads from the
 * frontend need no rewrite.
 */
/**
 * Singular name of an object, as Twenty builds derived column names from it
 * (timeline target columns: targetLandOpportunityId, targetAgencyCallId).
 */
export function singularName(plural: string): string {
  if (plural === "people") return "person";
  if (/ies$/.test(plural)) return `${plural.slice(0, -3)}y`;
  return plural.replace(/s$/, "");
}

export function contactRelationAliases(key: ContactObjectKey): string[] {
  return key === "leads" ? ["buyerId", "agencyLeadId"] : ["landOpportunityId", "agencyProspectId"];
}
