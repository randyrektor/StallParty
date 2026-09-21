import type { ArchivedGame } from './gameArchive';
import { breakHoldForSide, type BreakHold } from './possession';

export type NamedCount = {
  names: string[];
  count: number;
};

export function topTagged(
  roster: readonly { uuid: string; name: string }[],
  ids: readonly (string | undefined)[]
): NamedCount | null {
  const counts = new Map<string, number>();
  for (const id of ids) {
    if (!id) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  let best = 0;
  const winners: string[] = [];
  for (const [id, count] of counts) {
    const name = roster.find((player) => player.uuid === id)?.name;
    if (!name) continue;
    if (count > best) {
      best = count;
      winners.length = 0;
      winners.push(name);
    } else if (count === best) {
      winners.push(name);
    }
  }
  winners.sort((a, b) => a.localeCompare(b));
  if (best === 0 || winners.length === 0) return null;
  return { names: winners, count: best };
}

export function formatLead(verb: 'scored' | 'threw', lead: NamedCount | null): string | null {
  if (!lead) return null;
  if (lead.names.length === 1) return `${lead.names[0]} ${verb} ${lead.count}`;
  if (lead.names.length === 2) {
    return `${lead.names[0]} and ${lead.names[1]} ${verb} ${lead.count}`;
  }
  return `${lead.names[0]} and ${lead.names.length - 1} others ${verb} ${lead.count}`;
}

export function gameSummary(game: ArchivedGame): {
  record: BreakHold | null;
  scorer: NamedCount | null;
  thrower: NamedCount | null;
  lines: string[];
} {
  const record = breakHoldForSide(1, game.openingPull, game.points);
  const scorer = topTagged(
    game.roster,
    game.points.map((point) => point.scorerId)
  );
  const thrower = topTagged(
    game.roster,
    game.points.map((point) => point.throwerId)
  );
  const lines = [
    record ? `Breaks ${record.breaks} · Holds ${record.holds}` : null,
    formatLead('scored', scorer),
    formatLead('threw', thrower),
  ].filter((line): line is string => line != null);
  return { record, scorer, thrower, lines };
}
