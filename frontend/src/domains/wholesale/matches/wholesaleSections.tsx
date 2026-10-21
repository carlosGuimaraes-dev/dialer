import type { BuilderMatch, Buybox } from "@/domains/api/client";
import { Section, SectionRow } from "@/domains/ui/section";
import { Target, Building } from "@/domains/ui/icons";
import { useBuilderMatches, useBuyboxes } from "./useMatches";
import { areas, lotSizeRange, priceRange } from "./format";

/** 82 -> "82% match". A pairing nobody has scored yet reads "Not scored". */
const scoreLabel = (score: number | null) => (score === null ? "Not scored" : `${Math.round(score)}% match`);

const line = "text-[12px] text-[var(--ods-text-tertiary)] truncate";

export function BuilderMatchRow({ match }: { match: BuilderMatch }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <span className="text-[13px] font-semibold truncate flex-1">{match.name}</span>
        <span className="text-[12px] tabular-nums shrink-0 text-[var(--ods-text-secondary)]">{scoreLabel(match.match_score)}</span>
      </div>
      <div className={line}>
        {[match.buybox?.name, match.distance_miles !== null ? `${match.distance_miles} mi` : null, priceRange(null, match.max_price)]
          .filter(Boolean)
          .join(" · ")}
      </div>
    </div>
  );
}

export function BuyboxRow({ box }: { box: Buybox }) {
  return (
    <div className="min-w-0">
      <div className="text-[13px] font-semibold truncate">{box.name}</div>
      <div className={line}>
        {[priceRange(box.min_price, box.max_price), lotSizeRange(box.min_lot_size_sq_ft, box.max_lot_size_sq_ft)].filter(Boolean).join(" · ")}
      </div>
      {areas(box) && <div className={line}>{areas(box)}</div>}
    </div>
  );
}

/**
 * The builders whose buybox this seller lot fits, best score first. Renders
 * nothing until there is at least one match, so an unscored lot looks the
 * same as it did before the wholesale objects existed.
 */
export function BuilderMatchesSection({ landOpportunityId }: { landOpportunityId: string }) {
  const { data: matches } = useBuilderMatches(landOpportunityId);
  if (!matches?.length) return null;
  return (
    <Section
      title="Builder matches"
      icon={Target}
      count={matches.length}
      tip={{
        title: "Builder matches",
        icon: Target,
        what: "Builders whose buybox this parcel fits, with the score the matching pipeline gave each pairing (overall, price, distance, buybox fit). Read-only here: the pipeline owns the scores, a call moves Interest status.",
      }}
    >
      {matches.map((m) => (
        <SectionRow key={m.id}>
          <BuilderMatchRow match={m} />
        </SectionRow>
      ))}
    </Section>
  );
}

/** What this builder will buy: price and lot-size window, then geography. */
export function BuyboxesSection({ buyerId }: { buyerId: string }) {
  const { data: boxes } = useBuyboxes(buyerId);
  if (!boxes?.length) return null;
  return (
    <Section
      title="Buyboxes"
      icon={Building}
      count={boxes.length}
      tip={{
        title: "Buyboxes",
        icon: Building,
        what: "The acquisition criteria this builder gave: price and lot size window, states, counties, cities, zoning and property types. Every seller lot is scored against them.",
      }}
    >
      {boxes.map((b) => (
        <SectionRow key={b.id}>
          <BuyboxRow box={b} />
        </SectionRow>
      ))}
    </Section>
  );
}
