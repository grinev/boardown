import { createWriteStream, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { formatLogRecord, type LogSink } from '../../core/src/logger';

// Every run of the dev server gets its own file; the timestamp carries
// milliseconds so two runs started in the same second cannot collide, and the
// colons ISO uses are replaced because Windows forbids them in filenames.
const LOG_FILE_PATTERN = /^web-\d{4}-\d{2}-\d{2}T[\d-]+Z\.log$/;

const KEEP_RUNS = 10;

export const logFileName = (startedAt: Date): string =>
  `web-${startedAt.toISOString().replace(/[:.]/g, '-')}.log`;

// Pure so the retention rule is testable without touching a disk. Names sort
// chronologically because the timestamp is fixed-width ISO, and anything this
// module did not create is never a candidate for deletion.
export const logFilesToPrune = (names: readonly string[], keep = KEEP_RUNS): string[] =>
  names
    .filter((name) => LOG_FILE_PATTERN.test(name))
    .sort()
    .reverse()
    .slice(keep);

export interface LogFileSink {
  sink: LogSink;
  filePath: string;
}

// Returns null when the logs directory cannot be used: losing the log file must
// never cost the developer a working dev server.
export function createLogFileSink(logsDir: string, startedAt = new Date()): LogFileSink | null {
  let filePath: string;
  try {
    mkdirSync(logsDir, { recursive: true });
    filePath = path.join(logsDir, logFileName(startedAt));
  } catch {
    return null;
  }

  try {
    const current = path.basename(filePath);
    // Pruning happens before the stream opens, so this run's file is not on disk
    // yet: leave room for it and the folder settles at exactly KEEP_RUNS.
    for (const name of logFilesToPrune(readdirSync(logsDir), KEEP_RUNS - 1)) {
      // Guard against pruning the file this run is about to open, however the
      // clock behaves.
      if (name !== current) unlinkSync(path.join(logsDir, name));
    }
  } catch {
    // A folder we cannot prune is still a folder we can log into.
  }

  let stream;
  try {
    stream = createWriteStream(filePath, { flags: 'a' });
  } catch {
    return null;
  }
  // A late stream failure (the folder is removed mid-run) must not surface as an
  // unhandled 'error' event and take the dev server down.
  stream.on('error', () => {});

  return {
    filePath,
    sink: (record) => {
      stream.write(`${formatLogRecord(record)}\n`);
    },
  };
}
