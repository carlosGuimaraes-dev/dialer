/**
 * Call disposition -> wholesale state. After a call is logged for a
 * landOpportunity or a buyer, the wholesale columns (callOutcome,
 * sellerStage/stage, lastCallAt, lastCallSummary) advance so the workspace —
 * including n8n bots listening on those fields — sees the outcome without
 * polling the call object. Best-effort: failures log, never fail the call.
 *
 * The SELECT vocabularies are the workspace's own (live options as of the
 * schema apply): callOutcome NO_ANSWER..DO_NOT_CALL, sellerStage
 * NEW_LEAD..ON_HOLD, buyer.stage INSERTED..DISQUALIFIED.
 */
import { createLogger } from "../../logger/index.js";
import { updateTwenty } from "../../twenty/client/index.js";
import { OBJECTS, type ContactObjectKey } from "../objects.js";
import { callOutcomeSummary } from "../landOpportunity/map.js";

const log = createLogger("wholesale-outcome");

/** Dialer disposition (agencyCall.disposition SELECT) -> callOutcome value. */
const DISPOSITION_TO_OUTCOME: Record<string, string> = {
  NO_ANSWER: "NO_ANSWER",
  VOICEMAIL: "VOICEMAIL",
  CALLBACK: "CALLBACK_REQUESTED",
  LEFT_CALLBACK: "CALLBACK_REQUESTED",
  APPOINTMENT_SET: "CALLBACK_REQUESTED",
  WRONG_NUMBER: "WRONG_NUMBER",
  BAD_NUMBER: "WRONG_NUMBER",
  NOT_INTERESTED: "NOT_INTERESTED",
  INTERESTED: "INTERESTED",
  DNC: "DO_NOT_CALL",
  GOOD_NUMBER: "OTHER",
};

/** Dialer disposition -> landOpportunity.sellerStage value. */
const DISPOSITION_TO_SELLER_STAGE: Record<string, string> = {
  INTERESTED: "INTERESTED",
  APPOINTMENT_SET: "NEGOTIATION",
  CALLBACK: "CONTACT_ATTEMPTED",
  LEFT_CALLBACK: "CONTACT_ATTEMPTED",
  VOICEMAIL: "CONTACT_ATTEMPTED",
  NOT_INTERESTED: "NOT_INTERESTED",
  DNC: "DO_NOT_CONTACT",
  WRONG_NUMBER: "INVALID_CONTACT",
  BAD_NUMBER: "INVALID_CONTACT",
  NO_ANSWER: "NO_RESPONSE",
};

/** Dialer disposition -> buyer.stage value. */
const DISPOSITION_TO_BUYER_STAGE: Record<string, string> = {
  INTERESTED: "QUALIFIED",
  APPOINTMENT_SET: "ACTIVE_BUYER",
  CALLBACK: "CONTACT_ATTEMPTED",
  LEFT_CALLBACK: "CONTACT_ATTEMPTED",
  VOICEMAIL: "CONTACT_ATTEMPTED",
  NOT_INTERESTED: "NOT_INTERESTED",
  DNC: "DO_NOT_CONTACT",
  WRONG_NUMBER: "INVALID_CONTACT",
  BAD_NUMBER: "INVALID_CONTACT",
  NO_ANSWER: "NO_RESPONSE",
};

/**
 * Advance the wholesale record after a finished call. `contactType` is the
 * dialer role: "prospect" -> landOpportunity, "lead" -> buyer.
 */
export async function writeBackCallOutcome(
  contactType: ContactObjectKey | "prospect" | "lead",
  contactId: string,
  info: { disposition?: string | null; notes?: string | null; endedAt?: string | null },
): Promise<void> {
  const key: ContactObjectKey = contactType === "lead" ? "leads" : "prospects";
  const object = key === "leads" ? OBJECTS.leads : OBJECTS.prospects;
  const disposition = (info.disposition || "").toUpperCase();
  const at = info.endedAt || new Date().toISOString();

  const patch: Record<string, unknown> = {
    lastCallAt: at,
    lastCallSummary: callOutcomeSummary(info.disposition, info.notes),
    callOutcomeProcessed: false,
  };
  const outcome = DISPOSITION_TO_OUTCOME[disposition];
  if (outcome) patch.callOutcome = outcome;
  const stage = key === "prospects" ? DISPOSITION_TO_SELLER_STAGE[disposition] : DISPOSITION_TO_BUYER_STAGE[disposition];
  if (stage) patch[key === "prospects" ? "sellerStage" : "stage"] = stage;

  try {
    await updateTwenty(object, contactId, patch);
    log.info(`wholesale outcome written to ${object} ${contactId}: ${outcome || disposition || "no disposition"}`);
  } catch (err: any) {
    log.info(`wholesale outcome write-back skipped for ${object} ${contactId}: ${err.message}`);
  }
}
