export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

export interface LogRecord {
  timestamp: string;
  level: LogLevel;
  namespace: string;
  message: string;
  // Present when the call passed a cause; already flattened to one line.
  detail?: string;
}

export type LogSink = (record: LogRecord) => void;

export interface Logger {
  debug(message: string, cause?: unknown): void;
  info(message: string, cause?: unknown): void;
  warn(message: string, cause?: unknown): void;
  error(message: string, cause?: unknown): void;
}

export interface LoggingOptions {
  // null clears the sink, restoring the silent default.
  sink?: LogSink | null;
  level?: LogLevel;
}

const DEFAULT_LEVEL: LogLevel = 'info';
// Long enough for a stack, short enough that one runaway payload cannot fill the
// log file.
const MAX_FIELD_LENGTH = 4000;

let currentSink: LogSink | null = null;
let currentLevel: LogLevel = DEFAULT_LEVEL;

const rank = (level: LogLevel): number => LOG_LEVELS.indexOf(level);

export function isLogLevel(value: unknown): value is LogLevel {
  return typeof value === 'string' && (LOG_LEVELS as readonly string[]).includes(value);
}

// Shells read their own environment and hand the result here; core never touches
// process.env, so it stays usable from a browser bundle.
export function parseLogLevel(value: unknown): LogLevel | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return isLogLevel(normalized) ? normalized : null;
}

// Installed by the shell at startup. Without it the logger is a no-op, so a
// shipped shell is silent by omission rather than by remembering to be.
export function configureLogging(options: LoggingOptions): void {
  if (options.sink !== undefined) currentSink = options.sink;
  if (options.level !== undefined) currentLevel = options.level;
}

export function resetLogging(): void {
  currentSink = null;
  currentLevel = DEFAULT_LEVEL;
}

const truncate = (value: string): string =>
  value.length > MAX_FIELD_LENGTH ? `${value.slice(0, MAX_FIELD_LENGTH)}…[truncated]` : value;

// One record must stay one line, so embedded newlines (a stack, a multi-line
// server response) collapse rather than splitting the entry in the file.
const flatten = (value: string): string => truncate(value.replace(/\r?\n/g, ' | '));

const describe = (cause: unknown): string => {
  if (cause instanceof Error) {
    return flatten(cause.stack ?? `${cause.name}: ${cause.message}`);
  }
  try {
    return flatten(typeof cause === 'string' ? cause : String(cause));
  } catch {
    // A cause whose toString throws (a Proxy, a null-prototype object) must not
    // take down the call site that was only trying to log.
    return '[unserializable]';
  }
};

export function formatLogRecord(record: LogRecord): string {
  const head = `${record.timestamp} ${record.level.toUpperCase().padEnd(5)} ${record.namespace} ${record.message}`;
  return record.detail === undefined ? head : `${head} — ${record.detail}`;
}

function emit(level: LogLevel, namespace: string, message: string, cause?: unknown): void {
  const sink = currentSink;
  if (sink === null || rank(level) < rank(currentLevel)) return;
  try {
    sink({
      timestamp: new Date().toISOString(),
      level,
      namespace,
      message: flatten(message),
      ...(cause === undefined ? {} : { detail: describe(cause) }),
    });
  } catch {
    // A failing sink is a lost log line, never a failed operation.
  }
}

export function createLogger(namespace: string): Logger {
  return {
    debug: (message, cause) => emit('debug', namespace, message, cause),
    info: (message, cause) => emit('info', namespace, message, cause),
    warn: (message, cause) => emit('warn', namespace, message, cause),
    error: (message, cause) => emit('error', namespace, message, cause),
  };
}
