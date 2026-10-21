import { useQuery } from "@tanstack/react-query";
import { api, type BuilderMatch, type Buybox } from "@/domains/api/client";

/** Builders whose buybox fits this seller lot, best score first. */
export function useBuilderMatches(landOpportunityId: string | null) {
  return useQuery<BuilderMatch[]>({
    queryKey: ["wholesale", "matches", landOpportunityId],
    queryFn: () => api.wholesale.matches(landOpportunityId!),
    enabled: Boolean(landOpportunityId),
    staleTime: 5 * 60_000,
  });
}

/** What this builder will buy. */
export function useBuyboxes(buyerId: string | null) {
  return useQuery<Buybox[]>({
    queryKey: ["wholesale", "buyboxes", buyerId],
    queryFn: () => api.wholesale.buyboxes(buyerId!),
    enabled: Boolean(buyerId),
    staleTime: 5 * 60_000,
  });
}
