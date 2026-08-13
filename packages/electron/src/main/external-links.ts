// What the window is allowed to do with a navigation the renderer asks for.
// 'in-app' proceeds, 'external' is handed to the OS browser, 'blocked' does
// nothing at all.
export type NavigationVerdict = 'in-app' | 'external' | 'blocked';

function withoutHash(url: URL): string {
  const copy = new URL(url.href);
  copy.hash = '';
  return copy.href;
}

// Same document means the same document, not merely the same origin: under the
// dev server an origin check would let any path Vite serves top-navigate the
// window away from the board. Only the fragment may differ, which is what keeps
// in-page anchors in a doc working.
function isSameDocument(target: URL, appDocument: URL): boolean {
  return withoutHash(target) === withoutHash(appDocument);
}

// `appDocument` is where the renderer itself was loaded from: the dev server URL
// under `pnpm dev`, the bundled index.html in a packaged run. Anything that is
// not that document and not http(s) is refused — an allowlist, so a scheme
// nobody anticipated is inert rather than handed to the operating system.
export function classifyNavigation(target: string, appDocument: string): NavigationVerdict {
  let url: URL;
  let base: URL;
  try {
    url = new URL(target);
    base = new URL(appDocument);
  } catch {
    return 'blocked';
  }
  if (isSameDocument(url, base)) return 'in-app';
  return url.protocol === 'http:' || url.protocol === 'https:' ? 'external' : 'blocked';
}
