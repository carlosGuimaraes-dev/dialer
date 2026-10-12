/** A dialerFilterView row as Twenty returns it. */
export interface FilterViewRecord {
  id: string;
  name: string | null;
  scope: string | null;
  memberId: string | null;
  filters: unknown;
  updatedAt?: string;
}

export interface FilterView {
  id: string;
  name: string;
  scope: string;
  filters: Record<string, string>;
  updatedAt: string | null;
}

/** The name of each member's auto-saved "filters on screen" row. */
export const CURRENT_VIEW = "__current";

const SCOPE = /^[a-z][a-zA-Z0-9-]{0,39}$/;

/** Where the filters apply ("dock", "contacts"); anything odd falls back to the dock. */
export function cleanScope(raw: unknown): string {
  return typeof raw === "string" && SCOPE.test(raw) ? raw : "dock";
}

/** A flat key -> string map, capped, so a view can never grow without bound. */
export function cleanFilters(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>).slice(0, 40)) {
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(key) || typeof value !== "string") continue;
    out[key] = value.slice(0, 2000);
  }
  return out;
}

export function mapFilterView(r: FilterViewRecord): FilterView {
  const filters = typeof r.filters === "string" ? safeParse(r.filters) : r.filters;
  return { id: r.id, name: r.name ?? "", scope: r.scope ?? "dock", filters: cleanFilters(filters), updatedAt: r.updatedAt ?? null };
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}
