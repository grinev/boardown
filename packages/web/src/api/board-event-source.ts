import { createLogger } from '@boardown/core';
import { CLIENT_ID_PARAM } from '../board-events-endpoint';

const log = createLogger('web.board-events');

// The browser half of auto-refresh, and the only file here that knows the page is
// a tab. It delivers the event; what to do about it is the store's business.
export const subscribeToBoardChanges = (
  base: string,
  clientId: string,
  onChange: () => void,
): void => {
  const url = `${base}?${CLIENT_ID_PARAM}=${encodeURIComponent(clientId)}`;
  let source: EventSource | null = null;
  // Whether what is on screen is known to be the board on disk: true while a
  // stream has been up ever since the page read it. A tab opened in the
  // background — ctrl-clicked from the list page — reads the board and then holds
  // no stream at all, so it starts out already unsure, and refreshes the moment
  // it is looked at.
  let current = document.visibilityState === 'visible';
  // A server that answers something other than a stream (`--no-watch` 404s) will
  // not answer differently while it lives, so one refusal ends it for the run.
  let refused = false;

  // A browser allows only a handful of connections to one origin, shared across
  // every board a server holds, so a stream kept by each background tab would
  // starve ordinary reads and a board would simply stop loading. Only a tab whose
  // contents are on screen holds one.
  const open = (): void => {
    if (source !== null || refused || document.visibilityState !== 'visible') return;
    const es = new EventSource(url);
    source = es;

    es.addEventListener('open', () => {
      if (!current) onChange();
      current = true;
    });

    es.addEventListener('board-changed', () => {
      onChange();
    });

    es.addEventListener('error', () => {
      // The stream is down either way, so what is on screen is no longer known to
      // be current. What differs is whether the browser will try again: CLOSED
      // means it gave up, which is the server saying it does not stream at all.
      // Expected in both cases, so it never rises above debug.
      current = false;
      if (es.readyState !== EventSource.CLOSED) return;
      log.debug('board event stream closed by the server');
      refused = true;
      source = null;
    });
  };

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      source?.close();
      source = null;
      current = false;
      return;
    }
    open();
  });

  open();
};
