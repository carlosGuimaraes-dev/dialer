import { toTwentyEmail, toTwentyPhone } from "../leads/helpers/mapLead.js";

/**
 * A person as the fused workspace stores it: FULL_NAME as an object, a role
 * enum instead of free text, no city column, and the seller lots it owns as
 * the back-reference (was agencyPerson.prospectId).
 */
export interface AgencyPersonRecord {
  id: string;
  name?: string | { firstName?: string | null; lastName?: string | null } | null;
  jobTitle?: string | null;
  contactRole?: string | null;
  avatarUrl?: string | null;
  phones?: { primaryPhoneNumber?: string; primaryPhoneCallingCode?: string; additionalPhones?: unknown[] } | null;
  emails?: { primaryEmail?: string; additionalEmails?: unknown[] } | null;
  linkedinLink?: { primaryLinkUrl?: string } | null;
  xLink?: { primaryLinkUrl?: string } | null;
  ownedLandOpportunities?: { id: string }[] | { id: string } | string | null;
  createdAt?: string;
}

export interface Person {
  id: string;
  name: string;
  jobTitle: string | null;
  role: string | null;
  avatarUrl: string | null;
  phone: string | null;
  email: string | null;
  linkedin: string | null;
  x: string | null;
  prospectId: string | null;
  createdAt: string | null;
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The workspace's contactRole options; anything else is rejected by the API. */
export const CONTACT_ROLES = ["OWNER", "PRESIDENT", "LAND_ACQUISITION", "ACQUISITIONS_MANAGER", "PROJECT_MANAGER", "OTHER"] as const;

/** "LAND_ACQUISITION" -> "Land acquisition". */
export function roleLabel(role?: string | null): string | null {
  const raw = role?.trim();
  if (!raw) return null;
  const words = raw.replace(/_/g, " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** "Land acquisition" -> "LAND_ACQUISITION"; null when it is not an option. */
export function roleValue(text?: string | null): string | null {
  const key = String(text ?? "").trim().replace(/[\s-]+/g, "_").toUpperCase();
  return (CONTACT_ROLES as readonly string[]).includes(key) ? key : null;
}

/** FULL_NAME arrives as { firstName, lastName } or as a string. */
export function personName(name: AgencyPersonRecord["name"]): string | null {
  if (typeof name === "string") return name.trim() || null;
  const full = [name?.firstName, name?.lastName].map((p) => p?.trim()).filter(Boolean).join(" ");
  return full || null;
}

/** "John Lally" -> { firstName: "John", lastName: "Lally" }. Pure. */
export function fullName(name: string): { firstName: string; lastName: string } {
  const [first, ...rest] = name.trim().split(/\s+/).filter(Boolean);
  return { firstName: first ?? "", lastName: rest.join(" ") };
}

/** Twenty PHONES -> E.164. The calling code may be stored with or without "+". Pure. */
export function phoneText(p: AgencyPersonRecord["phones"]): string | null {
  const num = String(p?.primaryPhoneNumber ?? "").trim();
  if (!num) return null;
  if (num.startsWith("+")) return num;
  const code = String(p?.primaryPhoneCallingCode ?? "").replace(/\D/g, "");
  return code ? `+${code}${num.replace(/\D/g, "")}` : num;
}

function linkUrl(l?: { primaryLinkUrl?: string } | null): string | null {
  const url = l?.primaryLinkUrl?.trim();
  if (!url) return null;
  return /^https?:/i.test(url) ? url : `https://${url}`;
}

function textOrNull(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** The seller lot a person owns, whichever shape the relation arrives in. */
function ownedLotId(r: AgencyPersonRecord): string | null {
  const owner = r.ownedLandOpportunities as any;
  if (typeof owner === "string") return owner;
  if (Array.isArray(owner)) return owner[0]?.id ?? null;
  // A connection arrives as { edges: [{ node }] }.
  return owner?.edges?.[0]?.node?.id ?? owner?.id ?? null;
}

export function mapPerson(r: AgencyPersonRecord): Person {
  return {
    id: r.id,
    name: personName(r.name) ?? "Unnamed person",
    jobTitle: textOrNull(r.jobTitle),
    role: roleLabel(r.contactRole),
    avatarUrl: textOrNull(r.avatarUrl),
    phone: phoneText(r.phones),
    email: textOrNull(r.emails?.primaryEmail),
    linkedin: linkUrl(r.linkedinLink),
    x: linkUrl(r.xLink),
    prospectId: ownedLotId(r),
    createdAt: r.createdAt ?? null,
  };
}

const EMPTY_PHONES = { primaryPhoneNumber: "", primaryPhoneCountryCode: "", primaryPhoneCallingCode: "", additionalPhones: [] };
const EMPTY_EMAILS = { primaryEmail: "", additionalEmails: [] };

/** Request body -> Twenty payload. Only fields present in the body are written. Pure. */
export function personPayload(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const str = (v: unknown) => String(v ?? "").trim();
  if (body.name !== undefined) out.name = fullName(str(body.name));
  if (body.jobTitle !== undefined) out.jobTitle = str(body.jobTitle);
  if (body.role !== undefined) {
    // The column is an enum: free text cannot be written, so it is dropped.
    const role = roleValue(str(body.role));
    if (role) out.contactRole = role;
  }
  if (body.phone !== undefined) out.phones = toTwentyPhone(body.phone) ?? EMPTY_PHONES;
  if (body.email !== undefined) out.emails = toTwentyEmail(body.email) ?? EMPTY_EMAILS;
  if (body.linkedin !== undefined) out.linkedinLink = { primaryLinkUrl: str(body.linkedin), primaryLinkLabel: "", secondaryLinks: [] };
  return out;
}
