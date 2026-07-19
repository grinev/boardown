import type { LogRecord, LogSink } from '@boardown/core';

export const LOG_ENDPOINT = '/api/log';

// Ships each record to the dev server, which writes it into the run's file
// alongside its own lines. Fire-and-forget on purpose: the volume is errors, not
// a trace, so a queue and a flush protocol would be machinery for nothing — and
// a logging failure must never surface as an app error or an unhandled
// rejection, including after the dev server has gone away.
export const createBrowserLogSink =
  (endpoint = LOG_ENDPOINT): LogSink =>
  (record: LogRecord) => {
    void fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record),
      keepalive: true,
    }).catch(() => {});
  };
