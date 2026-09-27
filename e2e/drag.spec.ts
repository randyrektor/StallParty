import { expect, test } from '@playwright/test';
import {
  addPlayer,
  beginRoster,
  currentLine,
  dragRosterPlayer,
  openFresh,
  receivePull,
  rosterNames,
  useFourOpen,
} from './helpers';

test.beforeEach(async ({ page }) => {
  await openFresh(page);
});

test('dragging a player reorders the line', async ({ page }) => {
  await beginRoster(page);
  for (const name of ['Alex', 'Blake', 'Casey', 'Drew']) await addPlayer(page, 'open', name);
  await addPlayer(page, 'women', 'Sam');

  await dragRosterPlayer(page, 'Drew', 'Alex');
  await expect(rosterNames(page)).toHaveText(['Drew', 'Alex', 'Blake', 'Casey']);
  await expect(page.getByRole('button', { name: 'Edit Sam', exact: true })).toBeVisible();

  await useFourOpen(page);
  await receivePull(page);
  await expect(currentLine(page)).toHaveText(['Drew', 'Alex', 'Blake', 'Casey']);

  await page.getByRole('button', { name: 'Roster', exact: true }).click();
  await dragRosterPlayer(page, 'Casey', 'Drew');
  await expect(rosterNames(page)).toHaveText(['Casey', 'Drew', 'Alex', 'Blake']);
  await page.getByRole('button', { name: 'Scoreboard', exact: true }).click();
  await expect(currentLine(page)).toHaveText(['Casey', 'Drew', 'Alex', 'Blake']);
});
