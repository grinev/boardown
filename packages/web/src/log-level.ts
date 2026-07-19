// Shared by the Node side (the Vite plugin) and the browser side (main.tsx), so
// both ends of a run agree on the level. Imports the logger by source path: the
// Vite config is loaded by Node, which cannot resolve the source-only
// @boardown/core package.
import { parseLogLevel, type LogLevel } from '../../core/src/logger';

// The dev shell exists to be debugged, and its log file is the artifact a tester
// hands to a developer — so it captures everything unless asked to narrow.
// Override with BOARDOWN_LOG_LEVEL=info (or warn/error) for a quieter file.
export const DEFAULT_DEV_LOG_LEVEL: LogLevel = 'debug';

export const resolveDevLogLevel = (raw: unknown): LogLevel =>
  parseLogLevel(raw) ?? DEFAULT_DEV_LOG_LEVEL;
