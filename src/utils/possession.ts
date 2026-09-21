export type Side = 1 | 2;

export type PullPoint = {
  pointNumber: number;
  team: Side;
  pullOverride?: Side | null;
};

export function otherSide(side: Side): Side {
  return side === 1 ? 2 : 1;
}

/** Who pulls `pointNumber`. Point 1 is the opening pull. After that, the team that just scored pulls. */
export function pullingTeamForPoint(
  pointNumber: number,
  openingPull: Side,
  points: readonly PullPoint[]
): Side {
  const point = points.find((entry) => entry.pointNumber === pointNumber);
  if (point?.pullOverride === 1 || point?.pullOverride === 2) return point.pullOverride;
  if (pointNumber <= 1) return openingPull;
  const previous = points.reduce<PullPoint | null>((latest, entry) => {
    if (entry.pointNumber >= pointNumber) return latest;
    if (!latest || entry.pointNumber > latest.pointNumber) return entry;
    return latest;
  }, null);
  return previous ? previous.team : openingPull;
}

export type BreakHold = {
  breaks: number;
  holds: number;
};

/** Our breaks are points we scored after pulling. Holds are points we scored after receiving. */
export function breakHoldForSide(
  side: Side,
  openingPull: Side | null,
  points: readonly PullPoint[]
): BreakHold | null {
  if (openingPull == null) return null;
  let breaks = 0;
  let holds = 0;
  for (const point of points) {
    if (point.team !== side) continue;
    const pull = pullingTeamForPoint(point.pointNumber, openingPull, points);
    if (pull === side) breaks += 1;
    else holds += 1;
  }
  return { breaks, holds };
}

/** Flip who pulled this point. Clears the override when the flip matches the inferred pull. */
export function nextPullOverride(
  pointNumber: number,
  openingPull: Side,
  points: readonly PullPoint[]
): Side | undefined {
  const current = pullingTeamForPoint(pointNumber, openingPull, points);
  const flipped = otherSide(current);
  const cleared = points.map((point) =>
    point.pointNumber === pointNumber ? { ...point, pullOverride: undefined } : point
  );
  const derived = pullingTeamForPoint(pointNumber, openingPull, cleared);
  return flipped === derived ? undefined : flipped;
}
