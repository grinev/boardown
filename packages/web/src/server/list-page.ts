import type { BoardListRow } from './board-list.js';

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// Plain HTML with inline styles rather than a second client bundle: the page is
// a list of links with no state, and giving it a build would make an app out of
// it. It follows the reader's colour scheme instead of the board's theme, which
// lives in a board's own config and so cannot speak for several of them.
const STYLES = `
:root { color-scheme: light dark; }
body {
  margin: 0; padding: 48px 24px;
  font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif;
  display: flex; flex-direction: column; align-items: center;
}
main { width: 100%; max-width: 640px; }
h1 { font-size: 20px; font-weight: 600; margin: 0 0 24px; }
ul { list-style: none; margin: 0; padding: 0; }
li + li { margin-top: 8px; }
a {
  display: block; padding: 12px 16px; border: 1px solid; border-radius: 8px;
  border-color: color-mix(in srgb, currentColor 25%, transparent);
  text-decoration: none; color: inherit;
}
a:hover { border-color: color-mix(in srgb, currentColor 55%, transparent); }
.name { font-weight: 600; }
.meta { font-size: 13px; opacity: 0.65; margin-top: 2px; word-break: break-all; }
.reason { font-size: 13px; opacity: 0.65; margin-top: 2px; }
.note { font-size: 13px; opacity: 0.65; margin: 0 0 24px; }
`;

const renderRow = (row: BoardListRow): string => {
  const title = row.name ?? row.id;
  const detail =
    row.reason === null
      ? `<div class="meta">${escapeHtml(row.id)} · ${escapeHtml(row.projectRoot)}</div>`
      : `<div class="meta">${escapeHtml(row.projectRoot)}</div>` +
        `<div class="reason">${escapeHtml(row.reason)}</div>`;
  return (
    `<li><a href="/b/${encodeURIComponent(row.id)}/">` +
    `<div class="name">${escapeHtml(title)}</div>${detail}</a></li>`
  );
};

// A failed re-read with rows behind it is a stale mapping; with no rows there is
// nothing to be stale, so the page says only that the file could not be read —
// promising the last version that loaded when none ever did would be a lie the
// default registry reaches on its first bad edit.
export const renderListPage = (rows: readonly BoardListRow[], staleReason: string | null): string => {
  const note =
    staleReason === null
      ? ''
      : `<p class="note">The registry file could not be read (${escapeHtml(staleReason)}).` +
        `${rows.length === 0 ? '' : ' Showing the last version that loaded.'}</p>`;
  const body =
    rows.length === 0
      ? staleReason === null
        ? '<p class="note">The registry lists no projects.</p>'
        : ''
      : `<ul>${rows.map(renderRow).join('')}</ul>`;
  return (
    '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
    // The same file the boards use; it is served from the client bundle, which
    // sits next to this server whatever mode it runs in.
    '<link rel="icon" type="image/svg+xml" href="/favicon.svg">' +
    `<title>boardown</title><style>${STYLES}</style></head>` +
    `<body><main><h1>boardown</h1>${note}${body}</main></body></html>`
  );
};
