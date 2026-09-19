import type { SplitCycle } from '../types';

const ABBA = ['A', 'B', 'B', 'A'] as const;
const AAB = ['A', 'A', 'B'] as const;

export function GenderCyclePills({
  splitCycle,
  lineIndex,
}: {
  splitCycle: SplitCycle;
  lineIndex: number;
}) {
  if (splitCycle !== 'ABBA' && splitCycle !== 'AAB') return null;
  const letters = splitCycle === 'AAB' ? AAB : ABBA;
  const len = letters.length;
  const active = ((lineIndex % len) + len) % len;
  return (
    <div className="line-info-pattern">
      <div className="line-setup-pills pattern-display" role="group" aria-label="Gender cycle">
        {letters.map((letter, i) => (
          <span
            key={i}
            className={`line-setup-pill pattern-item${active === i ? ' is-active' : ''}`}
          >
            {letter}
          </span>
        ))}
      </div>
    </div>
  );
}
