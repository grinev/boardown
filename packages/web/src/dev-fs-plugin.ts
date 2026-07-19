import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  configureLogging,
  createLogger,
  isLogLevel,
  parseLogLevel,
  type LogRecord,
} from '../../core/src/logger';
import type { Connect, Plugin } from 'vite';
import { LOG_ENDPOINT } from './browser-log-sink.js';
import { createLogFileSink } from './log-file-sink.js';

interface DevFsPluginOptions {
  boardRoot: string;
  // Where per-run log files go. The repo root's logs/, resolved by the config.
  logsDir: string;
}

const log = createLogger('web.dev-fs');

interface ResolvedTarget {
  ok: true;
  abs: string;
  rel: string;
}
interface RejectedTarget {
  ok: false;
  status: number;
  message: string;
}
type Resolved = ResolvedTarget | RejectedTarget;

const sendJson = (
  res: Parameters<Connect.NextHandleFunction>[1],
  status: number,
  body: unknown,
) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
};

const sendText = (res: Parameters<Connect.NextHandleFunction>[1], status: number, body: string) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.end(body);
};

const readBody = (req: Connect.IncomingMessage): Promise<string> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });

// Only ensure the board root directory exists so the adapter can read/write.
// Never seed config.yaml or a starter release: a missing config must reach the
// UI as `missing-config` so onboarding always runs.
export const ensureBoardRoot = async (boardRoot: string): Promise<void> => {
  await fs.mkdir(boardRoot, { recursive: true });
  const stat = await fs.stat(boardRoot);
  if (!stat.isDirectory()) {
    throw new Error(`Board data path is not a directory: ${boardRoot}`);
  }
};

// The three read-shaped endpoints treat a missing file as a 404 and anything
// else as a 500; both were silent before, and both are worth a line.
const failTarget = (
  res: Parameters<Connect.NextHandleFunction>[1],
  op: string,
  rel: string,
  err: unknown,
) => {
  if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
    log.warn(`${op} ${rel}: 404 not found`);
    sendText(res, 404, `Not found: ${rel}`);
  } else {
    log.error(`${op} ${rel}: 500`, err);
    sendText(res, 500, (err as Error).message);
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

export function devFsPlugin(options: DevFsPluginOptions): Plugin {
  const boardRoot = path.resolve(options.boardRoot);
  const logsDir = path.resolve(options.logsDir);

  const resolveTarget = (userPath: string | null): Resolved => {
    if (userPath === null || userPath === '') {
      return { ok: false, status: 400, message: 'Missing "path" query parameter' };
    }
    const normalized = userPath.replace(/\\/g, '/');
    if (normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized)) {
      return { ok: false, status: 400, message: 'Absolute paths are not allowed' };
    }
    const abs = path.resolve(boardRoot, normalized);
    const rel = path.relative(boardRoot, abs);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      return { ok: false, status: 400, message: 'Path escapes board root' };
    }
    return { ok: true, abs, rel };
  };

  return {
    name: 'boardown-dev-fs',
    apply: 'serve',
    async configureServer(server) {
      await ensureBoardRoot(boardRoot);
      server.config.logger.info(`boardown data dir: ${boardRoot}`);

      const level = parseLogLevel(process.env.BOARDOWN_LOG_LEVEL);
      const fileSink = createLogFileSink(logsDir);
      if (fileSink === null) {
        server.config.logger.warn(`boardown: could not open a log file in ${logsDir}`);
      } else {
        configureLogging({ sink: fileSink.sink, ...(level === null ? {} : { level }) });
        server.config.logger.info(`boardown log file: ${fileSink.filePath}`);
        log.info(`dev server started, board root ${boardRoot}`);
      }

      // connect's middleware signature is void-returning; the async body owns
      // its own error handling (try/catch below), so the returned promise is
      // intentionally not awaited by connect.
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      server.middlewares.use(async (req, res, next) => {
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

        if (!req.url || !req.url.startsWith('/api/fs/')) {
          next();
          return;
        }

        try {
          const url = new URL(req.url, 'http://localhost');
          const userPath = url.searchParams.get('path');

          if (req.method === 'GET' && url.pathname === '/api/fs/read') {
            const target = resolveTarget(userPath);
            if (!target.ok) {
              sendText(res, target.status, target.message);
              return;
            }
            try {
              const content = await fs.readFile(target.abs, 'utf-8');
              log.debug(`read ${target.rel}: 200`);
              sendText(res, 200, content);
            } catch (err) {
              failTarget(res, 'read', target.rel, err);
            }
            return;
          }

          if (req.method === 'GET' && url.pathname === '/api/fs/list') {
            const target = resolveTarget(userPath);
            if (!target.ok) {
              sendText(res, target.status, target.message);
              return;
            }
            try {
              const entries = await fs.readdir(target.abs, { withFileTypes: true });
              log.debug(`list ${target.rel}: 200 (${entries.length} entries)`);
              sendJson(
                res,
                200,
                entries
                  .filter((e) => e.isFile() || e.isDirectory())
                  .map((e) => ({ name: e.name, isDirectory: e.isDirectory() })),
              );
            } catch (err) {
              failTarget(res, 'list', target.rel, err);
            }
            return;
          }

          if (req.method === 'GET' && url.pathname === '/api/fs/stat') {
            const target = resolveTarget(userPath);
            if (!target.ok) {
              sendText(res, target.status, target.message);
              return;
            }
            try {
              const stat = await fs.stat(target.abs);
              log.debug(`stat ${target.rel}: 200`);
              sendJson(res, 200, { lastModified: stat.mtimeMs });
            } catch (err) {
              failTarget(res, 'stat', target.rel, err);
            }
            return;
          }

          if (req.method === 'POST' && url.pathname === '/api/fs/write') {
            const raw = await readBody(req);
            let body: { path?: unknown; content?: unknown };
            try {
              body = JSON.parse(raw) as typeof body;
            } catch {
              sendText(res, 400, 'Invalid JSON body');
              return;
            }
            if (typeof body.path !== 'string' || typeof body.content !== 'string') {
              sendText(res, 400, 'Body must be { path: string, content: string }');
              return;
            }
            const target = resolveTarget(body.path);
            if (!target.ok) {
              sendText(res, target.status, target.message);
              return;
            }
            try {
              await fs.mkdir(path.dirname(target.abs), { recursive: true });
              await fs.writeFile(target.abs, body.content, 'utf-8');
              log.info(`write ${target.rel}: 204 (${body.content.length} chars)`);
              res.statusCode = 204;
              res.end();
            } catch (err) {
              log.error(`write ${target.rel}: 500`, err);
              sendText(res, 500, (err as Error).message);
            }
            return;
          }

          if (
            req.method === 'POST' &&
            (url.pathname === '/api/fs/mkdir' || url.pathname === '/api/fs/remove')
          ) {
            const raw = await readBody(req);
            let body: { path?: unknown };
            try {
              body = JSON.parse(raw) as typeof body;
            } catch {
              sendText(res, 400, 'Invalid JSON body');
              return;
            }
            if (typeof body.path !== 'string') {
              sendText(res, 400, 'Body must be { path: string }');
              return;
            }
            const target = resolveTarget(body.path);
            if (!target.ok) {
              sendText(res, target.status, target.message);
              return;
            }
            try {
              if (url.pathname === '/api/fs/mkdir') {
                await fs.mkdir(target.abs, { recursive: true });
              } else {
                await fs.rm(target.abs, { recursive: true, force: true });
              }
              // A removal changes the board on disk, so it belongs with writes
              // rather than in the debug-level noise.
              const verb = url.pathname === '/api/fs/mkdir' ? 'mkdir' : 'remove';
              if (verb === 'mkdir') log.debug(`mkdir ${target.rel}: 204`);
              else log.info(`remove ${target.rel}: 204`);
              res.statusCode = 204;
              res.end();
            } catch (err) {
              log.error(`${url.pathname} ${target.rel}: 500`, err);
              sendText(res, 500, (err as Error).message);
            }
            return;
          }

          log.warn(`unknown endpoint: ${req.method} ${url.pathname}`);
          sendText(res, 404, `Unknown endpoint: ${req.method} ${url.pathname}`);
        } catch (err) {
          log.error(`unhandled failure for ${req.method} ${req.url}`, err);
          sendText(res, 500, (err as Error).message);
        }
      });
    },
  };
}
