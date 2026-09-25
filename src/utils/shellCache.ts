/** Same-origin URLs worth keeping so a refresh still opens the board offline. */
export function shellUrlsFrom(names: string[], origin: string): string[] {
  const urls = new Set<string>();
  for (const name of names) {
    let url: URL;
    try {
      url = new URL(name, origin);
    } catch {
      continue;
    }
    if (url.origin !== origin) continue;
    if (url.pathname === '/watch-ws' || url.pathname === '/sw.js') continue;
    urls.add(url.href);
  }
  urls.add(new URL('/', origin).href);
  return Array.from(urls);
}
