import type { Buybox } from "@/domains/api/client";

/** "$25,000 – $120,000" from the two ends of a buybox. */
export function priceRange(min: number | null, max: number | null): string | null {
  const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
  if (min !== null && max !== null) return `${money(min)} – ${money(max)}`;
  if (max !== null) return `up to ${money(max)}`;
  if (min !== null) return `from ${money(min)}`;
  return null;
}

/** "5,000–9,000 sq ft" from a buybox's lot size window. */
export function lotSizeRange(min: number | null, max: number | null): string | null {
  const size = (n: number) => Math.round(n).toLocaleString("en-US");
  if (min !== null && max !== null) return `${size(min)}–${size(max)} sq ft`;
  if (max !== null) return `up to ${size(max)} sq ft`;
  if (min !== null) return `from ${size(min)} sq ft`;
  return null;
}

/** "TX, OK, Collin, Denton" — the geography a buybox covers. */
export function areas(box: Pick<Buybox, "states" | "counties" | "cities">): string {
  return [...box.states, ...box.counties, ...box.cities].join(", ");
}
