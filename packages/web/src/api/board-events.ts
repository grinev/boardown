import type { ServerResponse } from 'node:http';
import path from 'node:path';
import { createLogger } from '../../../core/src/logger';
import { CLIENT_ID_PARAM } from '../board-events-endpoint.js';
import { watchBoard, type BoardWatcher } from './board-watcher.js';

// The policy half of auto-refresh: which change reaches which open tab, and
// when. Both hosts build one of these and hand it down, the way each already
// hands down a board root — so the dev shell and the server can never grow two
// answers to the same question, and `--no-watch` means no hub was built at all.
//
// The two numbers are the ones the VS Code and Electron shells use. They are
// copied rather than shared: extracting the policy into core is out of scope,
// and a shell importing another shell would be worse than a copy.

// How long after a tab writes a file its own watch event is ignored, so its
// saves don't bounce back as an "external change" refresh.
const ECHO_WINDOW_MS = 2000;
// Collapse a burst of changes (a `git checkout`, a CLI command) into one refresh.
const REFRESH_DEBOUNCE_MS = 200;

const log = createLogger('web.board-events');

interface Connection {
  clientId: string;
  res: ServerResponse;
  /** Absolute paths this tab wrote, and when — its own echo to skip. */
  recentWrites: Map<string, number>;
  /** What the debounce now running has collected, judged when it fires. */
  pending: Set<string>;
  timer?: ReturnType<typeof setTimeout> | undefined;
}

interface WatchEntry {
  watcher: BoardWatcher;
  connections: Set<Connection>;
}

export interface BoardWatchHub {
  /** Serves the long-lived GET the browser holds open on one board. */
  openStream: (res: ServerResponse, params: URLSearchParams, boardRoot: string) => void;
  /** Records a write so the tab that made it does not see its own change. */
  noteWrite: (boardRoot: string, clientId: string | undefined, absolutePath: string) => void;
  /**
   * The boards under watch right now. Exists so the reference counting can be
   * asserted: a registry of twenty projects holding twenty watchers for boards
   * nobody opened is the failure this is built to avoid, and it is invisible
   * from every other angle.
   */
  watchedRoots: () => string[];
  close: () => void;
}

export const createBoardWatchHub = (): BoardWatchHub => {
  // Keyed by resolved board root, not by registry id: two ids naming one board
  // are one board, and share the watcher.
  const entries = new Map<string, WatchEntry>();

  const isOwnWrite = (connection: Connection, absolutePath: string): boolean => {
    const now = Date.now();
    for (const [written, at] of connection.recentWrites) {
      if (now - at > ECHO_WINDOW_MS) {
        connection.recentWrites.delete(written);
        continue;
      }
      // Beneath a recorded path counts too: removing a docs folder fires an
      // event for every file under it, and only the folder was recorded.
      if (absolutePath === written || absolutePath.startsWith(written + path.sep)) return true;
    }
    return false;
  };

  // A tab's own writes are judged when the debounce fires, not as the events
  // arrive. The two have no fixed order: the OS reports a change on its own
  // schedule and can beat the filesystem call the tab is still waiting on, so at
  // the moment an event lands the write that caused it may not be recorded yet.
  // By the time the debounce fires it is.
  const schedule = (connection: Connection, absolutePath: string): void => {
    connection.pending.add(absolutePath);
    clearTimeout(connection.timer);
    connection.timer = setTimeout(() => {
      connection.timer = undefined;
      const changed = [...connection.pending];
      connection.pending.clear();
      if (changed.every((candidate) => isOwnWrite(connection, candidate))) return;
      // An event with no data is not dispatched by the browser, so it carries a
      // byte it never reads.
      connection.res.write('event: board-changed\ndata: 1\n\n');
    }, REFRESH_DEBOUNCE_MS);
  };

  const onChange = (key: string) => (absolutePath: string) => {
    const entry = entries.get(key);
    if (entry === undefined) return;
    log.debug(`changed ${absolutePath}`);
    for (const connection of entry.connections) schedule(connection, absolutePath);
  };

  const drop = (key: string, connection: Connection): void => {
    const entry = entries.get(key);
    if (entry === undefined) return;
    clearTimeout(connection.timer);
    entry.connections.delete(connection);
    if (entry.connections.size > 0) return;
    // Nobody is looking at this board any more. A registry of twenty projects
    // must not hold twenty watchers for boards nobody opened.
    entry.watcher.close();
    entries.delete(key);
    log.debug(`stopped watching ${key}`);
  };

  return {
    openStream: (res, params, boardRoot) => {
      const key = path.resolve(boardRoot);
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      // Without this the browser's `open` waits for the first event, and the
      // refresh-on-reconnect would fire late.
      res.flushHeaders();

      let entry = entries.get(key);
      if (entry === undefined) {
        entry = { watcher: watchBoard(key, onChange(key)), connections: new Set() };
        entries.set(key, entry);
        log.debug(`watching ${key}`);
      }
      const connection: Connection = {
        clientId: params.get(CLIENT_ID_PARAM) ?? '',
        res,
        recentWrites: new Map(),
        pending: new Set(),
      };
      entry.connections.add(connection);
      log.debug(`stream opened on ${key} (${entry.connections.size} open)`);

      res.on('close', () => {
        drop(key, connection);
      });
    },

    noteWrite: (boardRoot, clientId, absolutePath) => {
      if (clientId === undefined || clientId === '') return;
      const entry = entries.get(path.resolve(boardRoot));
      if (entry === undefined) return;
      for (const connection of entry.connections) {
        if (connection.clientId === clientId) connection.recentWrites.set(absolutePath, Date.now());
      }
    },

    watchedRoots: () => [...entries.keys()],

    close: () => {
      for (const entry of entries.values()) {
        entry.watcher.close();
        for (const connection of entry.connections) {
          clearTimeout(connection.timer);
          connection.res.end();
        }
      }
      entries.clear();
    },
  };
};
