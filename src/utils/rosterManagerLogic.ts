import type { Player, LineupSize, SplitCycle } from '../types';
import { getLine } from './lineRotation';
import {
  getGenderPattern,
  removePlayerFromRotationQueue,
} from './rotationHelpers';

/** Matches scoreboard late-arrival check: would appending this player bump someone off the current line? */
export function lateArrivalWouldDisplaceCurrentLine(params: {
  masterOpenQueue: Player[];
  masterWomenQueue: Player[];
  openIndex: number;
  womenIndex: number;
  lineIndex: number;
  startingOpen: number;
  lineupSize: LineupSize;
  splitCycle?: SplitCycle;
  newPlayer: Player;
}): boolean {
  const pattern = getGenderPattern(
    params.lineIndex,
    params.lineupSize,
    params.startingOpen,
    params.splitCycle ?? 'same'
  );
  const normalizedOpenIndex =
    params.masterOpenQueue.length > 0
      ? params.openIndex % params.masterOpenQueue.length
      : 0;
  const normalizedWomenIndex =
    params.masterWomenQueue.length > 0
      ? params.womenIndex % params.masterWomenQueue.length
      : 0;

  const simulatedOpenQueue =
    params.newPlayer.gender === 'O'
      ? [...params.masterOpenQueue, params.newPlayer]
      : params.masterOpenQueue;
  const simulatedWomenQueue =
    params.newPlayer.gender === 'W'
      ? [...params.masterWomenQueue, params.newPlayer]
      : params.masterWomenQueue;

  const currentLine = getLine(
    params.masterOpenQueue,
    params.masterWomenQueue,
    pattern,
    normalizedOpenIndex,
    normalizedWomenIndex
  );
  const lineWithNewPlayer = getLine(
    simulatedOpenQueue,
    simulatedWomenQueue,
    pattern,
    normalizedOpenIndex,
    normalizedWomenIndex
  );

  const newLinePlayerIds = new Set(lineWithNewPlayer.map((p) => p.uuid));
  const displacedPlayers = currentLine.filter((p) => !newLinePlayerIds.has(p.uuid));
  return displacedPlayers.length > 0;
}

/** After appending one player to the end of a queue, keep the same effective rotation offset. */
export function expandRawIndexAfterQueueAppend(
  oldRawIndex: number,
  oldQueueLength: number,
  newQueueLength: number
): number {
  if (oldQueueLength === 0) return 0;
  const k = ((oldRawIndex % oldQueueLength) + oldQueueLength) % oldQueueLength;
  const rotations = Math.floor(oldRawIndex / oldQueueLength);
  return rotations * newQueueLength + k;
}

export function applyQueueRemovalsForRosterChange(
  masterOpenQueue: Player[],
  masterWomenQueue: Player[],
  openIndex: number,
  womenIndex: number,
  removedPlayers: Player[]
): {
  masterOpenQueue: Player[];
  masterWomenQueue: Player[];
  openIndex: number;
  womenIndex: number;
} {
  let nextOpen = [...masterOpenQueue];
  let nextWomen = [...masterWomenQueue];
  let nextOpenIndex = openIndex;
  let nextWomenIndex = womenIndex;
  for (const player of removedPlayers) {
    if (player.gender === 'O') {
      const r = removePlayerFromRotationQueue(nextOpen, nextOpenIndex, player.uuid);
      nextOpen = r.queue;
      nextOpenIndex = r.rawIndex;
    } else {
      const r = removePlayerFromRotationQueue(nextWomen, nextWomenIndex, player.uuid);
      nextWomen = r.queue;
      nextWomenIndex = r.rawIndex;
    }
  }
  return {
    masterOpenQueue: nextOpen,
    masterWomenQueue: nextWomen,
    openIndex: nextOpenIndex,
    womenIndex: nextWomenIndex,
  };
}

function sameUuidOrder(a: Player[], b: Player[]): boolean {
  return a.length === b.length && a.every((player, index) => player.uuid === b[index]?.uuid);
}

/**
 * Jersey, position, and name edits keep the same people in the same order.
 * Copy those fields onto the queues and leave the rotation window where it is.
 * Returns null when the order changed, so the caller can treat it as a drag.
 */
export function applyInPlaceRosterUpdate(params: {
  masterOpenQueue: Player[];
  masterWomenQueue: Player[];
  newRosterActivePlayers: Player[];
}): { masterOpenQueue: Player[]; masterWomenQueue: Player[] } | null {
  const proposedOpen = params.newRosterActivePlayers.filter((player) => player.gender === 'O');
  const proposedWomen = params.newRosterActivePlayers.filter((player) => player.gender === 'W');
  if (
    !sameUuidOrder(proposedOpen, params.masterOpenQueue) ||
    !sameUuidOrder(proposedWomen, params.masterWomenQueue)
  ) {
    return null;
  }
  return {
    masterOpenQueue: proposedOpen,
    masterWomenQueue: proposedWomen,
  };
}

export function applyDragReorderToMasterQueues(params: {
  masterOpenQueue: Player[];
  masterWomenQueue: Player[];
  openIndex: number;
  womenIndex: number;
  newRosterActivePlayers: Player[];
}): {
  masterOpenQueue: Player[];
  masterWomenQueue: Player[];
  openIndex: number;
  womenIndex: number;
} {
  const proposedOpen = params.newRosterActivePlayers.filter((p) => p.gender === 'O');
  const proposedWomen = params.newRosterActivePlayers.filter((p) => p.gender === 'W');
  // Roster order is the rotation from the top. That is the only way to replace
  // who is on the current line (late arrivals / pending never bump the field).
  return {
    masterOpenQueue: proposedOpen,
    masterWomenQueue: proposedWomen,
    openIndex: 0,
    womenIndex: 0,
  };
}

function sameLine(a: Player[], b: Player[]): boolean {
  return a.length === b.length && a.every((player, i) => player.uuid === b[i]?.uuid);
}

/** Always the next number: append at the end and keep the same rotation start. */
export function appendPlayerToQueue(
  queue: Player[],
  rawIndex: number,
  player: Player
): { queue: Player[]; rawIndex: number } {
  if (queue.some((p) => p.uuid === player.uuid)) {
    return { queue: [...queue], rawIndex };
  }
  const oldLen = queue.length;
  const nextQueue = [...queue, player];
  if (oldLen === 0) return { queue: nextQueue, rawIndex: 0 };
  return {
    queue: nextQueue,
    rawIndex: expandRawIndexAfterQueueAppend(rawIndex, oldLen, nextQueue.length),
  };
}

export type PendingPlacement = {
  activate: Player[];
  stillPending: Player[];
  masterOpenQueue: Player[];
  masterWomenQueue: Player[];
  openIndex: number;
  womenIndex: number;
};

/**
 * Late arrivals always take the next number (end of their gender queue).
 * They stay pending only when that last slot would be on the already-fielded
 * current line. Next line / bench is fine — captains can drag from there.
 *
 * Pass allowChangingCurrentLine for an explicit "Add now" override.
 */
export function partitionPendingForLineChange(params: {
  pendingPlayers: Player[];
  masterOpenQueue: Player[];
  masterWomenQueue: Player[];
  openIndex: number;
  womenIndex: number;
  lineIndex: number;
  startingOpen: number;
  lineupSize: LineupSize;
  splitCycle?: SplitCycle;
  allowChangingCurrentLine?: boolean;
}): PendingPlacement {
  const pattern = getGenderPattern(
    params.lineIndex,
    params.lineupSize,
    params.startingOpen,
    params.splitCycle ?? 'same'
  );
  let openQ = params.masterOpenQueue;
  let womenQ = params.masterWomenQueue;
  let openIndex = params.openIndex;
  let womenIndex = params.womenIndex;
  const currentLine = getLine(openQ, womenQ, pattern, openIndex, womenIndex);
  const allow = params.allowChangingCurrentLine === true;

  const activate: Player[] = [];
  const stillPending: Player[] = [];

  for (const p of params.pendingPlayers) {
    if (p.gender === 'O') {
      const placed = appendPlayerToQueue(openQ, openIndex, p);
      const lineAfter = getLine(
        placed.queue,
        womenQ,
        pattern,
        placed.rawIndex,
        womenIndex
      );
      if (!allow && !sameLine(currentLine, lineAfter)) {
        stillPending.push(p);
        continue;
      }
      openQ = placed.queue;
      openIndex = placed.rawIndex;
      activate.push(p);
    } else {
      const placed = appendPlayerToQueue(womenQ, womenIndex, p);
      const lineAfter = getLine(
        openQ,
        placed.queue,
        pattern,
        openIndex,
        placed.rawIndex
      );
      if (!allow && !sameLine(currentLine, lineAfter)) {
        stillPending.push(p);
        continue;
      }
      womenQ = placed.queue;
      womenIndex = placed.rawIndex;
      activate.push(p);
    }
  }

  return {
    activate,
    stillPending,
    masterOpenQueue: openQ,
    masterWomenQueue: womenQ,
    openIndex,
    womenIndex,
  };
}

/**
 * Undo restores score + rotation indices. Players who were pending at that
 * score and later appended to a queue go back to pending.
 */
export function restoreActivatedPendingAfterUndo(params: {
  pendingIdsAtScore: string[];
  masterOpenQueue: Player[];
  masterWomenQueue: Player[];
  currentPending: Player[];
}): {
  masterOpenQueue: Player[];
  masterWomenQueue: Player[];
  pendingPlayers: Player[];
} {
  const wasPending = new Set(params.pendingIdsAtScore);
  const rePend: Player[] = [];
  const masterOpenQueue = params.masterOpenQueue.filter((p) => {
    if (wasPending.has(p.uuid)) {
      rePend.push(p);
      return false;
    }
    return true;
  });
  const masterWomenQueue = params.masterWomenQueue.filter((p) => {
    if (wasPending.has(p.uuid)) {
      rePend.push(p);
      return false;
    }
    return true;
  });
  const pendingIds = new Set(params.currentPending.map((p) => p.uuid));
  const pendingPlayers = [
    ...params.currentPending,
    ...rePend.filter((p) => !pendingIds.has(p.uuid)),
  ];
  return { masterOpenQueue, masterWomenQueue, pendingPlayers };
}

/** Append activated pending players at the end of their gender queue. */
export function applyPendingActivationsToQueues(
  masterOpenQueue: Player[],
  masterWomenQueue: Player[],
  activate: Player[],
  openIndex = 0,
  womenIndex = 0
): {
  masterOpenQueue: Player[];
  masterWomenQueue: Player[];
  openIndex: number;
  womenIndex: number;
} {
  let open = [...masterOpenQueue];
  let women = [...masterWomenQueue];
  let nextOpenIndex = openIndex;
  let nextWomenIndex = womenIndex;
  for (const p of activate) {
    if (p.gender === 'O') {
      const placed = appendPlayerToQueue(open, nextOpenIndex, p);
      open = placed.queue;
      nextOpenIndex = placed.rawIndex;
    } else {
      const placed = appendPlayerToQueue(women, nextWomenIndex, p);
      women = placed.queue;
      nextWomenIndex = placed.rawIndex;
    }
  }
  return {
    masterOpenQueue: open,
    masterWomenQueue: women,
    openIndex: nextOpenIndex,
    womenIndex: nextWomenIndex,
  };
}
