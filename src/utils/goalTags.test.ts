import { describe, expect, it } from 'vitest';
import { applyGoalTag } from './goalTags';

describe('applyGoalTag', () => {
  it('sets the scorer, then the thrower', () => {
    const scored = applyGoalTag({}, 'haley');
    expect(scored).toEqual({ scorerId: 'haley' });
    expect(applyGoalTag(scored, 'sam')).toEqual({ scorerId: 'haley', throwerId: 'sam' });
  });

  it('clears both when the scorer is tapped again', () => {
    expect(applyGoalTag({ scorerId: 'haley', throwerId: 'sam' }, 'haley')).toEqual({});
  });

  it('clears only the thrower when that name is tapped again', () => {
    expect(applyGoalTag({ scorerId: 'haley', throwerId: 'sam' }, 'sam')).toEqual({
      scorerId: 'haley',
    });
  });

  it('replaces the thrower when a third name is tapped', () => {
    expect(applyGoalTag({ scorerId: 'haley', throwerId: 'sam' }, 'rio')).toEqual({
      scorerId: 'haley',
      throwerId: 'rio',
    });
  });
});
