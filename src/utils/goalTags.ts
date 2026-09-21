export type GoalTag = {
  scorerId?: string;
  throwerId?: string;
};

/** First tap is the scorer. Second tap is the thrower. Tapping the scorer clears both. */
export function applyGoalTag(current: GoalTag, playerId: string): GoalTag {
  if (!current.scorerId) return { scorerId: playerId };
  if (current.scorerId === playerId) return {};
  if (current.throwerId === playerId) return { scorerId: current.scorerId };
  return { scorerId: current.scorerId, throwerId: playerId };
}
