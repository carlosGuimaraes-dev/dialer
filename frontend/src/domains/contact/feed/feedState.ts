/**
 * Which body the contact feed may honestly show. The feed merges calls,
 * texts and record changes from independent queries; while either remote
 * source is still on its first load the feed must show a loading state,
 * never the empty state — otherwise "Nothing here yet" flashes before the
 * items pop in. A failed source is reported instead of looking empty.
 */
export type FeedBodyState = "loading" | "error" | "empty" | "content";

export function resolveFeedBodyState(input: {
  textsLoading: boolean;
  historyLoading: boolean;
  textsError: unknown;
  historyError: unknown;
  itemCount: number;
}): FeedBodyState {
  if (input.textsLoading || input.historyLoading) return "loading";
  if (input.textsError || input.historyError) return "error";
  if (input.itemCount === 0) return "empty";
  return "content";
}
