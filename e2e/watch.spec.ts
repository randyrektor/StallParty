import { expect, test, type Browser, type Page } from '@playwright/test';
import { openFresh, scorePoint, scoreTile, startSidelineGame } from './helpers';

async function watchRoom(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const raw = localStorage.getItem('ultimate-active-game');
        if (!raw) return '';
        const session = JSON.parse(raw) as { watchRoomId?: string; watchViewKey?: string };
        return session.watchRoomId && session.watchViewKey
          ? `${session.watchRoomId}|${session.watchViewKey}`
          : '';
      })
    )
    .not.toBe('');
  return page.evaluate(() => {
    const session = JSON.parse(localStorage.getItem('ultimate-active-game')!) as {
      watchRoomId: string;
      watchViewKey: string;
    };
    return { roomId: session.watchRoomId, viewKey: session.watchViewKey };
  });
}

async function phone(browser: Browser) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  return { context, page };
}

test('a second phone follows the live score, and only teammates see the line', async ({ page, browser }) => {
  await openFresh(page);
  await startSidelineGame(page);
  await scorePoint(page, 1, '1');
  const { roomId, viewKey } = await watchRoom(page);

  const opponent = await phone(browser);
  const teammate = await phone(browser);
  const stranger = await phone(browser);
  try {
    await opponent.page.goto(`/#watch/${roomId}`);
    await teammate.page.goto(`/#watch/${roomId}.t.${viewKey}`);
    await stranger.page.goto(`/#watch/${roomId}.t.not-the-key`);

    await expect(opponent.page.getByText('Live', { exact: true })).toBeVisible();
    await expect(opponent.page.getByText('Score updates from the sideline.')).toBeVisible();
    await expect(opponent.page.locator('.score-num').nth(0)).toHaveText('1');
    await expect(opponent.page.locator('.score-num').nth(1)).toHaveText('0');
    await expect(opponent.page.getByText('Point 2', { exact: true })).toBeVisible();
    await expect(opponent.page.getByRole('group', { name: 'This point: 4 open, 0 women' })).toBeVisible();
    await expect(opponent.page.locator('.spectator-name')).toHaveCount(0);

    await expect(teammate.page.getByText('Score and line update from the sideline.')).toBeVisible();
    await expect(teammate.page.locator('.spectator-line--this')).toContainText('Eden');
    await expect(teammate.page.locator('.spectator-line--this')).toContainText('Fran');
    await expect(teammate.page.locator('.spectator-name')).not.toHaveCount(0);

    await expect(stranger.page.locator('.score-num').nth(0)).toHaveText('1');
    await expect(stranger.page.locator('.spectator-name')).toHaveCount(0);

    await scorePoint(page, 1, '2');
    await expect(opponent.page.locator('.score-num').nth(0)).toHaveText('2');
    await expect(teammate.page.locator('.score-num').nth(0)).toHaveText('2');
    await expect(teammate.page.getByText('Point 3', { exact: true })).toBeVisible();
    await expect(scoreTile(page, 1).locator('.score-num')).toHaveText('2');
  } finally {
    await opponent.context.close();
    await teammate.context.close();
    await stranger.context.close();
  }
});
