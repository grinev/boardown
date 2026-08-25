import { promises as fs } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import { createLogger } from '../../../core/src/logger';
import {
  PROJECT_FILE_MAX_BYTES,
  classifyProjectFile,
  type ProjectFileRead,
} from '../../../core/src/project-file';
import { CLIENT_ID_HEADER } from '../board-events-endpoint.js';
import type { BoardWatchHub } from './board-events.js';

// The endpoints both hosts serve: the Vite dev middleware and the boardown-web
// server. Each host resolves a request to a root and calls in; nothing here
// knows which one it is running under.
//
// The two roots stay apart on purpose. `handleBoardFs` — every write path —
// only ever sees a board root, and `handleProjectFile` only ever sees a
// read-only project root. There is no call site holding both, which is the same
// reason ProjectFileReader is its own interface rather than a method on
// FsAdapter: no write path may reach outside `.boardown/`.

const log = createLogger('web.board-api');

export const BOARD_FS_PREFIX = '/api/fs/';

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
export type Resolved = ResolvedTarget | RejectedTarget;

// Containment for anything that arrives from outside the process — a query
// parameter, a JSON body, a static asset path. Stays this package's own rather
// than moving into core: the shells' copies differ in the shape of their error,
// not in the rule, and core cannot import node:path.
export const resolveContained = (root: string, userPath: string | null): Resolved => {
  if (userPath === null || userPath === '') {
    return { ok: false, status: 400, message: 'Missing "path" query parameter' };
  }
  const normalized = userPath.replace(/\\/g, '/');
  if (normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized)) {
    return { ok: false, status: 400, message: 'Absolute paths are not allowed' };
  }
  const abs = path.resolve(root, normalized);
  const rel = path.relative(root, abs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    return { ok: false, status: 400, message: 'Path escapes the root' };
  }
  return { ok: true, abs, rel };
};

export const sendJson = (res: ServerResponse, status: number, body: unknown): void => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
};

export const sendText = (res: ServerResponse, status: number, body: string): void => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.end(body);
};

export const readBody = (req: IncomingMessage): Promise<string> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });

// The three read-shaped endpoints treat a missing file as a 404 and anything
// else as a 500; both are worth a line.
const failTarget = (res: ServerResponse, op: string, rel: string, err: unknown): void => {
  if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
    log.warn(`${op} ${rel}: 404 not found`);
    sendText(res, 404, `Not found: ${rel}`);
  } else {
    log.error(`${op} ${rel}: 500`, err);
    sendText(res, 500, (err as Error).message);
  }
};

// Repo file links: read-only, resolved against the project folder, and answered
// as JSON in every case — the failure kinds are part of the payload, not HTTP
// statuses. Nothing writes there.
const readProjectFile = async (projectRoot: string, userPath: string): Promise<ProjectFileRead> => {
  const target = resolveContained(projectRoot, userPath);
  if (!target.ok) {
    return { kind: 'unreadable' };
  }
  try {
    const stat = await fs.stat(target.abs);
    if (!stat.isFile()) return { kind: 'unreadable' };
    if (stat.size > PROJECT_FILE_MAX_BYTES) return { kind: 'too-large' };
    return classifyProjectFile(await fs.readFile(target.abs));
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    return { kind: code === 'ENOENT' || code === 'ENOTDIR' ? 'not-found' : 'unreadable' };
  }
};

export const handleProjectFile = async (
  res: ServerResponse,
  params: URLSearchParams,
  projectRoot: string,
): Promise<void> => {
  const userPath = params.get('path') ?? '';
  const result = await readProjectFile(projectRoot, userPath);
  log.debug(`project-file ${userPath}: ${result.kind}`);
  sendJson(res, 200, result);
};

// Exported because the registry endpoints in the server half read a body by the
// same rule, and answer a malformed one the same way, rather than growing a
// second reader of their own.
export const readJsonBody = async (
  req: IncomingMessage,
  res: ServerResponse,
): Promise<Record<string, unknown> | null> => {
  const raw = await readBody(req);
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    sendText(res, 400, 'Invalid JSON body');
    return null;
  }
};

// `pathname` is the request path with any board prefix already stripped, so it
// always starts at /api/fs/.
//
// `watch` is the host's hub when it is watching the board, and absent when it is
// not — `boardown-web --no-watch`, and every test that only cares about the
// filesystem. Each landed change is recorded against the tab that asked for it,
// so the watcher event it produces is skipped for that tab and nobody else.
export const handleBoardFs = async (
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  params: URLSearchParams,
  boardRoot: string,
  watch?: BoardWatchHub,
): Promise<void> => {
  const noteWrite = (...absolutePaths: (string | undefined)[]): void => {
    const clientId = req.headers[CLIENT_ID_HEADER];
    const id = typeof clientId === 'string' ? clientId : undefined;
    for (const absolutePath of absolutePaths) {
      if (absolutePath !== undefined) watch?.noteWrite(boardRoot, id, absolutePath);
    }
  };

  try {
    const userPath = params.get('path');

    if (req.method === 'GET' && pathname === '/api/fs/read') {
      const target = resolveContained(boardRoot, userPath);
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

    if (req.method === 'GET' && pathname === '/api/fs/list') {
      const target = resolveContained(boardRoot, userPath);
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

    if (req.method === 'GET' && pathname === '/api/fs/stat') {
      const target = resolveContained(boardRoot, userPath);
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

    if (req.method === 'POST' && pathname === '/api/fs/write') {
      const body = await readJsonBody(req, res);
      if (body === null) return;
      if (typeof body.path !== 'string' || typeof body.content !== 'string') {
        sendText(res, 400, 'Body must be { path: string, content: string }');
        return;
      }
      const content = body.content;
      const target = resolveContained(boardRoot, body.path);
      if (!target.ok) {
        sendText(res, target.status, target.message);
        return;
      }
      try {
        // Writing the first release makes `releases/` as well, and that folder
        // is an *ancestor* of the file, so recording the file alone would let
        // the folder's own event through and refresh the tab that made it. A
        // recursive mkdir answers with nothing when every level already existed;
        // what it answers with otherwise is the platform's business (Windows
        // gives an extended-length path), so the folder recorded is the one we
        // asked for.
        const folder = path.dirname(target.abs);
        const created = await fs.mkdir(folder, { recursive: true });
        await fs.writeFile(target.abs, content, 'utf-8');
        noteWrite(target.abs, created === undefined ? undefined : folder);
        log.info(`write ${target.rel}: 204 (${content.length} chars)`);
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
      (pathname === '/api/fs/mkdir' || pathname === '/api/fs/remove')
    ) {
      const body = await readJsonBody(req, res);
      if (body === null) return;
      if (typeof body.path !== 'string') {
        sendText(res, 400, 'Body must be { path: string }');
        return;
      }
      const target = resolveContained(boardRoot, body.path);
      if (!target.ok) {
        sendText(res, target.status, target.message);
        return;
      }
      try {
        if (pathname === '/api/fs/mkdir') {
          // The event to skip here names the new directory itself, on its
          // parent's watcher — which is the path recorded.
          await fs.mkdir(target.abs, { recursive: true });
          noteWrite(target.abs);
          log.debug(`mkdir ${target.rel}: 204`);
        } else {
          await fs.rm(target.abs, { recursive: true, force: true });
          noteWrite(target.abs);
          // A removal changes the board on disk, so it belongs with writes
          // rather than in the debug-level noise.
          log.info(`remove ${target.rel}: 204`);
        }
        res.statusCode = 204;
        res.end();
      } catch (err) {
        log.error(`${pathname} ${target.rel}: 500`, err);
        sendText(res, 500, (err as Error).message);
      }
      return;
    }

    log.warn(`unknown endpoint: ${req.method} ${pathname}`);
    sendText(res, 404, `Unknown endpoint: ${req.method} ${pathname}`);
  } catch (err) {
    log.error(`unhandled failure for ${req.method} ${pathname}`, err);
    sendText(res, 500, (err as Error).message);
  }
};
