import { personName, roleLabel, phoneText, type AgencyPersonRecord } from "../../people/helpers.js";
import { realPhone } from "./placeholders.js";

/**
 * A person (a decision maker) -> a Contacts table row of type "person". The route then fills in the company
 * (name, place, status, assignee) from the person's seller lot, because that is where calls and campaigns live. Pure.
 */
function ownedLotId(owner: AgencyPersonRecord["ownedLandOpportunities"]): string | null {
  if (typeof owner === "string") return owner;
  if (Array.isArray(owner)) return owner[0]?.id ?? null;
  return owner?.id ?? null;
}

export function mapPersonListItem(r: AgencyPersonRecord) {
  const name = personName(r.name) ?? "Unnamed person";
  const [first, ...rest] = name.split(/\s+/);
  return {
    id: r.id,
    first_name: first,
    last_name: rest.join(" ") || undefined,
    jobTitle: r.jobTitle?.trim() || null,
    role: roleLabel(r.contactRole),
    phone: realPhone(phoneText(r.phones)) ?? null,
    email: r.emails?.primaryEmail?.trim() || null,
    prospectId: ownedLotId(r.ownedLandOpportunities),
    company: "",
    status: undefined as string | undefined,
    created_at: r.createdAt ?? null,
  };
}
