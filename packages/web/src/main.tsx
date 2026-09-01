import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { configureLogging } from '@boardown/core';
import { App, useBoardStore } from '@boardown/ui';
import { createBrowserLogSink } from './browser-log-sink';
import { subscribeToBoardChanges } from './api/board-event-source';
import { HttpFsAdapter } from './api/http-fs-adapter';
import { HttpGitHistoryReader } from './api/http-git-history-reader';
import { HttpProjectFileReader } from './api/http-project-file-reader';
import { BOARD_EVENTS_ENDPOINT } from './board-events-endpoint';
import { GIT_COMMITS_ENDPOINT } from './git-history-endpoint';
import { PROJECT_FILE_ENDPOINT } from './project-file-endpoint';
import { resolveDevLogLevel } from './log-level';

// Only the dev shell installs a sink; the server has no endpoint to post to, and
// a shipped shell emitting log output to a user is a bug. Installed before
// anything renders, so a failure during the first load is already covered.
if (import.meta.env.DEV) {
  configureLogging({
    sink: createBrowserLogSink(),
    level: resolveDevLogLevel(__BOARDOWN_LOG_LEVEL__),
  });
}

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root container #root not found');
}

// The same bundle is served at `/` for one board and under `/b/<id>/` for one of
// several, so the page reads its own prefix off the path it was loaded at rather
// than being handed it. Assets stay at an absolute /assets/…, shared by every
// prefix; only the endpoints move.
const prefix = /^\/b\/[^/]+/.exec(window.location.pathname)?.[0] ?? '';

// Names this tab to the server, so the changes it makes itself are not sent back
// to it as external ones. Loopback is a secure context, so randomUUID is there.
const clientId = crypto.randomUUID();

const fs = new HttpFsAdapter(`${prefix}/api/fs`, clientId);
const projectFiles = new HttpProjectFileReader(`${prefix}${PROJECT_FILE_ENDPOINT}`);
const gitHistory = new HttpGitHistoryReader(`${prefix}${GIT_COMMITS_ENDPOINT}`);

createRoot(container).render(
  <StrictMode>
    <App
      fs={fs}
      projectFiles={projectFiles}
      gitHistory={gitHistory}
      version={__BOARDOWN_VERSION__}
    />
  </StrictMode>,
);

// The same receiving end the VS Code and Electron shells use: the shell only
// delivers the event, and the store already knows how to answer it.
subscribeToBoardChanges(`${prefix}${BOARD_EVENTS_ENDPOINT}`, clientId, () => {
  void useBoardStore.getState().reloadSilent();
});
