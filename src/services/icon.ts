const MATCH_TYPES = ["default", "login", "full", "partial", "none"] as const;
export type MatchType = typeof MATCH_TYPES[number];

export function getIconPath(matchType: MatchType) {
  return `public/icon-${matchType}.png`;
}
