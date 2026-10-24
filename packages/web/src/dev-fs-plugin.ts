import { promises as fs } from 'node:fs';
import path from 'node:path';
import { configureLogging, createLogger, isLogLevel, type LogRecord } from '../../core/src/logger';
import type { Plugin } from 'vite';
import { BOARD_FS_PREFIX, handleBoardFs, handleProjectFile, readBody } from './api/board-api.js';
import { createBoardWatchHub } from './api/board-events.js';
import { buildPageBoot, stampPage } from './api/page-boot.js';
import {
  handleSharedTheme,
  openSharedConfig,
  type SharedConfigSource,
} from './api/shared-config.js';
import { BOARD_EVENTS_ENDPOINT } from './board-events-endpoint.js';
import { LOG_ENDPOINT } from './browser-log-sink.js';
import { PROJECT_FILE_ENDPOINT } from './project-file-endpoint.js';
import { GIT_COMMITS_ENDPOINT } from './git-history-endpoint.js';
import { SHARED_THEME_ENDPOINT } from './shared-theme-endpoint.js';
import { handleGitCommits } from './api/git-history.js';
import { createLogFileSink } from './log-file-sink.js';
import { resolveDevLogLevel } from './log-level.js';

interface DevFsPluginOptions {
  boardRoot: string;
  // Where per-run log files go. The repo root's logs/, resolved by the config.
  logsDir: string;
  // --config-dir / BOARDOWN_CONFIG_DIR, absolute. Only read, never created.
  configDir?: string | undefined;
}

const log = createLogger('web.dev-fs');

// Only ensure the board root directory exists so the adapter can read/write.
// Never seed config.yaml or a starter release: a missing config must reach the
// UI as `missing-config` so onboarding always runs. Dev-only — the server
// creates nothing, so a folder it was pointed at stays untouched until
// onboarding writes into it.
export const ensureBoardRoot = async (boardRoot: string): Promise<void> => {
  await fs.mkdir(boardRoot, { recursive: true });
  const stat = await fs.stat(boardRoot);
  if (!stat.isDirectory()) {
    throw new Error(`Board data path is not a directory: ${boardRoot}`);
  }
};

// A record posted by the browser sink. Validated rather than trusted: a
// malformed payload is dropped, never a reason to fail a request.
const asLogRecord = (value: unknown): LogRecord | null => {
  if (typeof value !== 'object' || value === null) return null;
  const { timestamp, level, namespace, message, detail } = value as Record<string, unknown>;
  if (typeof timestamp !== 'string' || typeof namespace !== 'string') return null;
  if (typeof message !== 'string' || !isLogLevel(level)) return null;
  return {
    timestamp,
    level,
    // Keeps the origin unambiguous once server and browser lines share a file.
    namespace: `browser.${namespace}`,
    message,
    ...(typeof detail === 'string' ? { detail } : {}),
  };
};

// The dev host for the endpoints in api/board-api. What stays here is what only
// the dev shell has: the run's log file, the sink the browser posts into, and a
// board root created up front so a fresh checkout can be served. Auto-refresh is
// always on here — the dev shell is started by a pnpm script, not by a user
// typing flags, so there is nobody to turn a switch.
export function devFsPlugin(options: DevFsPluginOptions): Plugin {
  const boardRoot = path.resolve(options.boardRoot);
  const projectRoot = path.dirname(boardRoot);
  const logsDir = path.resolve(options.logsDir);
  // Opened in configureServer, which runs before any page is served.
  let sharedConfig: SharedConfigSource | undefined;

  return {
    name: 'boardown-dev-fs',
    apply: 'serve',
    async transformIndexHtml(html) {
      return stampPage(html, await buildPageBoot(boardRoot, sharedConfig));
    },
    async configureServer(server) {
      await ensureBoardRoot(boardRoot);
      server.config.logger.info(`boardown data dir: ${boardRoot}`);
      // Thrown before anything is served, so Vite refuses to start with the
      // diagnostic, as boardown-web does.
      sharedConfig =
        options.configDir === undefined ? undefined : await openSharedConfig(options.configDir);
      if (sharedConfig !== undefined) {
        server.config.logger.info(`boardown config dir: ${sharedConfig.dir}`);
      }

      const level = resolveDevLogLevel(process.env.BOARDOWN_LOG_LEVEL);
      const fileSink = createLogFileSink(logsDir);
      if (fileSink === null) {
        server.config.logger.warn(`boardown: could not open a log file in ${logsDir}`);
      } else {
        configureLogging({ sink: fileSink.sink, level });
        server.config.logger.info(`boardown log file: ${fileSink.filePath} (level ${level})`);
        log.info(`dev server started, board root ${boardRoot}`);
      }

      const watch = createBoardWatchHub(
        sharedConfig === undefined ? {} : { configDir: sharedConfig.dir },
      );
      // Vite starts a fresh server when its config changes, and a dev session can
      // do that many times over; the watchers go with the one they belonged to.
      server.httpServer?.on('close', () => {
        watch.close();
      });

      // connect's middleware signature is void-returning; the async body owns
      // its own error handling, so the returned promise is intentionally not
      // awaited by connect.
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      server.middlewares.use(async (req, res, next) => {
        // The page carries the theme stamped when it was served. Vite answers its
        // HTML `no-cache`, which a history navigation may still take from the HTTP
        // cache, so an HTML answer's caching becomes `no-store`. Keyed on the type
        // Vite sets just before it, since it serves the page for any Accept;
        // `server.headers` would strip caching from every dev asset as well.
        if (req.method === 'GET') {
          const setHeader = res.setHeader.bind(res);
          res.setHeader = (name: string, value: number | string | readonly string[]) => {
            const html = String(res.getHeader('content-type') ?? '').startsWith('text/html');
            return setHeader(
              name,
              html && name.toLowerCase() === 'cache-control' ? 'no-store' : value,
            );
          };
        }

        if (req.method === 'POST' && req.url === LOG_ENDPOINT) {
          // Answers 204 whatever arrives: a bad log record is not worth an error
          // path, and the browser sink ignores the response anyway.
          try {
            const record = asLogRecord(JSON.parse(await readBody(req)));
            if (record !== null && fileSink !== null) fileSink.sink(record);
          } catch {
            // Unparseable body: dropped.
          }
          res.statusCode = 204;
          res.end();
          return;
        }

        if (!req.url) {
          next();
          return;
        }

        const url = new URL(req.url, 'http://localhost');

        if (req.method === 'GET' && url.pathname === PROJECT_FILE_ENDPOINT) {
          await handleProjectFile(res, url.searchParams, projectRoot);
          return;
        }

        if (req.method === 'GET' && url.pathname === GIT_COMMITS_ENDPOINT) {
          await handleGitCommits(res, url.searchParams, projectRoot);
          return;
        }

        if (req.method === 'GET' && url.pathname === SHARED_THEME_ENDPOINT) {
          await handleSharedTheme(res, sharedConfig);
          return;
        }

        if (req.method === 'GET' && url.pathname === BOARD_EVENTS_ENDPOINT) {
          watch.openStream(res, url.searchParams, boardRoot);
          return;
        }

        if (!url.pathname.startsWith(BOARD_FS_PREFIX)) {
          next();
          return;
        }

        await handleBoardFs(req, res, url.pathname, url.searchParams, boardRoot, watch);
      });
    },
  };
}
