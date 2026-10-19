import type { AgencyProspect } from "../types.js";

/**
 * Twenty's required text columns reject empty values, so imports fill them with "unknown" (and add a short hash to
 * websites and phones that clash with another record's unique value: "site.com/#f27a41", "201-216-1500 (f27a41)").
 * The dialer must not show those as real data, and must never dial "unknown". Pure.
 */
const PLACEHOLDER = /^(unknown|n\/a|na|none|null|-+)$/i;
const UNIQUE_TAG_URL = /\/?#[0-9a-f]{6}$/i;
const UNIQUE_TAG_PHONE = /\s*\([0-9a-f]{6}\)$/i;
/** 555-0100 to 555-0199 are reserved for fiction and test data in North America: never a real line. */
const FICTIONAL_555 = /55501\d\d$/;

/** A text value, or undefined when it is empty or an import placeholder. */
export function realText(value: string | null | undefined): string | undefined {
  const v = (value ?? "").trim();
  return v && !PLACEHOLDER.test(v) ? v : undefined;
}

/** A phone you can dial: no placeholder, no uniqueness tag, not a fictional 555-01xx number, at least 7 digits. */
export function realPhone(value: string | null | undefined): string | undefined {
  const v = realText(value)?.replace(UNIQUE_TAG_PHONE, "");
  const digits = v?.replace(/\D/g, "") ?? "";
  return v && digits.length >= 7 && !FICTIONAL_555.test(digits) ? v : undefined;
}

/** A website without the uniqueness tag an import added. */
export function realWebsite(value: string | null | undefined): string | undefined {
  return realText(value)?.replace(UNIQUE_TAG_URL, "") || undefined;
}

/** The prospect with import placeholders blanked, before it is mapped for the frontend. */
export function withoutPlaceholders(prospect: AgencyProspect): AgencyProspect {
  const p = prospect as AgencyProspect & Record<string, unknown>;
  return {
    ...prospect,
    city: realText(p.city as string),
    region: realText(p.region as string),
    fullAddress: realText(p.fullAddress as string),
    niche: realText(p.niche as string),
    phone: realPhone(p.phone as string),
    website: realWebsite(p.website as string),
  } as AgencyProspect;
}
