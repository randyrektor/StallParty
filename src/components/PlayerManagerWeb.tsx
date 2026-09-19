import React, { useState, useMemo, useRef } from 'react';
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Player, type LineupSize, type SplitCycle, type PlayerPosition, PLAYER_POSITIONS, PLAYER_POSITION_LABELS, parseJersey } from '../types';
import { THEME } from '../constants';
import { AppShell } from './AppShell';
import { PlayerSeat } from './PlayerSeat';
import {
  clampOpenCount,
  isSplitCycleAvailable,
  getGenderPattern,
} from '../utils/rotationHelpers';
import { parseRosterText, rosterToCsv, type ParsedRosterRow } from '../utils/rosterImport';
import { capitalizeNameInput } from '../utils/capitalizeName';
import { type SoftPointCap } from '../utils/softCap';
import { type GameClockTime } from '../utils/gameClock';
import { SoftCapInput } from './SoftCapInput';
import { GameClockInput } from './GameClockInput';

const COLORS = {
  background: THEME.bgPage,
  card: THEME.bgElevated,
  text: THEME.text,
  textSecondary: THEME.textSecondary,
  open: THEME.open,
  women: THEME.women,
  delete: THEME.danger,
  add: THEME.success,
  border: THEME.border,
  input: THEME.bgInput,
  handle: 'var(--text-muted)',
};

interface PlayerManagerWebProps {
  roster: Player[];
  onRosterChange: (newRoster: Player[]) => void;
  onLateArrival: (player: Player) => void;
  pendingPlayers: Player[];
  masterOpenQueue?: Player[];
  masterWomenQueue?: Player[];
  onForcePendingToRotation?: (player: Player) => void;
  gameStarted?: boolean;
  setupStep?: 'roster' | 'line';
  onOpenScoreboard?: () => void;
  onContinueToLine?: () => void;
  onReady?: () => void;
  onOpenSettings?: () => void;
  onBack?: () => void;
  lineupSize?: LineupSize;
  startingOpen?: number;
  splitCycle?: SplitCycle;
  onLineupSizeChange?: (size: LineupSize) => void;
  onStartingOpenChange?: (open: number) => void;
  onSplitCycleChange?: (cycle: SplitCycle) => void;
  softCap?: SoftPointCap;
  onSoftCapChange?: (cap: SoftPointCap) => void;
  halfAt?: GameClockTime;
  onHalfAtChange?: (time: GameClockTime) => void;
  endAt?: GameClockTime;
  onEndAtChange?: (time: GameClockTime) => void;
  onImportPlayers?: (rows: ParsedRosterRow[]) => { added: number; skipped: number };
}

function stopSeatDrag(e: React.SyntheticEvent) {
  e.stopPropagation();
}

function PositionSelect({
  value,
  onChange,
  ariaLabel,
  className = 'player-seat-field player-seat-field--pos',
}: {
  value: PlayerPosition | '';
  onChange: (value: PlayerPosition | '') => void;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <select
      className={className}
      value={value}
      aria-label={ariaLabel}
      onPointerDown={stopSeatDrag}
      onMouseDown={stopSeatDrag}
      onClick={stopSeatDrag}
      onChange={(e) => onChange(e.target.value as PlayerPosition | '')}
    >
      <option value="">Pos</option>
      {PLAYER_POSITIONS.map((pos) => (
        <option key={pos} value={pos}>
          {PLAYER_POSITION_LABELS[pos]}
        </option>
      ))}
    </select>
  );
}

function JerseyInput({
  value,
  onChange,
  onEnter,
  ariaLabel,
  className = 'player-seat-field player-seat-field--jersey',
}: {
  value: string;
  onChange: (value: string) => void;
  onEnter?: () => void;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <input
      className={className}
      value={value}
      inputMode="numeric"
      maxLength={2}
      placeholder="#"
      aria-label={ariaLabel}
      onPointerDown={stopSeatDrag}
      onMouseDown={stopSeatDrag}
      onClick={stopSeatDrag}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && onEnter) {
          e.preventDefault();
          onEnter();
        }
      }}
      onChange={(e) => {
        const next = e.target.value;
        if (next === '' || /^\d{0,2}$/.test(next)) onChange(next);
      }}
    />
  );
}

function SortablePlayer({
  player,
  index,
  isEditMode,
  onDelete,
  isPending,
  onLongPress,
  onForcePending,
  onUpdate,
}: {
  player: Player;
  index: number;
  isEditMode: boolean;
  onDelete: (player: Player) => void;
  isPending: boolean;
  onLongPress: () => void;
  onForcePending?: (player: Player) => void;
  onUpdate: (player: Player, patch: Pick<Player, 'jersey' | 'position'>) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: player.uuid });
  const longPressTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasMoved = useRef(false);
  const startPosition = useRef<{ x: number; y: number } | null>(null);
  const [jerseyText, setJerseyText] = useState(player.jersey != null ? String(player.jersey) : '');

  const commitJersey = (raw: string) => {
    setJerseyText(raw);
    const jersey = parseJersey(raw);
    if (raw.trim() === '') {
      if (player.jersey != null) onUpdate(player, { jersey: undefined, position: player.position });
      return;
    }
    if (jersey != null && jersey !== player.jersey) {
      onUpdate(player, { jersey, position: player.position });
    }
  };

  // Handlers for long-press
  const handlePointerDown = (e: React.PointerEvent | React.TouchEvent) => {
    if (isEditMode) return;
    
    // Reset movement tracking
    hasMoved.current = false;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    startPosition.current = { x: clientX, y: clientY };
    
    longPressTimeout.current = setTimeout(() => {
      // Only trigger long-press if we haven't moved significantly
      if (!hasMoved.current && onLongPress) {
        onLongPress();
      }
    }, 800);
  };

  const handlePointerMove = (e: React.PointerEvent | React.TouchEvent) => {
    if (!startPosition.current || isEditMode) return;
    
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    const deltaX = Math.abs(clientX - startPosition.current.x);
    const deltaY = Math.abs(clientY - startPosition.current.y);
    
    // If moved more than 10px in any direction, cancel long-press
    if (deltaX > 10 || deltaY > 10) {
      hasMoved.current = true;
      if (longPressTimeout.current) {
        clearTimeout(longPressTimeout.current);
        longPressTimeout.current = null;
      }
    }
  };

  const handlePointerUp = () => {
    if (longPressTimeout.current) {
      clearTimeout(longPressTimeout.current);
      longPressTimeout.current = null;
    }
    startPosition.current = null;
  };

  return (
    <div
      className="roster-row"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onTouchStart={handlePointerDown}
      onTouchMove={handlePointerMove}
      onTouchEnd={handlePointerUp}
      onTouchCancel={handlePointerUp}
    >
      <span className="roster-index">
        {player.number > 0 ? player.number : index + 1}
      </span>
      <PlayerSeat
        ref={setNodeRef}
        gender={player.gender}
        name={player.name}
        pending={isPending}
        statusSlot={
          isPending ? (
            onForcePending ? (
              <button
                type="button"
                className="player-seat-add-now"
                aria-label={`Add ${player.name} to the rotation`}
                onPointerDown={stopSeatDrag}
                onMouseDown={stopSeatDrag}
                onClick={(e) => {
                  e.stopPropagation();
                  onForcePending(player);
                }}
              >
                Add now
              </button>
            ) : (
              <span className="player-seat-pending">Pending</span>
            )
          ) : undefined
        }
        jerseySlot={
          <JerseyInput
            value={jerseyText}
            onChange={commitJersey}
            ariaLabel={`Jersey number for ${player.name}`}
          />
        }
        positionSlot={
          <PositionSelect
            value={player.position ?? ''}
            onChange={(position) =>
              onUpdate(player, {
                jersey: player.jersey,
                position: position || undefined,
              })
            }
            ariaLabel={`Position for ${player.name}`}
          />
        }
        style={{
          opacity: isDragging ? 0.8 : 1,
          transform: CSS.Transform.toString(transform),
          transition,
          touchAction: 'none',
          paddingRight: isEditMode ? 32 : undefined,
        }}
        {...attributes}
        {...listeners}
      >
        <button
          style={{
            ...styles.deleteButton,
            position: 'absolute',
            right: '8px',
            top: '50%',
            transform: 'translateY(-50%)',
            opacity: isEditMode ? 1 : 0,
            pointerEvents: isEditMode ? 'auto' : 'none',
            transition: 'opacity 0.2s',
          }}
          onClick={() => onDelete(player)}
          tabIndex={isEditMode ? 0 : -1}
          aria-label="Remove player"
        >
          ×
        </button>
      </PlayerSeat>
    </div>
  );
}

function AddGhostRow({
  gender,
  nextNumber,
  value,
  jersey,
  position,
  inputRef,
  onChange,
  onJerseyChange,
  onPositionChange,
  onSubmit,
}: {
  gender: 'O' | 'W';
  nextNumber: number;
  value: string;
  jersey: string;
  position: PlayerPosition | '';
  inputRef: React.RefObject<HTMLInputElement | null>;
  onChange: (value: string) => void;
  onJerseyChange: (value: string) => void;
  onPositionChange: (value: PlayerPosition | '') => void;
  onSubmit: () => void;
}) {
  const genderLabel = gender === 'O' ? 'Open' : 'Women';
  return (
    <div className="roster-row">
      <span className="roster-index">{nextNumber}</span>
      <label
        className={`player-seat player-seat-add player-seat--${gender === 'O' ? 'open' : 'women'}`}
      >
        <span className="player-seat-add-plus" aria-hidden />
        <input
          ref={inputRef}
          className="player-seat-add-name"
          value={value}
          autoCapitalize="words"
          autoCorrect="off"
          spellCheck={false}
          onChange={(e) => onChange(capitalizeNameInput(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onSubmit();
            }
          }}
          placeholder={`Add ${genderLabel.toLowerCase()}`}
          aria-label={`Add ${genderLabel.toLowerCase()} player`}
        />
        <span className="player-seat-meta">
          <JerseyInput
            value={jersey}
            onChange={onJerseyChange}
            onEnter={onSubmit}
            ariaLabel={`${genderLabel} jersey number`}
          />
          <PositionSelect
            value={position}
            onChange={onPositionChange}
            ariaLabel={`${genderLabel} position`}
          />
        </span>
      </label>
    </div>
  );
}

function GenderRosterColumn({
  gender,
  title,
  players,
  firstCount,
  showLinePreview,
  isEditMode,
  pendingPlayers,
  onDelete,
  onLongPress,
  onForcePending,
  onUpdate,
  addValue,
  addJersey,
  addPosition,
  inputRef,
  onAddChange,
  onAddJerseyChange,
  onAddPositionChange,
  onAddSubmit,
}: {
  gender: 'O' | 'W';
  title: string;
  players: Player[];
  firstCount: number;
  showLinePreview: boolean;
  isEditMode: boolean;
  pendingPlayers: Player[];
  onDelete: (player: Player) => void;
  onLongPress: () => void;
  onForcePending?: (player: Player) => void;
  onUpdate: (player: Player, patch: { jersey?: number; position?: PlayerPosition }) => void;
  addValue: string;
  addJersey: string;
  addPosition: PlayerPosition | '';
  inputRef: React.RefObject<HTMLInputElement | null>;
  onAddChange: (value: string) => void;
  onAddJerseyChange: (value: string) => void;
  onAddPositionChange: (value: PlayerPosition | '') => void;
  onAddSubmit: () => void;
}) {
  const first = players.slice(0, firstCount);
  const rest = players.slice(firstCount);
  const emptyCount = showLinePreview ? Math.max(0, firstCount - players.length) : 0;
  const isPending = (player: Player) => pendingPlayers.some((p) => p.uuid === player.uuid);

  const addRow = (
    <AddGhostRow
      gender={gender}
      nextNumber={players.length + 1}
      value={addValue}
      jersey={addJersey}
      position={addPosition}
      inputRef={inputRef}
      onChange={onAddChange}
      onJerseyChange={onAddJerseyChange}
      onPositionChange={onAddPositionChange}
      onSubmit={onAddSubmit}
    />
  );

  const playerRows = (list: Player[], startIndex: number) =>
    list.map((player, index) => (
      <SortablePlayer
        key={player.uuid}
        player={player}
        index={startIndex + index}
        isEditMode={isEditMode}
        onDelete={onDelete}
        isPending={isPending(player)}
        onLongPress={onLongPress}
        onForcePending={onForcePending}
        onUpdate={onUpdate}
      />
    ));

  return (
    <div style={styles.rosterColumn}>
      <h3 className="roster-column-title">{title}</h3>
      <SortableContext items={players.map((p) => p.uuid)} strategy={verticalListSortingStrategy}>
        {showLinePreview ? (
          <>
            <div className="roster-line-band">
              <div className="roster-section-label">First line</div>
              {playerRows(first, 0)}
              {Array.from({ length: emptyCount }, (_, i) => (
                <div key={`empty-${gender}-${i}`} className="roster-row">
                  <span className="roster-index roster-index--empty">{players.length + i + 1}</span>
                  <PlayerSeat
                    gender={gender}
                    empty
                    role="button"
                    tabIndex={0}
                    onClick={() => inputRef.current?.focus()}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        inputRef.current?.focus();
                      }
                    }}
                  />
                </div>
              ))}
            </div>
            {rest.length > 0 && (
              <div className="roster-line-band">
                <div className="roster-section-label">Next line</div>
                {playerRows(rest, firstCount)}
              </div>
            )}
            {addRow}
          </>
        ) : (
          <>
            {playerRows(players, 0)}
            {addRow}
          </>
        )}
      </SortableContext>
    </div>
  );
}

const LINEUP_SIZE_OPTIONS: LineupSize[] = [4, 5, 6, 7];
const CYCLE_OPTIONS: { label: string; value: SplitCycle }[] = [
  { label: 'Repeating', value: 'same' },
  { label: 'ABBA', value: 'ABBA' },
  { label: 'AAB', value: 'AAB' },
];

function LineSetup({
  lineupSize,
  startingOpen,
  splitCycle,
  softCap,
  onLineupSizeChange,
  onStartingOpenChange,
  onSplitCycleChange,
  onSoftCapChange,
  halfAt,
  onHalfAtChange,
  endAt,
  onEndAtChange,
}: {
  lineupSize: LineupSize;
  startingOpen: number;
  splitCycle: SplitCycle;
  softCap: SoftPointCap;
  onLineupSizeChange: (size: LineupSize) => void;
  onStartingOpenChange: (open: number) => void;
  onSplitCycleChange?: (cycle: SplitCycle) => void;
  onSoftCapChange: (cap: SoftPointCap) => void;
  halfAt: GameClockTime;
  onHalfAtChange: (time: GameClockTime) => void;
  endAt: GameClockTime;
  onEndAtChange: (time: GameClockTime) => void;
}) {
  const openCount = clampOpenCount(startingOpen, lineupSize);
  const womenCount = lineupSize - openCount;

  const setSize = (n: LineupSize) => {
    onLineupSizeChange(n);
  };

  return (
    <div className="line-setup">
      <div className="line-setup-grid">
        <div className="line-setup-col">
          <div className="line-setup-group">
            <span className="line-setup-label">Players per point</span>
            <div className="line-setup-pills">
              {LINEUP_SIZE_OPTIONS.map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`line-setup-pill${lineupSize === n ? ' is-active' : ''}`}
                  onClick={() => setSize(n)}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          {onSplitCycleChange && (
            <div className="line-setup-group">
              <span className="line-setup-label">Cycle</span>
              <div className="line-setup-pills">
                {CYCLE_OPTIONS.map((opt) => {
                  const locked = !isSplitCycleAvailable(lineupSize, openCount, opt.value);
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      className={`line-setup-pill${splitCycle === opt.value ? ' is-active' : ''}`}
                      disabled={locked}
                      onClick={() => {
                        if (!locked) onSplitCycleChange(opt.value);
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        <div className="line-setup-col">
          <div className="line-setup-group">
            <span className="line-setup-label">Starting split</span>
            <div className="line-setup-split">
              <button
                type="button"
                className="line-setup-step line-setup-step--open"
                disabled={openCount >= lineupSize}
                aria-label="+ Open"
                onClick={() => onStartingOpenChange(Math.min(lineupSize, openCount + 1))}
              >
                + Open
              </button>
              <span className="line-setup-ratio">{openCount}:{womenCount}</span>
              <button
                type="button"
                className="line-setup-step line-setup-step--women"
                disabled={openCount <= 0}
                aria-label="+ Women"
                onClick={() => onStartingOpenChange(Math.max(0, openCount - 1))}
              >
                + Women
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="line-setup-group line-setup-group--clocks">
        <span className="line-setup-label">
          Score and time <span className="line-setup-optional">(optional)</span>
        </span>
        <div className="line-setup-clocks">
          <label className="line-setup-clock">
            <span>Score to</span>
            <SoftCapInput value={softCap} onChange={onSoftCapChange} />
          </label>
          <label className="line-setup-clock">
            <span>Half at</span>
            <GameClockInput value={halfAt} onChange={onHalfAtChange} ariaLabel="Halftime reminder" />
          </label>
          <label className="line-setup-clock">
            <span>End at</span>
            <GameClockInput value={endAt} onChange={onEndAtChange} ariaLabel="Game end reminder" />
          </label>
        </div>
      </div>
    </div>
  );
}

export function PlayerManagerWeb({
  roster,
  onRosterChange,
  onLateArrival,
  pendingPlayers,
  masterOpenQueue = [],
  masterWomenQueue = [],
  onForcePendingToRotation,
  gameStarted = false,
  setupStep = 'roster',
  onOpenScoreboard,
  onContinueToLine,
  onReady,
  onOpenSettings,
  onBack,
  lineupSize = 7,
  startingOpen = 4,
  splitCycle = 'ABBA',
  onLineupSizeChange,
  onStartingOpenChange,
  onSplitCycleChange,
  onImportPlayers,
  softCap = null,
  onSoftCapChange,
  halfAt = null,
  onHalfAtChange,
  endAt = null,
  onEndAtChange,
}: PlayerManagerWebProps) {
  const [isEditMode, setIsEditMode] = useState(false);
  const [openDraft, setOpenDraft] = useState('');
  const [womenDraft, setWomenDraft] = useState('');
  const [openJersey, setOpenJersey] = useState('');
  const [womenJersey, setWomenJersey] = useState('');
  const [openPosition, setOpenPosition] = useState<PlayerPosition | ''>('');
  const [womenPosition, setWomenPosition] = useState<PlayerPosition | ''>('');
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importMessage, setImportMessage] = useState('');
  const importFileRef = useRef<HTMLInputElement>(null);
  const openInputRef = useRef<HTMLInputElement>(null);
  const womenInputRef = useRef<HTMLInputElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { distance: 8 } })
  );

  // List order = master rotation queue first (source of truth after subs), then roster-only extras (e.g. pending).
  const openPlayers = useMemo(() => {
    const ids = new Set(masterOpenQueue.map((p) => p.uuid));
    const extras = roster.filter((p) => p.gender === 'O' && !ids.has(p.uuid));
    return [...masterOpenQueue, ...extras];
  }, [masterOpenQueue, roster]);

  const womenPlayers = useMemo(() => {
    const ids = new Set(masterWomenQueue.map((p) => p.uuid));
    const extras = roster.filter((p) => p.gender === 'W' && !ids.has(p.uuid));
    return [...masterWomenQueue, ...extras];
  }, [masterWomenQueue, roster]);

  // Split pending players into open and women
  const pendingOpenPlayers = useMemo(() => pendingPlayers.filter(p => p.gender === 'O'), [pendingPlayers]);
  const pendingWomenPlayers = useMemo(() => pendingPlayers.filter(p => p.gender === 'W'), [pendingPlayers]);

  function handlePlayerDragEnd(event: any, gender: 'O' | 'W') {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const group = gender === 'O' ? openPlayers : womenPlayers;
    const oldIndex = group.findIndex(p => p.uuid === active.id);
    const newIndex = group.findIndex(p => p.uuid === over.id);
    const reorderedGroup = arrayMove(group, oldIndex, newIndex);

    const otherGroup = gender === 'O' ? womenPlayers : openPlayers;
    const newRoster = gender === 'O' ? [...reorderedGroup, ...otherGroup] : [...otherGroup, ...reorderedGroup];

    onRosterChange(assignNumbers(newRoster));
  }

  // Handle drag start to cancel any pending long-press
  function handlePlayerDragStart(event: any) {
    // Cancel any pending long-press when drag actually starts
    // This is a safety measure in case the movement detection didn't catch it
    if (event.active) {
      // The long-press timeout will be cleared by the movement detection
      // but this provides an additional safety net
    }
  }

  function handleDeletePlayer(playerToDelete: Player) {
    // Remove the player from the roster
    const newRoster = roster.filter(p => p.uuid !== playerToDelete.uuid);
    
    // Reassign numbers to maintain proper ordering
    const renumberedRoster = assignNumbers(newRoster);
    
    // Update the roster through the parent component
    onRosterChange(renumberedRoster);
  }

  function assignNumbers(players: Player[]) {
    let openCount = 1;
    let womenCount = 1;
    return players.map(player => ({
      ...player,
      number: player.gender === 'O' ? openCount++ : womenCount++,
    }));
  }

  function handleAddPlayer(gender: 'O' | 'W') {
    const name = capitalizeNameInput((gender === 'O' ? openDraft : womenDraft).trim());
    if (!name) return;
    const jersey = parseJersey(gender === 'O' ? openJersey : womenJersey);
    const position = gender === 'O' ? openPosition : womenPosition;
    onLateArrival({
      name,
      gender,
      uuid: crypto.randomUUID(),
      number: 0,
      ...(jersey != null ? { jersey } : {}),
      ...(position ? { position } : {}),
    });
    if (gender === 'O') {
      setOpenDraft('');
      setOpenJersey('');
      setOpenPosition('');
      openInputRef.current?.focus();
    } else {
      setWomenDraft('');
      setWomenJersey('');
      setWomenPosition('');
      womenInputRef.current?.focus();
    }
  }

  function applyImportText(text: string) {
    if (!onImportPlayers) return;
    const { players, errors } = parseRosterText(text);
    if (players.length === 0) {
      setImportMessage(errors[0] || 'No players found. Use: Name, O or W');
      return;
    }
    const result = onImportPlayers(players);
    const extra = errors.length ? ` (${errors.length} row${errors.length === 1 ? '' : 's'} skipped)` : '';
    setImportMessage(
      `Added ${result.added}. ${result.skipped} already on the roster.${extra}`
    );
    setImportText('');
  }

  function handleExportRoster() {
    const csv = rosterToCsv(roster);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'roster.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function handleUpdatePlayer(player: Player, patch: { jersey?: number; position?: PlayerPosition }) {
    onRosterChange(
      roster.map((p) => {
        if (p.uuid !== player.uuid) return p;
        const next: Player = { ...p, ...patch };
        if (patch.jersey == null) delete next.jersey;
        if (!patch.position) delete next.position;
        return next;
      })
    );
  }

  const handleLongPress = () => setIsEditMode(true);
  const isRosterStep = !gameStarted && setupStep === 'roster';
  const isLineStep = !gameStarted && setupStep === 'line';

  const firstPattern = useMemo(
    () => getGenderPattern(0, lineupSize, startingOpen, splitCycle),
    [lineupSize, startingOpen, splitCycle]
  );

  const shellTitle = gameStarted ? 'Roster' : isLineStep ? 'Game setup' : 'Roster';

  return (
    <AppShell
      title={shellTitle}
      left={
        <>
          {onBack && !gameStarted && (
            <button type="button" className="btn btn-ghost" onClick={onBack}>
              ← Back
            </button>
          )}
          {gameStarted && (
            <button type="button" className="btn btn-ghost" onClick={onOpenScoreboard}>
              Scoreboard
            </button>
          )}
        </>
      }
      right={
        <>
          {gameStarted && onOpenSettings && (
            <button type="button" className="btn btn-ghost" onClick={onOpenSettings}>
              Settings
            </button>
          )}
          {isEditMode && (
            <button type="button" className="btn btn-primary" onClick={() => setIsEditMode(false)}>
              Done
            </button>
          )}
        </>
      }
    >
          <div className={`roster-sheet${isLineStep ? ' roster-sheet--line' : ''}`}>
          {gameStarted && pendingPlayers.length > 0 && (
            <div style={styles.pendingExplainer}>
              <strong style={{ color: COLORS.text }}>Pending</strong>
              <span style={{ color: COLORS.textSecondary, fontSize: 12 }}>
                {' '}
                — they get the next number at the end of the list. If that number is already on this point, they wait; otherwise they join and you can drag them.
              </span>
            </div>
          )}

          {isLineStep && onLineupSizeChange && onStartingOpenChange && onSoftCapChange && onHalfAtChange && onEndAtChange && (
            <LineSetup
              lineupSize={lineupSize}
              startingOpen={startingOpen}
              splitCycle={splitCycle}
              softCap={softCap}
              onLineupSizeChange={onLineupSizeChange}
              onStartingOpenChange={onStartingOpenChange}
              onSplitCycleChange={onSplitCycleChange}
              onSoftCapChange={onSoftCapChange}
              halfAt={halfAt}
              onHalfAtChange={onHalfAtChange}
              endAt={endAt}
              onEndAtChange={onEndAtChange}
            />
          )}

          <div className="roster-board">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handlePlayerDragStart} onDragEnd={(e) => handlePlayerDragEnd(e, 'O')}>
              <GenderRosterColumn
                gender="O"
                title="Open"
                players={openPlayers}
                firstCount={firstPattern.men}
                showLinePreview={isLineStep}
                isEditMode={isEditMode}
                pendingPlayers={pendingOpenPlayers}
                onDelete={handleDeletePlayer}
                onLongPress={handleLongPress}
                onForcePending={onForcePendingToRotation}
                onUpdate={handleUpdatePlayer}
                addValue={openDraft}
                addJersey={openJersey}
                addPosition={openPosition}
                inputRef={openInputRef}
                onAddChange={setOpenDraft}
                onAddJerseyChange={setOpenJersey}
                onAddPositionChange={setOpenPosition}
                onAddSubmit={() => handleAddPlayer('O')}
              />
            </DndContext>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handlePlayerDragStart} onDragEnd={(e) => handlePlayerDragEnd(e, 'W')}>
              <GenderRosterColumn
                gender="W"
                title="Women"
                players={womenPlayers}
                firstCount={firstPattern.women}
                showLinePreview={isLineStep}
                isEditMode={isEditMode}
                pendingPlayers={pendingWomenPlayers}
                onDelete={handleDeletePlayer}
                onLongPress={handleLongPress}
                onForcePending={onForcePendingToRotation}
                onUpdate={handleUpdatePlayer}
                addValue={womenDraft}
                addJersey={womenJersey}
                addPosition={womenPosition}
                inputRef={womenInputRef}
                onAddChange={setWomenDraft}
                onAddJerseyChange={setWomenJersey}
                onAddPositionChange={setWomenPosition}
                onAddSubmit={() => handleAddPlayer('W')}
              />
            </DndContext>
          </div>

          {onImportPlayers && (isRosterStep || gameStarted) && (
            <div className="roster-import">
              <div className="roster-import-actions">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setImportOpen((v) => !v)}
                >
                  {importOpen ? 'Hide import' : 'Import roster'}
                </button>
                {roster.length > 0 && (
                  <button type="button" className="btn btn-ghost" onClick={handleExportRoster}>
                    Export CSV
                  </button>
                )}
              </div>
              {importOpen && (
                <div className="roster-import-panel">
                  <p className="roster-import-hint">
                    One player per line: <code>Name, O</code> or <code>Name, W, 12, handler</code>
                  </p>
                  <textarea
                    className="roster-import-textarea"
                    value={importText}
                    onChange={(e) => setImportText(e.target.value)}
                    rows={6}
                    placeholder={'Alex, O, 7, handler\nSam, W\nRiley, women, 12, cutter'}
                  />
                  <div className="roster-import-actions">
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => applyImportText(importText)}
                    >
                      Add to roster
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => importFileRef.current?.click()}
                    >
                      From file
                    </button>
                    <input
                      ref={importFileRef}
                      type="file"
                      accept=".csv,.txt,text/csv,text/plain"
                      hidden
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (!file) return;
                        file.text().then(applyImportText);
                      }}
                    />
                  </div>
                  {importMessage ? <p className="roster-import-status">{importMessage}</p> : null}
                </div>
              )}
            </div>
          )}

          {isRosterStep && (
            <button type="button" className="btn btn-primary kickoff-footer" onClick={onContinueToLine}>
              Set up this game
            </button>
          )}
          {isLineStep && (
            <button type="button" className="btn btn-primary kickoff-footer" onClick={onReady}>
              Start game
            </button>
          )}
          </div>
    </AppShell>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    backgroundColor: THEME.bgApp,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    padding: '12px 16px',
    borderBottom: `1px solid ${COLORS.border}`,
    flexShrink: 0,
  },
  headerLeft: {
    display: 'flex',
    gap: '8px',
    flex: '1 1 0',
  },
  headerRight: {
    display: 'flex',
    gap: '8px',
    flex: '1 1 0',
    justifyContent: 'flex-end',
  },
  headerTitle: {
    margin: 0,
    fontSize: '20px',
    fontWeight: 700,
    color: COLORS.text,
    textAlign: 'center',
    flex: '0 1 auto',
  },
  headerButton: {
    backgroundColor: THEME.bgInput,
    color: COLORS.text,
    border: `1px solid ${COLORS.border}`,
    padding: '10px 16px',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  headerButtonActive: {
    backgroundColor: COLORS.add,
    color: THEME.textOnAccent,
    borderColor: COLORS.add,
  },
  kickoffButton: {
    backgroundColor: THEME.open,
    color: THEME.textOnAccent,
    border: 'none',
    padding: '10px 18px',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 700,
    cursor: 'pointer',
    boxShadow: THEME.shadowCta,
  },
  pageBody: {
    flex: 1,
    overflowY: 'auto',
    padding: '16px',
    WebkitOverflowScrolling: 'touch',
  },
  addPlayerSection: {
    display: 'flex',
    gap: '10px',
    marginBottom: '2px',
    alignItems: 'center'
  },
  input: {
    flex: 1,
    padding: '10px 12px',
    backgroundColor: COLORS.input,
    border: `1px solid ${COLORS.border}`,
    borderRadius: '6px',
    color: COLORS.text,
    fontSize: '14px'
  },
  genderButtons: { display: 'flex', gap: '5px' },
  genderButton: {
    padding: '10px 20px',
    border: 'none',
    borderRadius: '6px',
    backgroundColor: THEME.bgInput,
    color: COLORS.textSecondary,
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: '14px',
    boxShadow: THEME.shadowButton,
    transition: 'background 0.2s, color 0.2s',
  },
  genderButtonActiveOpen: {
    backgroundColor: COLORS.open,
    color: THEME.textOnAccent,
    boxShadow: '0 2px 8px rgba(74,144,226,0.10)',
  },
  genderButtonActiveWomen: {
    backgroundColor: COLORS.women,
    color: THEME.textOnAccent,
    boxShadow: '0 2px 8px rgba(232,62,140,0.10)',
  },
  addButton: {
    padding: '10px 20px',
    backgroundColor: COLORS.add,
    color: THEME.textOnAccent,
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer'
  },
  actionButtonsRow: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
  },
  actionButton: {
    padding: '10px 20px',
    borderRadius: '6px',
    fontWeight: '600',
    fontSize: '14px',
    border: 'none',
    cursor: 'pointer',
    backgroundColor: COLORS.add,
    color: THEME.textOnAccent,
    transition: 'background 0.2s',
  },
  editButton: {
    backgroundColor: COLORS.delete,
    color: THEME.textOnAccent,
  },
  rosterContainer: {
    display: 'flex',
    gap: '16px',
    backgroundColor: THEME.bgPanel,
    borderRadius: '12px',
    padding: '12px 16px 20px 16px',
    border: `1px solid ${COLORS.border}`,
    width: '100%',
    boxSizing: 'border-box',
    overflow: 'visible',
    flexWrap: 'nowrap',
  },
  rosterColumn: {
    flex: 1,
    minWidth: 0,
    overflow: 'visible',
  },
  playerRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '10px',
  },
  numberSlot: {
    color: COLORS.textSecondary,
    width: '20px'
  },
  playerItem: {
    flex: 1,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    cursor: 'grab',
  },
  playerName: {
    color: THEME.textOnAccent,
    fontWeight: 500,
    textAlign: 'center',
    width: '100%',
    paddingLeft: 0,
    paddingRight: 0,
  },
  pendingBadge: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    color: THEME.textOnAccent,
    padding: '2px 6px',
    borderRadius: '4px',
    fontSize: '10.5px'
  },
  deleteButton: {
    backgroundColor: COLORS.delete,
    color: THEME.textOnAccent,
    border: 'none',
    borderRadius: '50%',
    width: '20px',
    height: '20px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  editModeActive: {
    backgroundColor: COLORS.delete,
    color: THEME.textOnAccent,
    borderColor: COLORS.delete
  },
  addPlayerSectionNew: {
    display: 'flex',
    gap: '10px',
    marginBottom: '10px',
    alignItems: 'center',
    marginTop: '8px',
  },
  addPlayerSectionModern: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    marginBottom: '12px',
    alignItems: 'stretch',
    marginTop: '8px',
  },
  genderRow: {
    display: 'flex',
    gap: '10px',
    width: '100%',
  },
  toggleButton: {
    padding: '10px 20px',
    backgroundColor: COLORS.add,
    color: THEME.textOnAccent,
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
  },
  backdrop: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: THEME.bgBackdrop,
    zIndex: 1000,
    transition: 'opacity 0.3s',
    pointerEvents: 'auto',
  },
  playerNumber: {
    minWidth: 28,
    flexShrink: 0,
    height: 32,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 600,
    fontSize: 15,
    color: THEME.textSecondary,
    background: THEME.bgSubtle,
    borderRadius: '6px',
    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
  },
  addPlayerSectionRow: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: '0',
    backgroundColor: THEME.bgPanel,
    borderRadius: '12px',
    padding: '10px',
    marginBottom: '12px',
    border: `1px solid ${COLORS.border}`,
  },
  genderButtonGroup: {
    display: 'flex',
    gap: '6px',
    flexShrink: 0,
  },
  inputGenderRow: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: '8px',
    width: '100%',
    marginBottom: 0,
    flexWrap: 'wrap',
  },
  addPlayerButton: {
    flex: '0 0 auto',
    padding: '10px 18px',
    backgroundColor: THEME.open,
    color: THEME.textOnAccent,
    border: 'none',
    borderRadius: '8px',
    fontWeight: 700,
    fontSize: '14px',
    cursor: 'pointer',
    boxShadow: THEME.shadowCta,
  },
  addPlayerButtonFull: {
    width: '100%',
    padding: '16px 0',
    backgroundColor: COLORS.add,
    color: THEME.textOnAccent,
    border: 'none',
    borderRadius: '8px',
    fontWeight: '600',
    fontSize: '16px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    boxShadow: '0 2px 8px rgba(46,204,113,0.15)',
  },
  iconEditButton: {
    background: 'none',
    border: 'none',
    color: COLORS.textSecondary,
    fontSize: '20px',
    cursor: 'pointer',
    padding: '2px 6px',
    borderRadius: '4px',
    transition: 'background 0.15s',
    outline: 'none',
  },
  iconEditButtonActive: {
    color: COLORS.delete,
    background: THEME.dangerTint,
  },
  doneButtonRow: {
    display: 'flex',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginBottom: 6,
  },
  doneButton: {
    background: COLORS.add,
    color: THEME.textOnAccent,
    border: 'none',
    borderRadius: '6px',
    fontWeight: 600,
    fontSize: '14px',
    padding: '8px 18px',
    cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(46,204,113,0.10)',
    transition: 'background 0.15s',
  },
  rosterHint: {
    margin: '0 0 10px 0',
    fontSize: '13px',
    lineHeight: 1.45,
    color: COLORS.textSecondary,
  },
  orderHeading: {
    margin: '0 0 10px 0',
    fontSize: '15px',
    fontWeight: 700,
    letterSpacing: '-0.02em',
    color: COLORS.text,
  },
  pendingExplainer: {
    marginBottom: '10px',
    padding: '8px 10px',
    borderRadius: '8px',
    backgroundColor: THEME.bgPanel,
    border: `1px solid ${COLORS.border}`,
    lineHeight: 1.4,
  },
}; 