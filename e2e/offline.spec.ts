import { expect, test, type Page } from '@playwright/test';
import { openFresh, scorePoint, scoreTile, startSidelineGame, TEAM, OPPONENT } from './helpers';

test.use({ baseURL: 'http://127.0.0.1:4174' });

async function waitForOfflineShell(page: Page) {
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          if (!('serviceWorker' in navigator)) return 'no-sw';
          const ready = await navigator.serviceWorker.ready;
          if (!ready.active) return 'no-active';
          if (!navigator.serviceWorker.controller) return 'no-controller';
          const cache = await caches.open('stallparty-shell-v1');
          const paths = (await cache.keys()).map((request) => new URL(request.url).pathname);
          const readyShell = paths.includes('/') && paths.some((path) => path.startsWith('/assets/'));
          return readyShell ? 'ready' : `cached:${paths.join(',')}`;
        }),
      { timeout: 20_000 }
    )
    .toBe('ready');
}

test('the board still opens and the score survives with no connection', async ({ page }) => {
  await openFresh(page);
  await startSidelineGame(page);
  await scorePoint(page, 1, '1');
  await waitForOfflineShell(page);

  await page.context().setOffline(true);
  await scorePoint(page, 1, '2');
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('ultimate-active-game')))
    .toContain('"team1Score":2');

  await page.reload();
  await page.getByRole('button', { name: `Continue ${TEAM} 2–0 ${OPPONENT}` }).click();
  await expect(scoreTile(page, 1).locator('.score-num')).toHaveText('2');
  await expect(page.getByText('Point 3', { exact: true })).toBeVisible();

  const secondPhone = await page.context().newPage();
  await secondPhone.goto('/');
  await expect(secondPhone.getByRole('heading', { name: 'StallParty' })).toBeVisible();
});
