import { describe, expect, it } from 'vitest';
import { shellUrlsFrom } from './shellCache';

describe('shellUrlsFrom', () => {
  const origin = 'https://stall.party';

  it('keeps the app shell and drops the live watch socket', () => {
    const urls = shellUrlsFrom(
      [
        'https://stall.party/assets/index-abc.js',
        'https://stall.party/assets/index-abc.css',
        'https://stall.party/watch-ws?room=abc',
        'https://stall.party/sw.js',
        'https://example.com/tracker.js',
      ],
      origin
    );
    expect(urls).toContain('https://stall.party/');
    expect(urls).toContain('https://stall.party/assets/index-abc.js');
    expect(urls).toContain('https://stall.party/assets/index-abc.css');
    expect(urls.some((url) => url.includes('watch-ws'))).toBe(false);
    expect(urls.some((url) => url.endsWith('/sw.js'))).toBe(false);
    expect(urls.some((url) => url.includes('example.com'))).toBe(false);
  });
});
