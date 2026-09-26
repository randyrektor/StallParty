import { describe, expect, it } from 'vitest';
import { readViewportBox } from './viewportHeight';

describe('readViewportBox', () => {
  it('fills the screen when the visible height already matches', () => {
    expect(readViewportBox({ height: 844, offsetTop: 0 }, 844, 844, false)).toEqual({
      height: 844,
      offsetTop: 0,
    });
  });

  it('fills a short second launch instead of leaving a gap under the app', () => {
    expect(readViewportBox({ height: 744, offsetTop: 0 }, 744, 844, false)).toEqual({
      height: 844,
      offsetTop: 0,
    });
  });

  it('follows the visible area while the keyboard has the screen panned', () => {
    expect(readViewportBox({ height: 430, offsetTop: 210 }, 844, 844, true)).toEqual({
      height: 430,
      offsetTop: 210,
    });
  });

  it('follows a restored pan even when nobody is typing', () => {
    expect(readViewportBox({ height: 744, offsetTop: 100 }, 844, 844, false)).toEqual({
      height: 744,
      offsetTop: 100,
    });
  });

  it('fills the screen again after the keyboard closes on a stuck short height', () => {
    expect(readViewportBox({ height: 500, offsetTop: 0 }, 500, 844, false)).toEqual({
      height: 844,
      offsetTop: 0,
    });
  });

  it('falls back to the window height when the visible viewport is missing', () => {
    expect(readViewportBox(null, 800, 0, false)).toEqual({
      height: 800,
      offsetTop: 0,
    });
  });
});
