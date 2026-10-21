/** builderMatch / buybox as Twenty returns them, and the rows the panels show. */

export interface BuilderMatchRecord {
  id: string;
  name?: string | null;
  matchScore?: number | null;
  priceScore?: number | null;
  proximityScore?: number | null;
  buyboxFitScore?: number | null;
  distanceMiles?: number | null;
  interestStatus?: string | null;
  isActive?: boolean | null;
  lastScoredAt?: string | null;
  builderMaxPrice?: Money;
  builder?: { id: string; name?: string | null } | null;
  buybox?: BuyboxRecord | null;
}

/** A CURRENCY column: { amount, currencyCode } or, from older rows, a bare number. */
export type Money = { amount?: number | string | null; currencyCode?: string | null } | number | null | undefined;

export interface BuyboxRecord {
  id: string;
  name?: string | null;
  status?: string | null;
  minPrice?: Money;
  maxPrice?: Money;
  minLotSizeSqFt?: number | null;
  maxLotSizeSqFt?: number | null;
  states?: string[] | string | null;
  counties?: string[] | string | null;
  cities?: string[] | string | null;
  zoning?: string[] | string | null;
  propertyTypes?: string[] | string | null;
  buyer?: { id: string; name?: string | null } | null;
}

/** CURRENCY arrives as { amount, currencyCode } or as a plain number. */
export function amount(v: Money): number | null {
  if (typeof v === "number") return v;
  const n = Number(v?.amount);
  return Number.isFinite(n) ? n : null;
}

/** MULTI_SELECT values arrive as ["A", "B"] or "A,B"; both become a list. */
export function values(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x) => typeof x === "string" && x.trim()) as string[];
  if (typeof v === "string" && v.trim()) return v.split(",").map((s) => s.trim()).filter(Boolean);
  return [];
}

export function mapBuybox(r: BuyboxRecord) {
  return {
    id: r.id,
    name: r.name?.trim() || "Untitled buybox",
    status: r.status ?? null,
    min_price: amount(r.minPrice),
    max_price: amount(r.maxPrice),
    min_lot_size_sq_ft: r.minLotSizeSqFt ?? null,
    max_lot_size_sq_ft: r.maxLotSizeSqFt ?? null,
    states: values(r.states),
    counties: values(r.counties),
    cities: values(r.cities),
    zoning: values(r.zoning),
    property_types: values(r.propertyTypes),
  };
}

export function mapBuilderMatch(r: BuilderMatchRecord) {
  return {
    id: r.id,
    name: r.name?.trim() || r.builder?.name?.trim() || "Unnamed match",
    builder_id: r.builder?.id ?? null,
    builder_name: r.builder?.name?.trim() || null,
    match_score: r.matchScore ?? null,
    score: {
      price: r.priceScore ?? null,
      proximity: r.proximityScore ?? null,
      buybox_fit: r.buyboxFitScore ?? null,
    },
    distance_miles: r.distanceMiles ?? null,
    interest_status: r.interestStatus ?? null,
    is_active: r.isActive !== false,
    last_scored_at: r.lastScoredAt ?? null,
    max_price: amount(r.builderMaxPrice ?? null),
    buybox: r.buybox ? mapBuybox(r.buybox) : null,
  };
}
