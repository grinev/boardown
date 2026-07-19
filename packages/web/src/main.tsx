import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { configureLogging, parseLogLevel } from '@boardown/core';
import { App } from '@boardown/ui';
import { createBrowserLogSink } from './browser-log-sink';
import { DevHttpFsAdapter } from './dev-http-fs-adapter';

// Installed before anything renders, so a failure during the first load is
// already covered. Only this dev shell installs a sink — the shipped shells stay
// silent by leaving the logger at its no-op default.
const level = parseLogLevel(__BOARDOWN_LOG_LEVEL__);
configureLogging({ sink: createBrowserLogSink(), ...(level === null ? {} : { level }) });

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root container #root not found');
}

const fs = new DevHttpFsAdapter();

createRoot(container).render(
  <StrictMode>
    <App fs={fs} />
  </StrictMode>,
);
