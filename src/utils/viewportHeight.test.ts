import { describe, expect, it } from 'vitest';
import { readViewportHeight } from './viewportHeight';

describe('readViewportHeight', () => {
  it('uses the visible viewport when the browser reports one', () => {
    expect(readViewportHeight({ innerHeight: 900, visualViewport: { height: 844 } as VisualViewport })).toBe(844);
  });

  it('falls back to the window height when the visible viewport is missing', () => {
    expect(readViewportHeight({ innerHeight: 800, visualViewport: null })).toBe(800);
  });
});
