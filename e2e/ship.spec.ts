import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import {
  OPPONENT,
  TEAM,
  OPEN_LINE,
  addPlayer,
  beginRoster,
  currentLine,
  goHome,
  openFresh,
  receivePull,
  scorePoint,
  scoreTile,
  startSidelineGame,
  useFourOpen,
} from './helpers';

test.beforeEach(async ({ page }) => {
  await openFresh(page);
});

test('keeps Start off until a team name is entered', async ({ page }) => {
  const start = page.getByRole('button', { name: 'Start', exact: true });
  const field = page.getByPlaceholder('Enter your team name');
  await expect(start).toBeDisabled();

  await field.fill('   ');
  await expect(start).toBeDisabled();

  await field.fill('river city');
  await expect(start).toBeEnabled();
  await expect(page.getByRole('heading', { name: 'StallParty' })).toBeVisible();
});

test('capitalizes a team name and remembers it until you remove it', async ({ page }) => {
  const field = page.getByPlaceholder('Enter your team name');
  await field.fill('river city');
  await expect(field).toHaveValue('River City');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Roster' })).toBeVisible();

  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'StallParty' })).toBeVisible();

  const recent = page.getByRole('button', { name: 'River City', exact: true });
  await recent.click();
  await expect(field).toHaveValue('River City');
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeEnabled();

  let message = '';
  page.once('dialog', (dialog) => {
    message = dialog.message();
    void dialog.accept();
  });
  await recent.click({ delay: 800 });
  expect(message).toContain('Remove River City');
  await expect(recent).toHaveCount(0);
});

test('lets you back out of kickoff and then start receiving', async ({ page }) => {
  await beginRoster(page);
  await addPlayer(page, 'open', 'Alex');
  await page.getByRole('button', { name: 'Set up this game' }).click();
  await page.getByRole('button', { name: 'Start game' }).click();

  const dialog = page.getByRole('dialog', { name: 'Who is receiving?' });
  await dialog.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Game setup' })).toBeVisible();
  await expect(scoreTile(page, 1)).toHaveCount(0);

  await receivePull(page);
  await expect(scoreTile(page, 1).locator('.score-num')).toHaveText('0');
  await expect(scoreTile(page, 2).locator('.score-num')).toHaveText('0');
  await expect(page.getByText('They pull', { exact: true })).toBeVisible();
});

test('records points, rotates the line, and undoes a mistake', async ({ page }) => {
  await startSidelineGame(page);

  await scorePoint(page, 1, '1');
  await expect(page.getByText('Point 2', { exact: true })).toBeVisible();
  await expect(page.getByText('We pull', { exact: true })).toBeVisible();
  await expect(currentLine(page)).toHaveText(['Eden', 'Fran', 'Alex', 'Blake']);

  await scorePoint(page, 2, '1');
  await expect(page.getByText('Point 3', { exact: true })).toBeVisible();
  await expect(page.getByText('They pull', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(scoreTile(page, 1).locator('.score-num')).toHaveText('1');
  await expect(scoreTile(page, 2).locator('.score-num')).toHaveText('0');
  await expect(page.getByText('Point 2', { exact: true })).toBeVisible();
  await expect(page.getByText('We pull', { exact: true })).toBeVisible();
  await expect(currentLine(page)).toHaveText(['Eden', 'Fran', 'Alex', 'Blake']);
});

test('marks halftime and who receives the next point', async ({ page }) => {
  await startSidelineGame(page);
  await scorePoint(page, 1, '1');
  await expect(page.getByText('We pull', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Halftime', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Who is receiving at half?' });
  await expect(dialog).toContainText(`${TEAM} received point 1.`);
  await dialog.getByRole('button', { name: TEAM, exact: true }).click();

  await expect(page.getByRole('button', { name: 'Halftime', exact: true })).toBeVisible();
  await expect(page.getByText('They pull', { exact: true })).toBeVisible();
  await expect(page.getByText('Point 2', { exact: true })).toBeVisible();
});

test('stops scoring once the score cap is reached', async ({ page }) => {
  await beginRoster(page);
  await addPlayer(page, 'open', 'Alex');
  await page.getByRole('button', { name: 'Set up this game' }).click();
  await page.getByRole('textbox', { name: 'Soft point cap' }).fill('1');
  await receivePull(page);
  await expect(page.getByText('Score to 1', { exact: true })).toBeVisible();

  await scoreTile(page, 1).click();
  const cap = page.getByRole('dialog', { name: 'End game?' });
  await expect(cap).toContainText('Score cap 1 is reached.');
  await cap.getByRole('button', { name: 'No', exact: true }).click();

  await expect(page.getByText('Score cap 1', { exact: true })).toBeVisible();
  await expect(scoreTile(page, 1)).toHaveAttribute('aria-disabled', 'true');
  await expect(scoreTile(page, 2)).toHaveAttribute('aria-disabled', 'true');
  await scoreTile(page, 1).click({ force: true });
  await scoreTile(page, 2).click({ force: true });
  await expect(scoreTile(page, 1).locator('.score-num')).toHaveText('1');
  await expect(scoreTile(page, 2).locator('.score-num')).toHaveText('0');
});

test('keeps an open game when you leave, and after a reload', async ({ page }) => {
  await startSidelineGame(page);
  await scorePoint(page, 1, '1');

  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('ultimate-active-game')))
    .toContain('"team1Score":1');

  await page.reload();
  await page.getByRole('button', { name: `Continue ${TEAM} vs ${OPPONENT}` }).click();
  await expect(scoreTile(page, 1).locator('.score-num')).toHaveText('1');
  await expect(page.getByText('Point 2', { exact: true })).toBeVisible();
  await expect(currentLine(page)).toHaveText(['Eden', 'Fran', 'Alex', 'Blake']);

  await goHome(page);
  await page.getByRole('button', { name: `Continue ${TEAM} vs ${OPPONENT}` }).click();
  await expect(scoreTile(page, 1).locator('.score-num')).toHaveText('1');
  await expect(scoreTile(page, 2).locator('.score-num')).toHaveText('0');
});

test('ends a game and keeps the summary in past games', async ({ page }) => {
  await startSidelineGame(page);
  await scorePoint(page, 1, '1');

  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'End game', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: 'End game' });
  await expect(confirm).toContainText('Save this game and open the summary.');
  await confirm.getByRole('button', { name: 'End game', exact: true }).click();

  await expect(page.getByRole('heading', { name: `${TEAM} vs ${OPPONENT}` })).toBeVisible();
  await expect(page.locator('.summary-num').nth(0)).toHaveText('1');
  await expect(page.locator('.summary-num').nth(1)).toHaveText('0');
  await expect(page.getByText('Holds', { exact: true })).toBeVisible();
  await expect(page.getByText('Breaks', { exact: true })).toBeVisible();

  const share = page.getByRole('button', { name: 'Share summary' });
  const stats = page.getByRole('button', { name: 'Download stats' });
  const shareBox = await share.boundingBox();
  const statsBox = await stats.boundingBox();
  expect(shareBox).toBeTruthy();
  expect(statsBox).toBeTruthy();
  expect(Math.abs(shareBox!.y - statsBox!.y)).toBeLessThan(4);
  expect(statsBox!.x).toBeGreaterThan(shareBox!.x + shareBox!.width - 4);

  const downloadPromise = page.waitForEvent('download');
  await stats.click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(new RegExp(`${TEAM}-vs-${OPPONENT}\\.txt$`));
  const report = await readFile((await download.path())!, 'utf8');
  expect(report).toContain(`${TEAM} 1 – 0 ${OPPONENT}`);
  expect(report).toContain(`Point 1: ${TEAM}`);

  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await expect(page.getByRole('button', { name: `Continue ${TEAM} vs ${OPPONENT}` })).toHaveCount(0);
  await page.getByRole('button', { name: 'Past games' }).click();
  const saved = page.getByRole('button', { name: new RegExp(`${TEAM} vs ${OPPONENT}`) });
  await expect(saved).toContainText('1–0');
  await expect(saved).not.toContainText('Continue');
  await saved.click();
  await expect(page.getByRole('heading', { name: `${TEAM} vs ${OPPONENT}` })).toBeVisible();
  await page.getByRole('button', { name: '← Back', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Past games' })).toBeVisible();
});

test('imports a roster and exports it again', async ({ page }) => {
  await beginRoster(page);
  await page.getByRole('button', { name: 'Import roster' }).click();

  const box = page.getByPlaceholder(/Alex, O/);
  await box.fill('not a player');
  await page.getByRole('button', { name: 'Add to roster' }).click();
  await expect(page.getByText('Line 1: set gender for not a player (O/Open or W/Women)')).toBeVisible();

  await box.fill('Alex, O, 7, handler\nSam, W');
  await page.getByRole('button', { name: 'Add to roster' }).click();
  await expect(page.getByText('Added 2. 0 already on the roster.')).toBeVisible();
  await expect(page.getByText('Alex', { exact: true })).toBeVisible();
  await expect(page.getByText('Sam', { exact: true })).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('roster.csv');
  const csv = await readFile((await download.path())!, 'utf8');
  expect(csv).toContain('Alex');
  expect(csv).toContain('Sam');
});

test('renames the opponent, offers a spectator code, and downloads the stats', async ({ page }) => {
  await startSidelineGame(page);
  await scorePoint(page, 1, '1');

  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Opponents QR code' })).toBeVisible();
  await page.getByRole('button', { name: 'Team', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Team QR code' })).toBeVisible();

  await page.getByPlaceholder('Opponent').fill('Southside');
  await page.getByRole('button', { name: 'Save Changes' }).click();
  await expect(scoreTile(page, 2)).toContainText('Southside');

  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download stats' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/Northside-vs-Southside\.txt$/);
  const report = await readFile((await download.path())!, 'utf8');
  expect(report).toContain('Northside 1 – 0 Southside');
  expect(report).toContain('Point 1: Northside');
  expect(report).toContain('Alex');
});

test('substitutes a bench player and can take someone out for the day', async ({ page }) => {
  await startSidelineGame(page);

  await page.getByRole('button', { name: 'Substitute Alex' }).click();
  const sub = page.getByRole('dialog', { name: 'Sub for Alex' });
  await sub.getByRole('button', { name: 'Eden', exact: true }).click();
  await expect(currentLine(page)).toHaveText(['Eden', 'Blake', 'Casey', 'Drew']);

  await page.getByRole('button', { name: 'Substitute Blake' }).click();
  const out = page.getByRole('dialog', { name: 'Sub for Blake' });
  await out.getByRole('button', { name: 'Out for the day' }).click();
  await out.getByRole('button', { name: 'Remove Blake' }).click();
  await expect(page.locator('.line-section--current')).not.toContainText('Blake');
  await expect(currentLine(page)).toHaveCount(4);
});

test('holds a late arrival off the current point', async ({ page }) => {
  await beginRoster(page);
  await addPlayer(page, 'open', 'Alex');
  await addPlayer(page, 'open', 'Blake');
  await useFourOpen(page);
  await receivePull(page);
  await expect(currentLine(page)).toHaveText(['Alex', 'Blake', 'Empty · Open', 'Empty · Open']);

  await page.getByRole('button', { name: 'Roster', exact: true }).click();
  await addPlayer(page, 'open', 'Eden');
  await expect(page.getByText('Pending', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Scoreboard', exact: true }).click();

  await expect(page.getByRole('button', { name: /Roster/ })).toContainText('1');
  await expect(page.locator('.line-section--current')).toContainText('Alex');
  await expect(page.locator('.line-section--current')).toContainText('Blake');
  await expect(page.locator('.line-section--current')).not.toContainText('Eden');
});

test('tags who scored and who threw our goal', async ({ page }) => {
  await startSidelineGame(page);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Tag our goals as we go' }).click();
  await page.getByRole('button', { name: 'Close settings', exact: true }).click();

  await scorePoint(page, 1, '1');
  const tag = page.getByRole('group', { name: 'Tag point 1' });
  await expect(tag).toContainText('Who scored?');
  await tag.getByRole('button', { name: 'Alex', exact: true }).click();
  await expect(tag).toContainText('Who threw it?');
  await expect(tag.getByRole('button', { name: 'Alex', exact: true })).toHaveCount(0);
  await tag.getByRole('button', { name: 'Blake', exact: true }).click();
  await expect(tag).toContainText('Tagged');
  await expect(tag.locator('.goal-tag-name')).toHaveText(['Alex Score', 'Blake Throw']);
  await expect(tag.getByRole('button', { name: 'Casey', exact: true })).toHaveCount(0);
  await tag.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(tag).toBeHidden();
});

test('keeps the light theme after a reload', async ({ page }) => {
  await beginRoster(page);
  await addPlayer(page, 'open', 'Alex');
  await page.getByRole('button', { name: 'Set up this game' }).click();
  await receivePull(page);
  await page.getByRole('button', { name: 'Switch to light' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('ultimate-active-game')))
    .toContain('"gameStarted":true');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: `Continue ${TEAM} vs ${OPPONENT}` }).click();
  await expect(page.getByRole('button', { name: 'Switch to dark' })).toBeVisible();
});
