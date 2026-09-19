import { describe, expect, it } from 'vitest';
import { capitalizeNameInput } from './capitalizeName';

describe('capitalizeNameInput', () => {
  it('capitalizes the first letter', () => {
    expect(capitalizeNameInput('alex')).toBe('Alex');
  });

  it('capitalizes each word', () => {
    expect(capitalizeNameInput('mary jane')).toBe('Mary Jane');
  });

  it('capitalizes after hyphen or apostrophe', () => {
    expect(capitalizeNameInput("o'brien")).toBe("O'Brien");
    expect(capitalizeNameInput('anne-marie')).toBe('Anne-Marie');
  });

  it('leaves already-capitalized letters alone', () => {
    expect(capitalizeNameInput('McDonald')).toBe('McDonald');
    expect(capitalizeNameInput('ALEX')).toBe('ALEX');
  });
});
