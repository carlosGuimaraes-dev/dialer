import { contactStatusMachine, toContactStatus, type ContactStatus } from "@dialer/shared";
import { getTwenty } from "../twenty/client/index.js";
import { OBJECTS } from "../wholesale/objects.js";

/**
 * Write-side guard for coldCallStatus. Every route that changes a contact's
 * status goes through here, so a change the pipeline does not allow is
 * refused with a reason (HTTP 409) instead of landing in Twenty.
 */
export type GuardResult = { ok: true; to: ContactStatus; changed: boolean } | { ok: false; status: 400 | 409; reason: string };

/** Pure: the requested value against the current one. */
export function checkContactStatus(current: unknown, requested: unknown, options: { dnc?: unknown; reopen?: boolean } = {}): GuardResult {
  const to = options.dnc ? "DO_NOT_CONTACT" : toContactStatus(requested);
  if (!to) return { ok: false, status: 400, reason: `"${String(requested)}" is not a contact status.` };
  const from = toContactStatus(current) ?? "NEW";
  const result = contactStatusMachine.transition(from, to, { override: !!options.reopen });
  return result.ok ? { ok: true, to: result.to, changed: result.changed } : { ok: false, status: 409, reason: result.reason };
}

/**
 * Every contact-bearing object (agency* and wholesale alike) carries the
 * dialer-owned coldCallStatus SELECT: `twenty:schema` adds it to
 * landOpportunity and buyer when missing, so the contact pipeline stays the
 * single authority and the workspace's own columns (opportunityStatus,
 * stage) are never written by the dialer.
 */
const STATUS_FIELD = "coldCallStatus";

/** Reads the record's current status from Twenty, then checks the change. */
export async function guardContactStatus(
  object: string,
  id: string,
  requested: unknown,
  options: { dnc?: unknown; reopen?: boolean } = {},
): Promise<GuardResult> {
  const name = object === "prospects" ? OBJECTS.prospects : object === "leads" ? OBJECTS.leads : object;
  const field = STATUS_FIELD;
  const record = await getTwenty<{ [k: string]: unknown }>(name, id);
  const current = typeof record?.[field] === "object" && record?.[field] !== null ? (record[field] as any).value : record?.[field];
  return checkContactStatus(current, requested, options);
}
