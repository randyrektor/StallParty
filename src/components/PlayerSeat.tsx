import React, { forwardRef } from 'react';
import { Player, PLAYER_POSITION_SHORT, type PlayerPosition } from '../types';

interface PlayerSeatProps extends React.HTMLAttributes<HTMLDivElement> {
  gender: 'O' | 'W';
  name?: string;
  empty?: boolean;
  tone?: 'current' | 'next';
  pending?: boolean;
  jersey?: number;
  position?: PlayerPosition;
  jerseySlot?: React.ReactNode;
  positionSlot?: React.ReactNode;
  statusSlot?: React.ReactNode;
  nameSlot?: React.ReactNode;
}

export const PlayerSeat = forwardRef<HTMLDivElement, PlayerSeatProps>(function PlayerSeat(
  {
    gender,
    name,
    empty = false,
    tone = 'current',
    pending = false,
    jersey,
    position,
    jerseySlot,
    positionSlot,
    statusSlot,
    nameSlot,
    className = '',
    style,
    children,
    ...rest
  },
  ref
) {
  const genderLabel = gender === 'O' ? 'Open' : 'Women';
  const classes = [
    'player-seat',
    gender === 'O' ? 'player-seat--open' : 'player-seat--women',
    empty ? 'player-seat--empty' : '',
    tone === 'next' ? 'player-seat--next' : '',
    pending ? 'player-seat--pending' : '',
    className,
  ].filter(Boolean).join(' ');

  const jerseyNode =
    jerseySlot ??
    (jersey != null ? <span className="player-seat-jersey">{jersey}</span> : null);
  const positionNode =
    positionSlot ??
    (position ? <span className="player-seat-pos">{PLAYER_POSITION_SHORT[position]}</span> : null);

  return (
    <div
      ref={ref}
      className={classes}
      style={style}
      aria-label={empty ? `Empty ${genderLabel} seat` : name}
      {...rest}
    >
      {nameSlot ?? (
        <span className="player-seat-name">
          {empty ? `Empty · ${genderLabel}` : name}
        </span>
      )}
      {statusSlot}
      {(jerseyNode || positionNode) && (
        <span className="player-seat-meta">
          {jerseyNode}
          {positionNode}
        </span>
      )}
      {children}
    </div>
  );
});

export function seatFromPlayer(
  player: Player,
  extras?: Pick<PlayerSeatProps, 'tone' | 'pending'>
): PlayerSeatProps {
  return {
    gender: player.gender,
    name: player.name,
    jersey: player.jersey,
    position: player.position,
    ...extras,
  };
}
