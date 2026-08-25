import type { BoardListRow } from './board-list.js';

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// Plain HTML with inline styles rather than a second client bundle: the page is
// a list of links and one form, and giving it a build would make an app out of
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
h2 { font-size: 15px; font-weight: 600; margin: 0 0 12px; }
ul { list-style: none; margin: 0; padding: 0; }
li { position: relative; }
li + li { margin-top: 8px; }
/* The right padding is the room the Remove control sits in; everything else
   about the card is what it was before that control existed. */
a {
  display: block; padding: 12px 96px 12px 16px; border: 1px solid; border-radius: 8px;
  border-color: color-mix(in srgb, currentColor 25%, transparent);
  text-decoration: none; color: inherit;
}
a:hover { border-color: color-mix(in srgb, currentColor 55%, transparent); }
.name { font-weight: 600; }
.meta { font-size: 13px; opacity: 0.65; margin-top: 2px; word-break: break-all; }
.reason { font-size: 13px; opacity: 0.65; margin-top: 2px; }
.note { font-size: 13px; opacity: 0.65; margin: 0 0 24px; }
.remove {
  position: absolute; top: 10px; right: 12px;
  font: inherit; font-size: 13px; padding: 3px 10px;
  background: none; color: inherit; cursor: pointer;
  border: 1px solid color-mix(in srgb, currentColor 25%, transparent); border-radius: 6px;
}
.remove:hover { border-color: color-mix(in srgb, currentColor 55%, transparent); }
.error { font-size: 13px; margin-top: 4px; color: color-mix(in srgb, currentColor 40%, #e5484d); }
.error:empty { display: none; }
.add { margin-top: 32px; }
.add label { display: block; font-size: 13px; opacity: 0.65; margin-top: 12px; }
.add input {
  display: block; width: 100%; box-sizing: border-box; margin-top: 4px;
  font: inherit; padding: 8px 10px; border-radius: 6px;
  background: none; color: inherit;
  border: 1px solid color-mix(in srgb, currentColor 25%, transparent);
}
.add input:focus { outline: 1px solid color-mix(in srgb, currentColor 55%, transparent); }
.add button {
  margin-top: 16px; font: inherit; padding: 7px 16px; border-radius: 6px;
  background: none; color: inherit; cursor: pointer;
  border: 1px solid color-mix(in srgb, currentColor 40%, transparent);
}
.add button:hover { border-color: color-mix(in srgb, currentColor 70%, transparent); }
`;

// Nothing is interpolated into this, so it needs no escaping and cannot carry a
// value from the registry. The backslash arrives through a char code because a
// separator written literally would have to survive both this template and the
// browser's parser.
const SCRIPT = `
(function () {
  var list = document.getElementById('projects');
  var form = document.getElementById('add-project');
  if (list === null || form === null) return;
  var pathField = document.getElementById('add-path');
  var idField = document.getElementById('add-id');
  var edited = false;
  var SEP = String.fromCharCode(92);

  var show = function (id, message) {
    var slot = document.getElementById(id);
    if (slot !== null) slot.textContent = message;
  };

  var slotFor = function (field) {
    return field === 'path' ? 'error-path' : field === 'id' ? 'error-id' : 'error-form';
  };

  var send = function (endpoint, body) {
    return fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (response) {
      return response.json().then(function (data) {
        return { ok: response.ok, data: data };
      });
    });
  };

  idField.addEventListener('input', function () { edited = true; });

  pathField.addEventListener('input', function () {
    if (edited) return;
    var parts = pathField.value.trim().split('/').join(SEP).split(SEP);
    var name = '';
    for (var i = 0; i < parts.length; i += 1) if (parts[i] !== '') name = parts[i];
    idField.value = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  });

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    show('error-path', '');
    show('error-id', '');
    show('error-form', '');
    send('/api/projects/add', { path: pathField.value, id: idField.value }).then(function (result) {
      if (!result.ok) {
        show(slotFor(result.data.field), result.data.message);
        return;
      }
      list.innerHTML = result.data.html;
      pathField.value = '';
      idField.value = '';
      edited = false;
      pathField.focus();
    }, function () {
      show('error-form', 'The server did not answer.');
    });
  });

  list.addEventListener('click', function (event) {
    var button = event.target.closest('button[data-id]');
    if (button === null) return;
    var row = button.closest('li');
    var named = row.querySelector('.name');
    var name = named === null ? button.getAttribute('data-id') : named.textContent;
    if (!window.confirm('Remove "' + name + '" from the list? Its files stay where they are.')) return;
    var slot = row.querySelector('.error');
    if (slot !== null) slot.textContent = '';
    send('/api/projects/remove', { id: button.getAttribute('data-id') }).then(function (result) {
      if (!result.ok) {
        if (slot !== null) slot.textContent = result.data.message;
        return;
      }
      list.innerHTML = result.data.html;
    }, function () {
      if (slot !== null) slot.textContent = 'The server did not answer.';
    });
  });
})();
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
    `<div class="name">${escapeHtml(title)}</div>${detail}</a>` +
    // Outside the link, so the row itself stays one link to the board, and named
    // for its project, so a page of rows does not offer identical controls.
    `<button type="button" class="remove" data-id="${escapeHtml(row.id)}"` +
    ` aria-label="Remove ${escapeHtml(title)}">Remove</button>` +
    '<div class="error"></div></li>'
  );
};

// A failed re-read with rows behind it is a stale mapping; with no rows there is
// nothing to be stale, so the page says only that the file could not be read —
// promising the last version that loaded when none ever did would be a lie the
// default registry reaches on its first bad edit.
//
// This is what the page paints first and what the two write endpoints answer
// with, so a row's markup has one home rather than a copy in the script.
export const renderProjects = (
  rows: readonly BoardListRow[],
  staleReason: string | null,
): string => {
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
  return note + body;
};

// The third message slot is for a refusal that belongs to no field — a registry
// that cannot be read, a write that failed. Those still have to be said, and
// neither is the fault of an input.
const ADD_SECTION =
  '<section class="add"><h2>Add a project</h2><form id="add-project">' +
  '<label for="add-path">Path</label>' +
  '<input id="add-path" type="text" autocomplete="off" spellcheck="false">' +
  '<div class="error" id="error-path"></div>' +
  '<label for="add-id">ID</label>' +
  '<input id="add-id" type="text" autocomplete="off" spellcheck="false">' +
  '<div class="error" id="error-id"></div>' +
  '<button type="submit">Add</button>' +
  '<div class="error" id="error-form"></div>' +
  '</form></section>';

export const renderListPage = (rows: readonly BoardListRow[], staleReason: string | null): string =>
  '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
  // The same file the boards use; it is served from the client bundle, which
  // sits next to this server whatever mode it runs in.
  '<link rel="icon" type="image/svg+xml" href="/favicon.svg">' +
  `<title>boardown</title><style>${STYLES}</style></head>` +
  '<body><main><h1>boardown</h1>' +
  // The container is replaced whole by a write, so the empty-registry line and
  // the stale note come and go with the rows.
  `<div id="projects">${renderProjects(rows, staleReason)}</div>` +
  `${ADD_SECTION}</main><script>${SCRIPT}</script></body></html>`;
