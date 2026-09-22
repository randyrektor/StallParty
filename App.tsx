// ScoreboardApp.tsx
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Player, type LineupSize, type SplitCycle, type Theme } from './src/types';
import { PlayerManager } from './src/components/PlayerManager';
import { ScoreBoard } from './src/components/ScoreBoard';
import { SettingsModal } from './src/components/SettingsModal';
import { HomeScreen } from './src/components/HomeScreen';
import { getWrapped } from './src/utils/lineRotation';
import {
  applySubstitutionToQueue,
  mergeRosterFromGenderQueues,
  assignNumbersByGender,
  getGenderPattern,
  insertPlayerAtGenderEndOfRoster,
  clampOpenCount,
  DEFAULT_STARTING_OPEN,
  nextLinePattern,
} from './src/utils/rotationHelpers';
import {
  applyQueueRemovalsForRosterChange,
  applyDragReorderToMasterQueues,
  applyInPlaceRosterUpdate,
  partitionPendingForLineChange,
  restoreActivatedPendingAfterUndo,
  expandRawIndexAfterQueueAppend,
} from './src/utils/rosterManagerLogic';
import { COLORS } from './src/constants';
import { loadRosterForTeam, saveRosterForTeam } from './src/utils/rosterStorage';
import { mergeImportedPlayers, type ParsedRosterRow } from './src/utils/rosterImport';
import { loadGameSession, saveGameSession, scheduleSaveGameSession, clearGameSession, clearGameSessionForTeam, type GameSession } from './src/utils/gameSession';
import { applyGoalTag } from './src/utils/goalTags';
import {
  loadGameArchive,
  rememberArchivedGame,
  replaceArchivedGame,
  forgetArchivedGame,
  archiveTitle,
  sessionFromArchive,
  type ArchivedGame,
} from './src/utils/gameArchive';
import { pullingTeamForPoint } from './src/utils/possession';
import { ArchiveGameScreen } from './src/components/ArchiveGameScreen';
import { buildSpectatorSnapshot } from './src/utils/spectatorState';
import { isSoftCapReached, parseSoftCap, type SoftPointCap } from './src/utils/softCap';
import { parseGameClockTime, type GameClockTime } from './src/utils/gameClock';
import { SpectatorScreen } from './src/components/SpectatorScreen';
import {
  mintRoomId,
  mintWriteKey,
  parseWatchHash,
  watchRoomUrlFromLocation,
  type WatchHash,
} from './src/utils/watchRoom';
import { useWatchHost, useWatchViewer } from './src/hooks/useWatchRoom';

// No hardcoded roster - players are added each game

const assignNumbers = assignNumbersByGender;

function playersFromLineKey(key: string): { name: string; g: 'O' | 'W' }[] {
  if (!key) return [];
  return key.split('\n').map((row) => {
    const cut = row.indexOf('\u0001');
    return {
      name: cut === -1 ? row : row.slice(cut + 1),
      g: row.slice(0, cut) === 'W' ? 'W' : 'O',
    };
  });
}

interface ScoreEvent {
  team: 1 | 2;
  lineIndex: number;
  pointNumber: number;
  openIndex: number;
  womenIndex: number;
  /** Pending at the moment of the score, before they may rotate in. */
  pendingPlayerIds: string[];
  /** Who was on the field for the point that just ended. */
  linePlayerIds: string[];
  scorerId?: string;
  throwerId?: string;
  pullOverride?: 1 | 2;
}

function readTagGoals(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem('ultimate-tag-goals') === '1';
}

function archivedGameFromSession(session: GameSession, id: string): ArchivedGame | null {
  if (!session.gameStarted || session.scoreHistory.length === 0) return null;
  return {
    id,
    startedAt: session.startedAt || new Date().toISOString(),
    team1Name: session.team1Name,
    team2Name: session.team2Name,
    team1Score: session.team1Score,
    team2Score: session.team2Score,
    roster: session.roster.map((player) => ({
      uuid: player.uuid,
      name: player.name,
      gender: player.gender,
    })),
    openingPull: session.openingPull ?? null,
    halfPoint: session.halfPoint ?? null,
    points: session.scoreHistory.map((event) => ({
      team: event.team,
      pointNumber: event.pointNumber,
      linePlayerIds: event.linePlayerIds ?? [],
      ...(event.scorerId ? { scorerId: event.scorerId } : {}),
      ...(event.throwerId ? { throwerId: event.throwerId } : {}),
      ...(event.pullOverride ? { pullOverride: event.pullOverride } : {}),
    })),
    session: { ...session, archiveId: id },
  };
}

function readLineupSize(): LineupSize {
  if (typeof window === 'undefined') return 7;
  const n = Number.parseInt(window.localStorage.getItem('ultimate-lineup-size') ?? '', 10);
  if (n === 4 || n === 5 || n === 6 || n === 7) return n;
  return 7;
}

function readSplitCycle(): SplitCycle {
  if (typeof window === 'undefined') return 'ABBA';
  const c = window.localStorage.getItem('ultimate-split-cycle');
  if (c === 'same' || c === 'ABBA' || c === 'AAB') return c;
  return 'ABBA';
}

function readStartingOpen(size: LineupSize): number {
  if (typeof window === 'undefined') return DEFAULT_STARTING_OPEN[size];
  const saved = window.localStorage.getItem('ultimate-starting-open');
  if (saved != null) {
    const n = Number.parseInt(saved, 10);
    if (Number.isFinite(n)) return clampOpenCount(n, size);
  }
  let startsOn = window.localStorage.getItem('ultimate-starts-on');
  const legacy = window.localStorage.getItem('ultimate-pattern-start-offset');
  if (legacy != null) {
    const parsed = Number.parseInt(legacy, 10);
    try {
      window.localStorage.removeItem('ultimate-pattern-start-offset');
    } catch {
      // ignore
    }
    if (Number.isFinite(parsed) && parsed !== 0) startsOn = 'W';
  }
  if (startsOn === 'W') {
    return clampOpenCount(size - DEFAULT_STARTING_OPEN[size], size);
  }
  return DEFAULT_STARTING_OPEN[size];
}

export default function App() {
  const [showHomeScreen, setShowHomeScreen] = useState(true);
  const [sessionReady, setSessionReady] = useState(false);
  const [resumeLabel, setResumeLabel] = useState<string | null>(null);
  const [showRoster, setShowRoster] = useState(false);
  const [setupStep, setSetupStep] = useState<'roster' | 'line'>('roster');
  const [team1Name, setTeam1Name] = useState('');
  const [team2Name, setTeam2Name] = useState('Away');
  const [team1Score, setTeam1Score] = useState(0);
  const [team2Score, setTeam2Score] = useState(0);
  const [roster, setRoster] = useState<Player[]>([]);
  const [masterOpenQueue, setMasterOpenQueue] = useState<Player[]>([]);
  const [masterWomenQueue, setMasterWomenQueue] = useState<Player[]>([]);
  const [pendingPlayers, setPendingPlayers] = useState<Player[]>([]);
  const [gameStarted, setGameStarted] = useState(false);
  const [lineIndex, setLineIndex] = useState(0);
  const [pointNumber, setPointNumber] = useState(1);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [lineupSize, setLineupSize] = useState<LineupSize>(() => readLineupSize());
  const [startingOpen, setStartingOpen] = useState(() => readStartingOpen(readLineupSize()));
  const [splitCycle, setSplitCycle] = useState<SplitCycle>(() => readSplitCycle());
  const linePatternRef = useRef({
    size: lineupSize,
    open: startingOpen,
    cycle: splitCycle,
  });
  const [softCap, setSoftCap] = useState<SoftPointCap>(null);
  const [halfAt, setHalfAt] = useState<GameClockTime>(null);
  const [endAt, setEndAt] = useState<GameClockTime>(null);
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === 'undefined') return 'dark';
    const saved = window.localStorage.getItem('ultimate-theme');
    return saved === 'light' ? 'light' : 'dark';
  });
  const [scoreHistory, setScoreHistory] = useState<ScoreEvent[]>([]);
  const [openingPull, setOpeningPull] = useState<1 | 2 | null>(null);
  const [halfPoint, setHalfPoint] = useState<number | null>(null);
  const [halfPull, setHalfPull] = useState<1 | 2 | null>(null);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [tagGoalsLive, setTagGoalsLive] = useState<boolean>(() => readTagGoals());
  const [dismissedTagPoint, setDismissedTagPoint] = useState<number | null>(null);
  const [archive, setArchive] = useState<ArchivedGame[]>(() => loadGameArchive());
  const [openArchiveId, setOpenArchiveId] = useState<string | null>(null);
  const [activeArchiveId, setActiveArchiveId] = useState<string | null>(null);

  // Track rotation index for men and women
  const [openIndex, setOpenIndex] = useState(0);
  const [womenIndex, setWomenIndex] = useState(0);
  const [watchHash, setWatchHash] = useState<WatchHash | null>(() =>
    typeof window === 'undefined' ? null : parseWatchHash(window.location.hash)
  );
  const [watchRoomId, setWatchRoomId] = useState<string | null>(null);
  const [watchWriteKey, setWatchWriteKey] = useState<string | null>(null);
  const [watchViewKey, setWatchViewKey] = useState<string | null>(null);

  const ensureWatchRoom = useCallback(() => {
    setWatchRoomId((id) => id ?? mintRoomId());
    setWatchWriteKey((key) => key ?? mintWriteKey());
    setWatchViewKey((key) => key ?? mintWriteKey());
  }, []);

  useEffect(() => {
    const onHash = () => setWatchHash(parseWatchHash(window.location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Always start on team select. Only persist after kickoff so setup is not skipped.
  useEffect(() => {
    const session = loadGameSession();
    if (session?.gameStarted && session.team1Name) {
      setResumeLabel(
        `${session.team1Name} ${session.team1Score}–${session.team2Score} ${session.team2Name}`
      );
    } else if (session && !session.gameStarted) {
      clearGameSession();
    }
    setShowHomeScreen(true);
    setSessionReady(true);
  }, []);

  const applyRestoredSession = (session: GameSession) => {
    setTeam1Name(session.team1Name);
    setTeam2Name(session.team2Name);
    setTeam1Score(session.team1Score);
    setTeam2Score(session.team2Score);
    setRoster(session.roster);
    setMasterOpenQueue(session.masterOpenQueue);
    setMasterWomenQueue(session.masterWomenQueue);
    setPendingPlayers(session.pendingPlayers);
    setGameStarted(session.gameStarted);
    setLineIndex(session.lineIndex);
    setPointNumber(session.pointNumber);
    setOpenIndex(session.openIndex);
    setWomenIndex(session.womenIndex);
    setScoreHistory(
      session.scoreHistory.map((event) => ({
        ...event,
        linePlayerIds: event.linePlayerIds ?? [],
      }))
    );
    setOpeningPull(session.openingPull ?? null);
    setHalfPoint(session.halfPoint ?? null);
    setHalfPull(session.halfPull === 1 || session.halfPull === 2 ? session.halfPull : null);
    setStartedAt(session.startedAt ?? null);
    setDismissedTagPoint(null);
    setLineupSize(session.lineupSize);
    setStartingOpen(session.startingOpen);
    setSplitCycle(session.splitCycle);
    linePatternRef.current = {
      size: session.lineupSize,
      open: session.startingOpen,
      cycle: session.splitCycle,
    };
    setSoftCap(parseSoftCap(session.softCap));
    setHalfAt(parseGameClockTime(session.halfAt));
    setEndAt(parseGameClockTime(session.endAt));
    setShowRoster(false);
    setSetupStep(session.setupStep);
    setWatchRoomId(session.watchRoomId ?? null);
    setWatchWriteKey(session.watchWriteKey ?? null);
    setWatchViewKey(session.watchViewKey ?? null);
    setActiveArchiveId(session.archiveId ?? null);
    setShowHomeScreen(false);
    setResumeLabel(null);
  };

  const resetScoreboardForNewSession = useCallback(() => {
    setTeam1Score(0);
    setTeam2Score(0);
    setLineIndex(0);
    setPointNumber(1);
    setScoreHistory([]);
    setOpeningPull(null);
    setHalfPoint(null);
    setHalfPull(null);
    setStartedAt(null);
    setDismissedTagPoint(null);
    setOpenIndex(0);
    setWomenIndex(0);
    setPendingPlayers([]);
    setGameStarted(false);
    setSoftCap(null);
    setHalfAt(null);
    setEndAt(null);
    setWatchRoomId(null);
    setWatchWriteKey(null);
    setWatchViewKey(null);
    setActiveArchiveId(null);
    clearGameSession();
  }, []);

  const applyNewGameRoster = useCallback((newRoster: Player[]) => {
    setRoster(newRoster);
    const openPlayers = newRoster.filter((p) => p.gender === 'O');
    const womenPlayers = newRoster.filter((p) => p.gender === 'W');
    setMasterOpenQueue(openPlayers);
    setMasterWomenQueue(womenPlayers);
    setOpenIndex(0);
    setWomenIndex(0);
  }, []);

  const sameSavedGame = (session: GameSession, game: ArchivedGame) =>
    session.archiveId === game.id ||
    (session.startedAt != null &&
      session.startedAt === game.startedAt &&
      session.team1Name === game.team1Name &&
      session.team2Name === game.team2Name);

  const persistArchivedSession = (session: GameSession) => {
    const match = archive.find((game) => sameSavedGame(session, game));
    const id = match?.id ?? session.archiveId ?? crypto.randomUUID();
    const record = archivedGameFromSession({ ...session, archiveId: id }, id);
    if (!record) return;
    setArchive(match ? replaceArchivedGame(record) : rememberArchivedGame(record));
  };

  const archiveSessionIfPlayed = (session: GameSession | null) => {
    if (!session) return;
    persistArchivedSession(session);
  };

  const handleStartGame = (teamName: string) => {
    const trimmed = teamName.trim();
    archiveSessionIfPlayed(loadGameSession());
    resetScoreboardForNewSession();
    setTeam1Name(trimmed);
    setShowHomeScreen(false);
    const loaded = loadRosterForTeam(trimmed) ?? [];
    applyNewGameRoster(loaded);
    setShowRoster(true);
    setSetupStep('roster');
    setResumeLabel(null);
  };

  const handleResumeGame = () => {
    const session = loadGameSession();
    if (!session?.gameStarted) return;
    applyRestoredSession(session);
  };

  const handleForgetTeam = (teamName: string) => {
    if (clearGameSessionForTeam(teamName)) {
      setResumeLabel(null);
    }
  };

  const handleKickoff = (pulling: 1 | 2) => {
    ensureWatchRoom();
    setOpeningPull(pulling);
    setStartedAt((current) => current ?? new Date().toISOString());
    setGameStarted(true);
    setShowRoster(false);
  };

  const handleImportPlayers = (rows: ParsedRosterRow[]) => {
    const { roster: next, added, skipped } = mergeImportedPlayers(roster, rows);
    if (added.length === 0) return { added: 0, skipped };
    setRoster(next);
    if (!gameStarted) {
      const openPlayers = next.filter((p) => p.gender === 'O');
      const womenPlayers = next.filter((p) => p.gender === 'W');
      setMasterOpenQueue(openPlayers);
      setMasterWomenQueue(womenPlayers);
    } else {
      const nextPending = [...pendingPlayers, ...added];
      const placed = partitionPendingForLineChange({
        pendingPlayers: nextPending,
        masterOpenQueue,
        masterWomenQueue,
        openIndex,
        womenIndex,
        lineIndex,
        startingOpen,
        lineupSize,
        splitCycle,
      });
      setMasterOpenQueue(placed.masterOpenQueue);
      setMasterWomenQueue(placed.masterWomenQueue);
      setOpenIndex(placed.openIndex);
      setWomenIndex(placed.womenIndex);
      setPendingPlayers(placed.stillPending);
      scoringRef.current = {
        ...scoringRef.current,
        masterOpenQueue: placed.masterOpenQueue,
        masterWomenQueue: placed.masterWomenQueue,
        openIndex: placed.openIndex,
        womenIndex: placed.womenIndex,
        pendingPlayers: placed.stillPending,
      };
    }
    return { added: added.length, skipped };
  };

  const archiveLiveGame = () => {
    if (!gameStarted || scoreHistory.length === 0) return;
    persistArchivedSession({
      v: 1,
      archiveId: activeArchiveId ?? undefined,
      team1Name,
      team2Name,
      team1Score,
      team2Score,
      roster,
      masterOpenQueue,
      masterWomenQueue,
      pendingPlayers,
      gameStarted,
      lineIndex,
      pointNumber,
      openIndex,
      womenIndex,
      scoreHistory,
      openingPull,
      halfPoint,
      halfPull,
      startedAt,
      lineupSize,
      startingOpen,
      splitCycle,
      softCap,
      halfAt,
      endAt,
      showRoster,
      setupStep,
      watchRoomId: watchRoomId ?? undefined,
      watchWriteKey: watchWriteKey ?? undefined,
      watchViewKey: watchViewKey ?? undefined,
    });
  };

  const handleContinueGame = (id: string) => {
    const game = archive.find((item) => item.id === id);
    if (!game) return;
    const current = loadGameSession();
    if (current?.gameStarted && sameSavedGame(current, game)) {
      applyRestoredSession({ ...current, archiveId: id });
      return;
    }
    if (current?.gameStarted) archiveSessionIfPlayed(current);
    const session = sessionFromArchive(game);
    saveGameSession(session);
    applyRestoredSession(session);
  };

  const handleForgetGame = (id: string) => {
    const game = archive.find((item) => item.id === id);
    setArchive(forgetArchivedGame(id));
    if (openArchiveId === id) setOpenArchiveId(null);
    const current = loadGameSession();
    if (!current?.gameStarted || !game || !sameSavedGame(current, game)) return;
    clearGameSession();
    setResumeLabel(null);
  };

  const leaveToHome = () => {
    resetScoreboardForNewSession();
    setShowHomeScreen(true);
    setShowRoster(false);
    setSetupStep('roster');
    setSettingsVisible(false);
    setResumeLabel(null);
  };

  const exitWatch = () => {
    if (window.location.hash) window.location.hash = '';
    setWatchHash(null);
  };

  const goHome = () => {
    if (gameStarted) {
      if (!window.confirm('Go home? A game with points is kept on the homepage.')) return;
      archiveLiveGame();
      exitWatch();
      leaveToHome();
      return;
    }
    exitWatch();
    setOpenArchiveId(null);
    if (!showHomeScreen) leaveToHome();
  };

  const handleChangeTeam = () => {
    archiveLiveGame();
    leaveToHome();
  };

  const handleEndGame = () => {
    archiveLiveGame();
    leaveToHome();
  };

  // Calculate total players used so far for proper rotation
  const getPattern = useCallback(
    (idx: number) => getGenderPattern(idx, lineupSize, startingOpen, splitCycle),
    [lineupSize, startingOpen, splitCycle]
  );

  // Apply + persist the active theme. CSS vars in global.css respond to data-theme.
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      window.localStorage.setItem('ultimate-theme', theme);
    } catch {
      // localStorage can throw in private modes; theme just won't persist.
    }
  }, [theme]);

  useEffect(() => {
    try {
      window.localStorage.setItem('ultimate-lineup-size', String(lineupSize));
      window.localStorage.setItem('ultimate-starting-open', String(startingOpen));
      window.localStorage.setItem('ultimate-split-cycle', splitCycle);
    } catch {
      // ignore quota errors
    }
  }, [lineupSize, startingOpen, splitCycle]);

  // Calculate current queues based on rotation
  const currentPattern = getPattern(lineIndex);
  
  // Normalize indices to be within queue bounds
  const normalizedOpenIndex = masterOpenQueue.length > 0 ? openIndex % masterOpenQueue.length : 0;
  const normalizedWomenIndex = masterWomenQueue.length > 0 ? womenIndex % masterWomenQueue.length : 0;
  
  const currentOpenQueue = getWrapped(masterOpenQueue, normalizedOpenIndex, currentPattern.men);
  const currentWomanQueue = getWrapped(masterWomenQueue, normalizedWomenIndex, currentPattern.women);
  const nextPattern = getPattern(lineIndex + 1);
  const nextOpenQueue = getWrapped(
    masterOpenQueue,
    openIndex + currentPattern.men,
    nextPattern.men
  );
  const nextWomanQueue = getWrapped(
    masterWomenQueue,
    womenIndex + currentPattern.women,
    nextPattern.women
  );
  const currentLine = [...currentOpenQueue, ...currentWomanQueue];
  const nextLine = [...nextOpenQueue, ...nextWomanQueue];
  const spectatorLineKey = currentLine.map((player) => `${player.gender}\u0001${player.name}`).join('\n');
  const spectatorNextKey = nextLine.map((player) => `${player.gender}\u0001${player.name}`).join('\n');
  const liveSpectatorSnapshot = useMemo(
    () =>
      buildSpectatorSnapshot({
        us: team1Name,
        them: team2Name,
        s1: team1Score,
        s2: team2Score,
        point: pointNumber,
        lineIndex,
        lineupSize,
        startingOpen,
        splitCycle,
        softCap,
        halfAt,
        endAt,
        line: playersFromLineKey(spectatorLineKey),
        next: playersFromLineKey(spectatorNextKey),
      }),
    [
      team1Name,
      team2Name,
      team1Score,
      team2Score,
      pointNumber,
      lineIndex,
      lineupSize,
      startingOpen,
      splitCycle,
      softCap,
      halfAt,
      endAt,
      spectatorLineKey,
      spectatorNextKey,
    ]
  );

  const viewingRoomId = watchHash?.kind === 'room' ? watchHash.roomId : null;
  const viewingViewKey =
    watchHash?.kind === 'room' && watchHash.view === 'team' ? (watchHash.viewKey ?? null) : null;
  const viewingAsTeam = viewingViewKey != null;
  const { snapshot: roomSnapshot, status: roomStatus } = useWatchViewer(viewingRoomId, viewingViewKey);
  useWatchHost(
    !viewingRoomId && !!watchRoomId && !!watchWriteKey,
    watchRoomId,
    watchWriteKey,
    watchViewKey,
    liveSpectatorSnapshot
  );

  useEffect(() => {
    if (settingsVisible) ensureWatchRoom();
  }, [settingsVisible, ensureWatchRoom]);

  // Keep scoring inputs in a ref so rapid clicks don't wait for a re-render
  // (and don't double-apply the same score from a stale closure).
  const scoringRef = useRef({
    gameStarted,
    team1Score,
    team2Score,
    softCap,
    lineIndex,
    pointNumber,
    openIndex,
    womenIndex,
    pendingPlayers,
    masterOpenQueue,
    masterWomenQueue,
    halfPoint,
    halfPull,
  });
  scoringRef.current = {
    gameStarted,
    team1Score,
    team2Score,
    softCap,
    lineIndex,
    pointNumber,
    openIndex,
    womenIndex,
    pendingPlayers,
    masterOpenQueue,
    masterWomenQueue,
    halfPoint,
    halfPull,
  };

  const recordPoint = (team: 1 | 2) => {
    const s = scoringRef.current;
    if (!s.gameStarted) return;
    if (isSoftCapReached(s.team1Score, s.team2Score, s.softCap)) return;
    const pattern = getPattern(s.lineIndex);
    const linePlayerIds = [
      ...getWrapped(s.masterOpenQueue, s.openIndex, pattern.men),
      ...getWrapped(s.masterWomenQueue, s.womenIndex, pattern.women),
    ].map((p) => p.uuid);
    // Rotate first, then append pending at the end if that number is not on
    // the new current line. Never splice them into the middle of the queue.
    const placed = partitionPendingForLineChange({
      pendingPlayers: s.pendingPlayers,
      masterOpenQueue: s.masterOpenQueue,
      masterWomenQueue: s.masterWomenQueue,
      openIndex: s.openIndex + pattern.men,
      womenIndex: s.womenIndex + pattern.women,
      lineIndex: s.lineIndex + 1,
      startingOpen,
      lineupSize,
      splitCycle,
    });
    const next = {
      ...s,
      team1Score: team === 1 ? s.team1Score + 1 : s.team1Score,
      team2Score: team === 2 ? s.team2Score + 1 : s.team2Score,
      masterOpenQueue: placed.masterOpenQueue,
      masterWomenQueue: placed.masterWomenQueue,
      pendingPlayers: placed.stillPending,
      openIndex: placed.openIndex,
      womenIndex: placed.womenIndex,
      lineIndex: s.lineIndex + 1,
      pointNumber: s.pointNumber + 1,
    };
    scoringRef.current = next;
    setScoreHistory((prev) => [
      ...prev,
      {
        team,
        lineIndex: s.lineIndex,
        pointNumber: s.pointNumber,
        openIndex: s.openIndex,
        womenIndex: s.womenIndex,
        pendingPlayerIds: s.pendingPlayers.map((p) => p.uuid),
        linePlayerIds,
        ...(s.halfPoint === s.pointNumber && s.halfPull ? { pullOverride: s.halfPull } : {}),
      },
    ]);
    if (team === 1) setTeam1Score(next.team1Score);
    else setTeam2Score(next.team2Score);
    setMasterOpenQueue(next.masterOpenQueue);
    setMasterWomenQueue(next.masterWomenQueue);
    setPendingPlayers(next.pendingPlayers);
    setOpenIndex(next.openIndex);
    setWomenIndex(next.womenIndex);
    setLineIndex(next.lineIndex);
    setPointNumber(next.pointNumber);
  };

  const handleTeam1ScoreChange = () => recordPoint(1);
  const handleTeam2ScoreChange = () => recordPoint(2);

  const handleSubstitute = useCallback(
    (outPlayer: Player, inPlayer: Player) => {
      if (outPlayer.uuid === inPlayer.uuid || outPlayer.gender !== inPlayer.gender) return;
      let nextOpen = masterOpenQueue;
      let nextWomen = masterWomenQueue;
      if (outPlayer.gender === 'O') {
        nextOpen = applySubstitutionToQueue(masterOpenQueue, outPlayer.uuid, inPlayer);
        setMasterOpenQueue(nextOpen);
      } else {
        nextWomen = applySubstitutionToQueue(masterWomenQueue, outPlayer.uuid, inPlayer);
        setMasterWomenQueue(nextWomen);
      }
      setPendingPlayers((prev) => prev.filter((p) => p.uuid !== inPlayer.uuid));
    },
    [masterOpenQueue, masterWomenQueue]
  );

  const handleForcePendingToRotation = useCallback(
    (player: Player) => {
      if (!pendingPlayers.some((p) => p.uuid === player.uuid)) return;
      const placed = partitionPendingForLineChange({
        pendingPlayers: [player],
        masterOpenQueue,
        masterWomenQueue,
        openIndex,
        womenIndex,
        lineIndex,
        startingOpen,
        lineupSize,
        splitCycle,
        allowChangingCurrentLine: true,
      });
      setPendingPlayers((prev) =>
        prev.filter((p) => p.uuid !== player.uuid && !placed.activate.some((a) => a.uuid === p.uuid))
      );
      setMasterOpenQueue(placed.masterOpenQueue);
      setMasterWomenQueue(placed.masterWomenQueue);
      setOpenIndex(placed.openIndex);
      setWomenIndex(placed.womenIndex);
      scoringRef.current = {
        ...scoringRef.current,
        masterOpenQueue: placed.masterOpenQueue,
        masterWomenQueue: placed.masterWomenQueue,
        openIndex: placed.openIndex,
        womenIndex: placed.womenIndex,
        pendingPlayers: pendingPlayers.filter(
          (p) => p.uuid !== player.uuid && !placed.activate.some((a) => a.uuid === p.uuid)
        ),
      };
    },
    [
      pendingPlayers,
      masterOpenQueue,
      masterWomenQueue,
      openIndex,
      womenIndex,
      lineIndex,
      startingOpen,
      lineupSize,
      splitCycle,
    ]
  );

  const handleHalfPull = (pulling: 1 | 2) => {
    setScoreHistory((prev) =>
      prev.map((event) => {
        if (halfPoint != null && event.pointNumber === halfPoint && event.pullOverride === halfPull) {
          const next = { ...event };
          delete next.pullOverride;
          return next;
        }
        return event;
      })
    );
    setHalfPoint(pointNumber);
    setHalfPull(pulling);
  };

  const handleReset = () => {
    setTeam1Score(0);
    setTeam2Score(0);
    setLineIndex(0);
    setPointNumber(1);
    setScoreHistory([]);
    setHalfPoint(null);
    setHalfPull(null);
    setDismissedTagPoint(null);
    setOpenIndex(0);
    setWomenIndex(0);
  };

  const handleTagGoal = (playerId: string) => {
    setScoreHistory((prev) => {
      const last = prev[prev.length - 1];
      if (!last || last.team !== 1) return prev;
      const nextTag = applyGoalTag(
        { scorerId: last.scorerId, throwerId: last.throwerId },
        playerId
      );
      const updated: ScoreEvent = { ...last };
      if (nextTag.scorerId) updated.scorerId = nextTag.scorerId;
      else delete updated.scorerId;
      if (nextTag.throwerId) updated.throwerId = nextTag.throwerId;
      else delete updated.throwerId;
      return [...prev.slice(0, -1), updated];
    });
  };

  const handleDismissTag = () => {
    const last = scoreHistory[scoreHistory.length - 1];
    if (!last) return;
    setDismissedTagPoint(last.pointNumber);
  };

  const handleTagGoalsLiveChange = (enabled: boolean) => {
    setTagGoalsLive(enabled);
    try {
      window.localStorage.setItem('ultimate-tag-goals', enabled ? '1' : '0');
    } catch {
      // ignore quota errors
    }
  };

  const handleUndo = () => {
    if (scoreHistory.length === 0) return;

    const lastEvent = scoreHistory[scoreHistory.length - 1];
    const nextTeam1 = lastEvent.team === 1 ? scoringRef.current.team1Score - 1 : scoringRef.current.team1Score;
    const nextTeam2 = lastEvent.team === 2 ? scoringRef.current.team2Score - 1 : scoringRef.current.team2Score;

    if (lastEvent.team === 1) {
      setTeam1Score(prev => prev - 1);
    } else {
      setTeam2Score(prev => prev - 1);
    }

    setLineIndex(lastEvent.lineIndex);
    setPointNumber(lastEvent.pointNumber);
    setOpenIndex(lastEvent.openIndex);
    setWomenIndex(lastEvent.womenIndex);
    setDismissedTagPoint((current) => (current === lastEvent.pointNumber ? null : current));

    const restored = restoreActivatedPendingAfterUndo({
      pendingIdsAtScore: lastEvent.pendingPlayerIds ?? [],
      masterOpenQueue,
      masterWomenQueue,
      currentPending: pendingPlayers,
    });
    setMasterOpenQueue(restored.masterOpenQueue);
    setMasterWomenQueue(restored.masterWomenQueue);
    setPendingPlayers(restored.pendingPlayers);

    scoringRef.current = {
      ...scoringRef.current,
      team1Score: nextTeam1,
      team2Score: nextTeam2,
      lineIndex: lastEvent.lineIndex,
      pointNumber: lastEvent.pointNumber,
      openIndex: lastEvent.openIndex,
      womenIndex: lastEvent.womenIndex,
      masterOpenQueue: restored.masterOpenQueue,
      masterWomenQueue: restored.masterWomenQueue,
      pendingPlayers: restored.pendingPlayers,
    };

    setScoreHistory(prev => prev.slice(0, -1));
  };

  const onRosterChange = (newRoster: Player[]) => {
    const newRosterIds = new Set(newRoster.map(p => p.uuid));
    const removedPlayers = roster.filter(p => !newRosterIds.has(p.uuid));
    const addedPlayers = newRoster.filter(p => !roster.some(rp => rp.uuid === p.uuid));
  
    let nextMasterOpenQueue = [...masterOpenQueue];
    let nextMasterWomenQueue = [...masterWomenQueue];
    let nextOpenIndex = openIndex;
    let nextWomenIndex = womenIndex;

    if (removedPlayers.length > 0) {
      const r = applyQueueRemovalsForRosterChange(
        nextMasterOpenQueue,
        nextMasterWomenQueue,
        nextOpenIndex,
        nextWomenIndex,
        removedPlayers
      );
      nextMasterOpenQueue = r.masterOpenQueue;
      nextMasterWomenQueue = r.masterWomenQueue;
      nextOpenIndex = r.openIndex;
      nextWomenIndex = r.womenIndex;
    } else if (addedPlayers.length > 0) {
      // Pre-kickoff adds update queues in handleLateArrival; post-kickoff they stay pending.
    } else {
      const stillPendingIds = new Set(pendingPlayers.map(p => p.uuid));
      const activePlayers = newRoster.filter(p => !stillPendingIds.has(p.uuid));
      const inPlace = applyInPlaceRosterUpdate({
        masterOpenQueue: nextMasterOpenQueue,
        masterWomenQueue: nextMasterWomenQueue,
        newRosterActivePlayers: activePlayers,
      });
      if (inPlace) {
        nextMasterOpenQueue = inPlace.masterOpenQueue;
        nextMasterWomenQueue = inPlace.masterWomenQueue;
      } else {
        const reordered = applyDragReorderToMasterQueues({
          masterOpenQueue: nextMasterOpenQueue,
          masterWomenQueue: nextMasterWomenQueue,
          openIndex: nextOpenIndex,
          womenIndex: nextWomenIndex,
          newRosterActivePlayers: activePlayers,
        });
        nextMasterOpenQueue = reordered.masterOpenQueue;
        nextMasterWomenQueue = reordered.masterWomenQueue;
        nextOpenIndex = reordered.openIndex;
        nextWomenIndex = reordered.womenIndex;
      }
    }
  
    setRoster(newRoster);
    setMasterOpenQueue(nextMasterOpenQueue);
    setMasterWomenQueue(nextMasterWomenQueue);
    setOpenIndex(nextOpenIndex);
    setWomenIndex(nextWomenIndex);

    const rosterById = new Map(newRoster.map((player) => [player.uuid, player]));
    const stillPending = pendingPlayers
      .filter((player) => newRosterIds.has(player.uuid))
      .map((player) => rosterById.get(player.uuid) ?? player);
    setPendingPlayers(stillPending);
  };

  const handleLateArrival = (player: Player) => {
    const nextRoster = assignNumbers(insertPlayerAtGenderEndOfRoster(roster, player));
    setRoster(nextRoster);

    if (!gameStarted) {
      if (player.gender === 'O') {
        const oldLen = masterOpenQueue.length;
        const nextOpen = [...masterOpenQueue, player];
        setMasterOpenQueue(nextOpen);
        if (oldLen > 0) {
          setOpenIndex((idx) =>
            expandRawIndexAfterQueueAppend(idx, oldLen, nextOpen.length)
          );
        }
      } else {
        const oldLen = masterWomenQueue.length;
        const nextWomen = [...masterWomenQueue, player];
        setMasterWomenQueue(nextWomen);
        if (oldLen > 0) {
          setWomenIndex((idx) =>
            expandRawIndexAfterQueueAppend(idx, oldLen, nextWomen.length)
          );
        }
      }
      return;
    }

    const nextPending = [...pendingPlayers, player];
    const placed = partitionPendingForLineChange({
      pendingPlayers: nextPending,
      masterOpenQueue,
      masterWomenQueue,
      openIndex,
      womenIndex,
      lineIndex,
      startingOpen,
      lineupSize,
      splitCycle,
    });
    setMasterOpenQueue(placed.masterOpenQueue);
    setMasterWomenQueue(placed.masterWomenQueue);
    setOpenIndex(placed.openIndex);
    setWomenIndex(placed.womenIndex);
    setPendingPlayers(placed.stillPending);
    scoringRef.current = {
      ...scoringRef.current,
      masterOpenQueue: placed.masterOpenQueue,
      masterWomenQueue: placed.masterWomenQueue,
      openIndex: placed.openIndex,
      womenIndex: placed.womenIndex,
      pendingPlayers: placed.stillPending,
    };
  };

  const commitLinePattern = (patch: {
    size?: LineupSize;
    open?: number;
    cycle?: SplitCycle;
  }) => {
    const next = nextLinePattern(linePatternRef.current, patch);
    linePatternRef.current = next;
    setLineupSize(next.size);
    setStartingOpen(next.open);
    setSplitCycle(next.cycle);
    if (!gameStarted || pendingPlayers.length === 0) return;
    const placed = partitionPendingForLineChange({
      pendingPlayers,
      masterOpenQueue,
      masterWomenQueue,
      openIndex,
      womenIndex,
      lineIndex,
      startingOpen: next.open,
      lineupSize: next.size,
      splitCycle: next.cycle,
    });
    if (placed.activate.length === 0) return;
    setMasterOpenQueue(placed.masterOpenQueue);
    setMasterWomenQueue(placed.masterWomenQueue);
    setOpenIndex(placed.openIndex);
    setWomenIndex(placed.womenIndex);
    setPendingPlayers(placed.stillPending);
    scoringRef.current = {
      ...scoringRef.current,
      masterOpenQueue: placed.masterOpenQueue,
      masterWomenQueue: placed.masterWomenQueue,
      openIndex: placed.openIndex,
      womenIndex: placed.womenIndex,
      pendingPlayers: placed.stillPending,
    };
  };

  // Changing players-per-point or gender split only changes window *length*.
  // Keep openIndex / womenIndex (next-on) exactly where they are.

  // Roster order follows master queues + extras (pending / edge); keeps subs and queue-only updates in sync.
  useEffect(() => {
    setRoster((prev) => {
      const next = assignNumbers(
        mergeRosterFromGenderQueues(masterOpenQueue, masterWomenQueue, prev)
      );
      if (
        next.length === prev.length &&
        next.every((p, i) => p.uuid === prev[i]?.uuid)
      ) {
        return prev;
      }
      return next;
    });
  }, [masterOpenQueue, masterWomenQueue]);

  useEffect(() => {
    if (showHomeScreen) return;
    const key = team1Name.trim();
    if (!key) return;
    saveRosterForTeam(key, roster);
  }, [roster, team1Name, showHomeScreen]);

  useEffect(() => {
    if (!sessionReady || showHomeScreen || !gameStarted) return;
    scheduleSaveGameSession({
      v: 1,
      team1Name,
      team2Name,
      team1Score,
      team2Score,
      roster,
      masterOpenQueue,
      masterWomenQueue,
      pendingPlayers,
      gameStarted,
      lineIndex,
      pointNumber,
      openIndex,
      womenIndex,
      scoreHistory,
      openingPull,
      halfPoint,
      halfPull,
      startedAt,
      lineupSize,
      startingOpen,
      splitCycle,
      softCap,
      halfAt,
      endAt,
      showRoster,
      setupStep,
    watchRoomId: watchRoomId ?? undefined,
    watchWriteKey: watchWriteKey ?? undefined,
    watchViewKey: watchViewKey ?? undefined,
    archiveId: activeArchiveId ?? undefined,
    });
  }, [
    sessionReady,
    showHomeScreen,
    team1Name,
    team2Name,
    team1Score,
    team2Score,
    roster,
    masterOpenQueue,
    masterWomenQueue,
    pendingPlayers,
    gameStarted,
    lineIndex,
    pointNumber,
    openIndex,
    womenIndex,
    scoreHistory,
    openingPull,
    halfPoint,
    halfPull,
    startedAt,
    lineupSize,
    startingOpen,
    splitCycle,
    softCap,
    halfAt,
    endAt,
    showRoster,
    setupStep,
    watchRoomId,
    watchWriteKey,
    watchViewKey,
    activeArchiveId,
  ]);

  if (watchHash?.kind === 'snapshot') {
    return (
      <SpectatorScreen
        snapshot={watchHash.snapshot}
        linkStatus="snapshot"
      />
    );
  }

  if (viewingRoomId) {
    return (
      <SpectatorScreen
        snapshot={roomSnapshot}
        linkStatus={roomStatus}
        audience={viewingAsTeam ? 'team' : 'public'}
      />
    );
  }

  const lastPoint = scoreHistory[scoreHistory.length - 1];
  const tagPlayers =
    lastPoint?.team === 1
      ? (lastPoint.linePlayerIds ?? [])
          .map((id) => roster.find((player) => player.uuid === id))
          .filter((player): player is Player => player != null)
      : [];
  const tagStrip =
    tagGoalsLive &&
    gameStarted &&
    lastPoint?.team === 1 &&
    dismissedTagPoint !== lastPoint.pointNumber &&
    tagPlayers.length > 0
      ? {
          pointNumber: lastPoint.pointNumber,
          scorerId: lastPoint.scorerId,
          throwerId: lastPoint.throwerId,
          players: tagPlayers,
        }
      : null;
  const half = halfPoint != null && halfPull ? { pointNumber: halfPoint, pull: halfPull } : null;
  const currentPull =
    gameStarted && openingPull
      ? pullingTeamForPoint(pointNumber, openingPull, scoreHistory, half)
      : null;
  const pullLabel =
    currentPull === 1 ? 'We pull' : currentPull === 2 ? 'They pull' : null;
  const openArchive = openArchiveId
    ? archive.find((game) => game.id === openArchiveId) ?? null
    : null;

  if (showHomeScreen && openArchive) {
    return (
      <ArchiveGameScreen
        game={openArchive}
        onBack={() => setOpenArchiveId(null)}
        onChange={(next) => setArchive(replaceArchivedGame(next))}
      />
    );
  }

  if (showHomeScreen) {
    return (
      <HomeScreen
        onStart={handleStartGame}
        onResume={resumeLabel ? handleResumeGame : undefined}
        resumeLabel={resumeLabel}
        onForgetTeam={handleForgetTeam}
        archivedGames={archive.map((game) => ({
          id: game.id,
          title: archiveTitle(game, archive),
          score: `${game.team1Score}–${game.team2Score}`,
        }))}
        onContinueGame={handleContinueGame}
        onForgetGame={handleForgetGame}
      />
    );
  }

  return (
    <>
      {showRoster ? (
        <PlayerManager
          roster={roster}
          onRosterChange={onRosterChange}
          onLateArrival={handleLateArrival}
          pendingPlayers={pendingPlayers}
          gameStarted={gameStarted}
          setupStep={setupStep}
          masterOpenQueue={masterOpenQueue}
          masterWomenQueue={masterWomenQueue}
          onForcePendingToRotation={handleForcePendingToRotation}
          onOpenScoreboard={() => setShowRoster(false)}
          onContinueToLine={() => setSetupStep('line')}
          onReady={() => setShowRoster(false)}
          onOpenSettings={() => setSettingsVisible(true)}
          onHome={goHome}
          onBack={
            gameStarted
              ? undefined
              : setupStep === 'roster'
                ? handleChangeTeam
                : () => setSetupStep('roster')
          }
          lineupSize={lineupSize}
          startingOpen={startingOpen}
          splitCycle={splitCycle}
          softCap={softCap}
          halfAt={halfAt}
          endAt={endAt}
          onLineupSizeChange={(size) => {
            commitLinePattern({ size });
          }}
          onStartingOpenChange={(open) => {
            commitLinePattern({ open });
          }}
          onSplitCycleChange={(cycle) => {
            commitLinePattern({ cycle });
          }}
          onSoftCapChange={setSoftCap}
          onHalfAtChange={setHalfAt}
          onEndAtChange={setEndAt}
          onImportPlayers={handleImportPlayers}
        />
      ) : (
        <ScoreBoard
          team1Name={team1Name}
          team2Name={team2Name}
          team1Score={team1Score}
          team2Score={team2Score}
          onTeam1ScoreChange={handleTeam1ScoreChange}
          onTeam2ScoreChange={handleTeam2ScoreChange}
          lineIndex={lineIndex}
          pointNumber={pointNumber}
          onReset={handleReset}
          onUndo={handleUndo}
          startingOpen={startingOpen}
          lineupSize={lineupSize}
          splitCycle={splitCycle}
          softCap={softCap}
          halfAt={halfAt}
          endAt={endAt}
          setSettingsVisible={setSettingsVisible}
          onOpenRoster={() => {
            setShowRoster(true);
            if (!gameStarted) setSetupStep('line');
          }}
          onBackToSetup={() => {
            setShowRoster(true);
            setSetupStep('line');
          }}
          onHome={goHome}
          pendingCount={pendingPlayers.length}
          roster={roster}
          openQueue={currentOpenQueue}
          womanQueue={currentWomanQueue}
          nextOpenQueue={nextOpenQueue}
          nextWomanQueue={nextWomanQueue}
          scoreHistory={scoreHistory}
          gameStarted={gameStarted}
          onKickoff={handleKickoff}
          onHalfPull={handleHalfPull}
          halfActive={halfPoint === pointNumber && halfPull != null}
          halfChosen={halfPoint != null && halfPull != null}
          halfChoice={halfPoint === pointNumber ? halfPull : null}
          suggestedHalfPull={openingPull === 1 ? 2 : openingPull === 2 ? 1 : null}
          onSubstitute={handleSubstitute}
          pullLabel={
            pullLabel && halfPoint === pointNumber && halfPull ? `Half · ${pullLabel}` : pullLabel
          }
          tagStrip={tagStrip}
          onTagPlayer={handleTagGoal}
          onDismissTag={handleDismissTag}
        />
      )}
      {settingsVisible && (
      <SettingsModal
        visible={settingsVisible}
        onClose={() => setSettingsVisible(false)}
        team1Name={team1Name}
        team2Name={team2Name}
        onTeam1NameChange={setTeam1Name}
        onTeam2NameChange={setTeam2Name}
        startingOpen={startingOpen}
        onStartingOpenChange={(open) => {
          commitLinePattern({ open });
        }}
        lineupSize={lineupSize}
        onLineupSizeChange={(size) => {
          commitLinePattern({ size });
        }}
        splitCycle={splitCycle}
        onSplitCycleChange={(cycle) => {
          commitLinePattern({ cycle });
        }}
        softCap={softCap}
        onSoftCapChange={setSoftCap}
        halfAt={halfAt}
        onHalfAtChange={setHalfAt}
        endAt={endAt}
        onEndAtChange={setEndAt}
        theme={theme}
        onThemeChange={setTheme}
        onReset={handleReset}
        onChangeTeam={handleChangeTeam}
        onEndGame={handleEndGame}
        hasPoints={scoreHistory.length > 0}
        tagGoalsLive={tagGoalsLive}
        onTagGoalsLiveChange={handleTagGoalsLiveChange}
        spectatorLink={watchRoomId ? watchRoomUrlFromLocation(watchRoomId) : ''}
        teamSpectatorLink={
          watchRoomId && watchViewKey ? watchRoomUrlFromLocation(watchRoomId, watchViewKey) : ''
        }
        team1Score={team1Score}
        team2Score={team2Score}
        pointNumber={pointNumber}
        lineIndex={lineIndex}
        currentLine={currentLine}
        nextLine={nextLine}
        pendingPlayers={pendingPlayers}
        roster={roster}
        masterOpenQueue={masterOpenQueue}
        masterWomenQueue={masterWomenQueue}
        scoreHistory={scoreHistory}
      />
      )}
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    backgroundColor: COLORS.background,
  },
  mainContent: {
    flex: 1,
    overflow: 'auto',
  },
};
