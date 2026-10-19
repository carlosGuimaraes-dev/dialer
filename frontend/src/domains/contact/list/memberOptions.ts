/** Value for "the signed-in member" in member filters; resolved to their id before the query is sent. */
export const ME = "__me";
/** Twenty groupBy key for records with no value (matches the backend facets). */
export const UNASSIGNED = "__blank";

export interface MemberOption {
  value: string;
  label: string;
  /** Prospects assigned to this member (0 when they have none). */
  count: number;
  isMe?: boolean;
}

/**
 * Options for an "Assigned to" filter: Me first, then every workspace member (not only the ones who already
 * have prospects) alphabetically with their counts, then Unassigned. `names` is every workspace member by id
 * (the facets' names.member), `counts` the prospects per assignedToId.
 */
export function memberOptions(
  names: Record<string, string> | undefined,
  counts: Record<string, number> | undefined,
  me: string | null | undefined,
): MemberOption[] {
  const all = { ...Object.fromEntries(Object.keys(counts ?? {}).map((id) => [id, ""])), ...(names ?? {}) };
  delete all[UNASSIGNED];
  const others = Object.entries(all)
    .filter(([id]) => id !== me)
    .map(([id, name]) => ({ value: id, label: name.trim() || "Unknown member", count: counts?.[id] ?? 0 }))
    .sort((a, b) => a.label.localeCompare(b.label));
  return [
    ...(me ? [{ value: ME, label: "Me", count: counts?.[me] ?? 0, isMe: true }] : []),
    ...others,
    { value: UNASSIGNED, label: "Unassigned", count: counts?.[UNASSIGNED] ?? 0 },
  ];
}

/** The member id a filter value stands for ("Me" becomes the signed-in member, or Unassigned when signed out). */
export function resolveMember(value: string, me: string | null | undefined): string {
  return value === ME ? (me ?? UNASSIGNED) : value;
}
