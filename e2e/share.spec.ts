import { expect, test, type Page } from '@playwright/test';
import { openFresh, scorePoint, startSidelineGame } from './helpers';

type SharedFile = { name: string; type: string; size: number; png: boolean };
type ShareCall = { title?: string; text?: string; url?: string; files?: SharedFile[] };

async function installShareMock(page: Page) {
  await page.addInitScript(() => {
    const host = window as Window & {
      __shares: ShareCall[];
      __shareMode: 'ok' | 'abort' | 'fail';
      __shareMocked: boolean;
    };
    host.__shares = [];
    host.__shareMode = 'ok';
    const share = async (data: ShareData) => {
      if (host.__shareMode === 'abort') throw new DOMException('cancelled', 'AbortError');
      if (host.__shareMode === 'fail') throw new Error('share unavailable');
      const files: SharedFile[] = [];
      for (const file of data.files ?? []) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        files.push({
          name: file.name,
          type: file.type,
          size: file.size,
          png: bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47,
        });
      }
      host.__shares.push({ title: data.title, text: data.text, url: data.url, files });
    };
    const define = (key: 'share' | 'canShare', value: unknown) => {
      try {
        Object.defineProperty(navigator, key, { configurable: true, writable: true, value });
      } catch {
        (navigator as unknown as Record<string, unknown>)[key] = value;
      }
    };
    define('share', share);
    define('canShare', () => true);
    host.__shareMocked = navigator.share === share;
  });
}

function shares(page: Page) {
  return page.evaluate(() => (window as Window & { __shares: ShareCall[] }).__shares);
}

test.beforeEach(async ({ page }) => {
  await installShareMock(page);
  await openFresh(page);
  await expect.poll(() => page.evaluate(() => (window as Window & { __shareMocked: boolean }).__shareMocked)).toBe(true);
});

test('shares the score image, the summary, and both spectator links', async ({ page }) => {
  await startSidelineGame(page);
  await scorePoint(page, 1, '1');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();

  await page.getByRole('button', { name: 'Share opponents link' }).click();
  await expect.poll(() => shares(page)).toHaveLength(1);
  const opponents = (await shares(page))[0]!;
  expect(opponents.url).toMatch(/#watch\/[A-Z0-9]{6}$/);
  expect(opponents.text).toBe('Live score on StallParty');
  expect(opponents.files ?? []).toHaveLength(0);

  await page.getByRole('button', { name: 'Team', exact: true }).click();
  await page.getByRole('button', { name: 'Share team link' }).click();
  const team = (await shares(page))[1]!;
  expect(team.url).toMatch(/#watch\/[A-Z0-9]{6}\.t\./);
  expect(team.text).toBe('Line and score on StallParty');

  await page.getByRole('button', { name: 'Share score' }).click();
  await expect.poll(() => shares(page).then((calls) => calls.length)).toBe(3);
  const score = (await shares(page))[2]!;
  expect(score.title).toBe('Northside 1–0 Away');
  expect(score.files).toEqual([
    expect.objectContaining({
      name: 'stallparty-northside-1-0-away.png',
      type: 'image/png',
      png: true,
    }),
  ]);
  expect(score.files![0]!.size).toBeGreaterThan(1000);

  await page.getByRole('button', { name: 'Close settings', exact: true }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'End game', exact: true }).click();
  await page.getByRole('dialog', { name: 'End game' }).getByRole('button', { name: 'End game', exact: true }).click();
  await page.getByRole('button', { name: 'Share summary' }).click();
  await expect.poll(() => shares(page).then((calls) => calls.length)).toBe(4);
  const summary = (await shares(page))[3]!;
  expect(summary.text).toContain('Northside 1–0 Away');
  expect(summary.text).toContain('Holds 1');
  expect(summary.files?.[0]).toMatchObject({ type: 'image/png', png: true });
});

test('a cancelled share stays on the page, and a failed share downloads the image', async ({ page }) => {
  await startSidelineGame(page);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.evaluate(() => {
    (window as Window & { __shareMode: string }).__shareMode = 'abort';
  });

  const cancelled = page.waitForEvent('download', { timeout: 1000 }).then(
    () => true,
    () => false
  );
  await page.getByRole('button', { name: 'Share score' }).click();
  await expect(page.getByRole('button', { name: 'Share score' })).toBeVisible();
  expect(await shares(page)).toHaveLength(0);
  expect(await cancelled).toBe(false);

  await page.evaluate(() => {
    (window as Window & { __shareMode: string }).__shareMode = 'fail';
  });
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Share score' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('stallparty-northside-0-0-away.png');
  expect(await shares(page)).toHaveLength(0);
});
