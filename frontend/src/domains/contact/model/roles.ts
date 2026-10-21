/*
 * What the app calls each contact role.
 *
 * The dialer's roles ("prospect", "lead") are internal: the records behind them
 * are landOpportunity and buyer (see twenty/objects). The interface speaks the
 * wholesale language instead — a prospect is a seller lot, a lead is a builder —
 * so keep every user-visible name here rather than scattering strings.
 */
export interface RoleLabel {
  one: string;
  many: string;
}

export const ROLE_LABELS = {
  prospect: { one: "Seller lot", many: "Seller lots" },
  lead: { one: "Builder", many: "Builders" },
  person: { one: "Person", many: "People" },
} as const;

/** Label for a role, singular or plural. */
export function roleLabel(role: keyof typeof ROLE_LABELS, plural = false): string {
  const label = ROLE_LABELS[role];
  return plural ? label.many : label.one;
}
