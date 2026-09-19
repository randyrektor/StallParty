import React from 'react';
import {
  formatGameClockInput,
  parseGameClockTime,
  type GameClockTime,
} from '../utils/gameClock';

export function GameClockInput({
  value,
  onChange,
  id,
  ariaLabel,
}: {
  value: GameClockTime;
  onChange: (time: GameClockTime) => void;
  id?: string;
  ariaLabel: string;
}) {
  return (
    <div className="game-clock-field">
      <input
        id={id}
        className="game-clock-input"
        type="time"
        aria-label={ariaLabel}
        value={formatGameClockInput(value)}
        onChange={(e) => onChange(parseGameClockTime(e.target.value))}
      />
    </div>
  );
}
