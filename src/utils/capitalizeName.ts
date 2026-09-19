/** Capitalize the first letter of each word as names are typed. */
export function capitalizeNameInput(value: string): string {
  return value.replace(/(^|[\s'-])(\p{L})/gu, (_, sep: string, letter: string) => sep + letter.toLocaleUpperCase());
}
