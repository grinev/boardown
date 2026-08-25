import type { BoardListRow } from './board-list.js';

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// Plain HTML with inline styles rather than a second client bundle: the page is
// a list of links and two dialogs, and giving it a build would make an app out
// of it. It follows the reader's colour scheme instead of the board's theme,
// which lives in a board's own config and so cannot speak for several of them —
// so the dialogs reproduce the shape of the board's create-epic dialog in this
// page's own currentColor idiom rather than borrowing that theme's palette.
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
.error { font-size: 13px; color: color-mix(in srgb, currentColor 40%, #e5484d); }
.error:empty { display: none; }
li > .error { margin-top: 4px; }
.add-open {
  margin-top: 24px; font: inherit; padding: 7px 16px; border-radius: 6px;
  background: none; color: inherit; cursor: pointer;
  border: 1px solid color-mix(in srgb, currentColor 40%, transparent);
}
.add-open:hover { border-color: color-mix(in srgb, currentColor 70%, transparent); }
/* Canvas and CanvasText rather than currentColor for the surface and the
   confirming button: both follow the same colour scheme the rest of the page
   does, and a background mixed from currentColor would resolve against the
   button's own colour instead of the page's. */
dialog {
  padding: 0; width: 100%; max-width: min(480px, 92vw); margin: 96px auto auto;
  /* The 96px above plus 48px of slack below, so the footer is always reachable
     on a short viewport; the body is what scrolls to it. */
  max-height: calc(100vh - 144px);
  overflow: hidden;
  background: Canvas; color: CanvasText;
  border: 1px solid color-mix(in srgb, CanvasText 25%, Canvas);
  border-radius: 10px; box-shadow: 0 12px 32px rgba(0, 0, 0, 0.25);
}
/* Only when open. Put on the bare element, "display: flex" is an author-origin
   declaration and so outranks the UA's "dialog:not([open]) { display: none }"
   whatever the specificity, which would paint both dialogs onto the page at
   load. */
dialog[open] { display: flex; flex-direction: column; }
dialog::backdrop { background: rgba(0, 0, 0, 0.5); }
.dialog-header {
  display: flex; align-items: center; justify-content: space-between;
  flex: 0 0 auto; padding: 12px 16px;
  border-bottom: 1px solid color-mix(in srgb, currentColor 20%, transparent);
}
.dialog-header h2 { margin: 0; font-size: 15px; font-weight: 600; }
.dialog-close {
  font: inherit; font-size: 15px; line-height: 1; padding: 4px 7px;
  background: none; color: inherit; opacity: 0.65; cursor: pointer;
  border: 0; border-radius: 4px;
}
.dialog-close:hover { opacity: 1; background: color-mix(in srgb, currentColor 12%, transparent); }
.dialog-body {
  display: flex; flex-direction: column; gap: 14px; padding: 18px 20px 16px;
  flex: 1 1 auto; min-height: 0; overflow-y: auto;
}
.dialog-body p { margin: 0; overflow-wrap: anywhere; }
.field { display: flex; flex-direction: column; gap: 6px; }
.field label {
  font-size: 12px; font-weight: 600; opacity: 0.65;
  text-transform: uppercase; letter-spacing: 0.04em;
}
.field input {
  font: inherit; font-size: 14px; width: 100%; box-sizing: border-box;
  padding: 8px 10px; border-radius: 6px; background: none; color: inherit;
  border: 1px solid color-mix(in srgb, currentColor 25%, transparent);
}
.field input:focus { outline: 1px solid color-mix(in srgb, currentColor 55%, transparent); }
.dialog-footer { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }
.dialog-footer button {
  font: inherit; font-size: 13px; font-weight: 500; cursor: pointer;
  padding: 8px 14px; border-radius: 6px; border: 1px solid transparent;
}
.dialog-footer .secondary {
  background: none; color: inherit;
  border-color: color-mix(in srgb, currentColor 25%, transparent);
}
.dialog-footer .secondary:hover { background: color-mix(in srgb, currentColor 12%, transparent); }
.dialog-footer .confirm {
  background: color-mix(in srgb, CanvasText 88%, Canvas); color: Canvas;
  border-color: color-mix(in srgb, CanvasText 88%, Canvas);
}
.dialog-footer .confirm:hover { background: CanvasText; border-color: CanvasText; }
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
  var addDialog = document.getElementById('add-dialog');
  var removeDialog = document.getElementById('remove-dialog');
  var openButton = document.getElementById('add-open');
  var pathField = document.getElementById('add-path');
  var idField = document.getElementById('add-id');
  var question = document.getElementById('remove-question');
  var confirmButton = document.getElementById('remove-confirm');
  var edited = false;
  var pending = null;
  var SEP = String.fromCharCode(92);

  var show = function (id, message) {
    var slot = document.getElementById(id);
    if (slot !== null) slot.textContent = message;
  };

  var clearErrors = function () {
    show('error-path', '');
    show('error-id', '');
    show('error-form', '');
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

  var dialogs = [addDialog, removeDialog];
  for (var d = 0; d < dialogs.length; d += 1) {
    (function (dialog) {
      // The dialog has no padding, so a press that lands on the element itself
      // landed on the backdrop. On press rather than on click, so a drag that
      // starts inside the dialog and ends outside it does not dismiss it.
      dialog.addEventListener('mousedown', function (event) {
        if (event.target === dialog) dialog.close();
      });
      dialog.addEventListener('click', function (event) {
        if (event.target.hasAttribute('data-close')) dialog.close();
      });
    })(dialogs[d]);
  }

  openButton.addEventListener('click', function () {
    pathField.value = '';
    idField.value = '';
    edited = false;
    clearErrors();
    addDialog.showModal();
    // showModal() focuses the first focusable element, which is the header's
    // close button; the caret belongs in the first field.
    pathField.focus();
  });

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
    clearErrors();
    send('/api/projects/add', { path: pathField.value, id: idField.value }).then(function (result) {
      if (!result.ok) {
        show(slotFor(result.data.field), result.data.message);
        return;
      }
      list.innerHTML = result.data.html;
      addDialog.close();
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
    var slot = row.querySelector('.error');
    if (slot !== null) slot.textContent = '';
    pending = { id: button.getAttribute('data-id'), slot: slot };
    question.textContent = 'Remove "' + name + '" from the list? Its files stay where they are.';
    removeDialog.showModal();
  });

  removeDialog.addEventListener('close', function () { pending = null; });

  confirmButton.addEventListener('click', function () {
    if (pending === null) return;
    var id = pending.id;
    var slot = pending.slot;
    removeDialog.close();
    send('/api/projects/remove', { id: id }).then(function (result) {
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

const dialogHeader = (titleId: string, title: string): string =>
  `<div class="dialog-header"><h2 id="${titleId}">${title}</h2>` +
  '<button type="button" class="dialog-close" data-close aria-label="Close">✕</button></div>';

// The third message slot is for a refusal that belongs to no field — a registry
// that cannot be read, a write that failed. Those still have to be said, and
// neither is the fault of an input.
const ADD_DIALOG =
  '<dialog id="add-dialog" aria-labelledby="add-title">' +
  dialogHeader('add-title', 'Add a project') +
  '<form id="add-project" class="dialog-body">' +
  '<div class="field"><label for="add-path">Path</label>' +
  '<input id="add-path" type="text" autocomplete="off" spellcheck="false">' +
  '<div class="error" id="error-path" role="alert"></div></div>' +
  '<div class="field"><label for="add-id">ID</label>' +
  '<input id="add-id" type="text" autocomplete="off" spellcheck="false">' +
  '<div class="error" id="error-id" role="alert"></div></div>' +
  '<div class="error" id="error-form" role="alert"></div>' +
  '<div class="dialog-footer">' +
  '<button type="button" class="secondary" data-close>Cancel</button>' +
  '<button type="submit" class="confirm">Add</button>' +
  '</div></form></dialog>';

// The question names the project, so the script writes it rather than the
// renderer: the name comes from the row whose Remove was pressed.
const REMOVE_DIALOG =
  '<dialog id="remove-dialog" aria-labelledby="remove-title">' +
  dialogHeader('remove-title', 'Remove project') +
  '<div class="dialog-body"><p id="remove-question"></p>' +
  '<div class="dialog-footer">' +
  '<button type="button" class="secondary" data-close>Cancel</button>' +
  '<button type="button" class="confirm" id="remove-confirm">Remove</button>' +
  '</div></div></dialog>';

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
  '<button type="button" class="add-open" id="add-open">Add project</button>' +
  `</main>${ADD_DIALOG}${REMOVE_DIALOG}<script>${SCRIPT}</script></body></html>`;
