import { phoneText, type AgencyPersonRecord } from "../../people/helpers.js";
import { realPhone } from "./placeholders.js";

/**
 * agencyPerson (a decision maker) -> a Contacts table row of type "person". The route then fills in the company
 * (name, place, status, assignee) from the person's prospect, because that is where calls and campaigns live. Pure.
 */
export function mapPersonListItem(r: AgencyPersonRecord) {
  const name = (r.name ?? "").trim() || "Unnamed person";
  const [first, ...rest] = name.split(/\s+/);
  return {
    id: r.id,
    first_name: first,
    last_name: rest.join(" ") || undefined,
    jobTitle: r.jobTitle?.trim() || null,
    role: r.personRole?.trim() || null,
    phone: realPhone(phoneText(r.phones)) ?? null,
    email: r.emails?.primaryEmail?.trim() || null,
    prospectId: r.prospectId ?? null,
    company: "",
    status: undefined as string | undefined,
    created_at: r.createdAt ?? null,
  };
}
