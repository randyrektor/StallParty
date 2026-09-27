import { expect, type Page } from '@playwright/test';

export const TEAM = 'Northside';
export const OPPONENT = 'Away';
export const OPEN_LINE = ['Alex', 'Blake', 'Casey', 'Drew', 'Eden', 'Fran'] as const;

export async function openFresh(page: Page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByRole('heading', { name: 'StallParty' })).toBeVisible();
}

export async function addPlayer(page: Page, gender: 'open' | 'women', name: string) {
  const field = page.getByRole('textbox', { name: `Add ${gender} player` });
  await field.fill(name);
  await page.getByRole('button', { name: `Add ${name}`, exact: true }).click();
  await expect(field).toHaveValue('');
}

export async function beginRoster(page: Page, team = TEAM) {
  await page.getByPlaceholder('Enter your team name').fill(team);
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Roster' })).toBeVisible();
}

/** Four players on the field, all open, so the rotation is easy to see. */
export async function useFourOpen(page: Page) {
  await page.getByRole('button', { name: 'Set up this game' }).click();
  await expect(page.getByRole('heading', { name: 'Game setup' })).toBeVisible();
  await page.locator('.line-setup').getByRole('button', { name: '4', exact: true }).click();
  await expect(page.locator('.line-setup-ratio')).toHaveText('4:0');
}

export async function receivePull(page: Page, team = TEAM) {
  await page.getByRole('button', { name: 'Start game' }).click();
  const dialog = page.getByRole('dialog', { name: 'Who is receiving?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: team, exact: true }).click();
  await expect(dialog).toBeHidden();
}

export function scoreTile(page: Page, side: 1 | 2) {
  return page.locator(`[data-team="team${side}"]`);
}

export function currentLine(page: Page) {
  return page.locator('.line-section--current .player-seat-name');
}

export async function startSidelineGame(page: Page) {
  await beginRoster(page);
  for (const name of OPEN_LINE) await addPlayer(page, 'open', name);
  await useFourOpen(page);
  await receivePull(page);
  await expect(page.getByText('Point 1', { exact: true })).toBeVisible();
  await expect(page.getByText('They pull', { exact: true })).toBeVisible();
  await expect(currentLine(page)).toHaveText([...OPEN_LINE.slice(0, 4)]);
}

export async function scorePoint(page: Page, side: 1 | 2, expected: string) {
  await scoreTile(page, side).click();
  await expect(scoreTile(page, side).locator('.score-num')).toHaveText(expected);
}

export function openColumn(page: Page) {
  return page.getByRole('heading', { name: 'Open', exact: true }).locator('xpath=..');
}

export function rosterNames(page: Page) {
  return openColumn(page).getByRole('button', { name: /^Edit / });
}

/** Drag one roster row onto another. Order is the rotation, top to bottom. */
export async function dragRosterPlayer(page: Page, from: string, to: string) {
  const source = openColumn(page).getByRole('button', { name: `Edit ${from}`, exact: true });
  const target = openColumn(page).getByRole('button', { name: `Edit ${to}`, exact: true });
  await source.scrollIntoViewIfNeeded();
  await target.scrollIntoViewIfNeeded();
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  if (!sourceBox || !targetBox) throw new Error(`Could not find ${from} or ${to} to drag`);
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, {
    steps: 24,
  });
  await page.mouse.up();
  // dnd-kit swallows the next click for 50ms after a drop.
  await page.evaluate(() => new Promise((resolve) => window.setTimeout(resolve, 80)));
}

export async function goHome(page: Page) {
  // confirm() blocks the click until the dialog is accepted.
  let message = '';
  page.once('dialog', (dialog) => {
    message = dialog.message();
    void dialog.accept();
  });
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  expect(message).toContain('This game stays open until you end it.');
  await expect(page.getByRole('heading', { name: 'StallParty' })).toBeVisible();
}
