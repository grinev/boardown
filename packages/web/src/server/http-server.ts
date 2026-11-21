import { promises as fs } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { describeEntry, isProjectDirectory, type RegistryFile } from '@boardown/projects';
import {
  BOARD_FS_PREFIX,
  handleBoardFs,
  handleProjectFile,
  resolveContained,
  sendText,
} from '../api/board-api.js';
import { createBoardWatchHub, type BoardWatchHub } from '../api/board-events.js';
import { buildPageBoot, stampPage } from '../api/page-boot.js';
import { handleSharedTheme, type SharedConfigSource } from '../api/shared-config.js';
import { BOARD_EVENTS_ENDPOINT } from '../board-events-endpoint.js';
import { PROJECT_FILE_ENDPOINT } from '../project-file-endpoint.js';
import { GIT_COMMITS_ENDPOINT } from '../git-history-endpoint.js';
import { SHARED_THEME_ENDPOINT } from '../shared-theme-endpoint.js';
import { handleGitCommits } from '../api/git-history.js';
import { isEmbedRequested } from '../embed-param.js';
import {
  PROJECTS_ENDPOINT,
  PROJECTS_THEME_EVENTS,
  type RegistryBoot,
} from '../projects-endpoint.js';
import { chooseFolder } from './folder-chooser.js';
import type { ProjectPreference } from './project-preference.js';
import { handleProjects } from './projects-api.js';
import type { BoardRoots } from './roots.js';

export type ServeMode =
  | { kind: 'single'; roots: BoardRoots }
  | { kind: 'registry'; registry: RegistryFile };

export interface ServerOptions {
  mode: ServeMode;
  /** Directory holding the built client — index.html and its assets. */
  clientDir: string;
  /**
   * Watch each open board and push a refresh on external changes. Off is
   * `--no-watch`, and then no hub exists at all: the events endpoint is never
   * routed, so the browser's one attempt 404s and it stops asking.
   */
  watch?: boolean;
  /** `--config-dir`, already read once: a host that could not read it never starts. */
  sharedConfig?: SharedConfigSource;
  preference?: ProjectPreference;
  pickFolder?: () => Promise<string | null>;
}

export const LOOPBACK_HOST = '127.0.0.1';

const LOOPBACK_NAMES = new Set(['127.0.0.1', 'localhost', '::1']);

// A Host header carries an optional port and may bracket an IPv6 literal.
const hostnameOf = (value: string): string => {
  const trimmed = value.trim();
  if (trimmed.startsWith('[')) {
    const end = trimmed.indexOf(']');
    return end === -1 ? trimmed.slice(1) : trimmed.slice(1, end);
  }
  const lastColon = trimmed.lastIndexOf(':');
  // More than one colon and no brackets means a bare IPv6 literal, not a port.
  if (lastColon !== -1 && trimmed.indexOf(':') === lastColon) {
    return trimmed.slice(0, lastColon);
  }
  return trimmed;
};

// All three name the loopback interface, and `localhost` is what a user types
// and what a bookmark holds — refusing it would read as a bug rather than a rule.
export const isLoopbackHost = (value: string | undefined): boolean =>
  value !== undefined && LOOPBACK_NAMES.has(hostnameOf(value).toLowerCase());

// Absent is fine — a browser sends no Origin on a plain cross-document GET, and
// a request from a local process has none either; such a process already has the
// filesystem. Present means a page sent it, and then it must be *this* server:
// the whole origin, not just the host. Another port on the loopback interface is
// another origin, and a write there is CORS-safelisted — text/plain skips the
// preflight, so the write lands before anything can refuse it.
//
// The Host header is the comparison because the browser sets it to the server it
// connected to, and a page served by this one sends the same name in both.
export const isAllowedOrigin = (value: string | undefined, host: string | undefined): boolean => {
  if (value === undefined) return true;
  if (host === undefined) return false;
  try {
    const origin = new URL(value);
    return origin.protocol === 'http:' && origin.host.toLowerCase() === host.trim().toLowerCase();
  } catch {
    return false;
  }
};

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

const BOARD_PATH_PATTERN = /^\/b\/([^/]+)(\/.*)?$/;

export const createBoardownServer = (options: ServerOptions): http.Server => {
  const clientDir = path.resolve(options.clientDir);
  const watch: BoardWatchHub | undefined =
    options.watch === false
      ? undefined
      : createBoardWatchHub(
          options.sharedConfig === undefined ? {} : { configDir: options.sharedConfig.dir },
        );

  const sendFile = async (res: http.ServerResponse, abs: string): Promise<void> => {
    try {
      const body = await fs.readFile(abs);
      res.statusCode = 200;
      res.setHeader(
        'Content-Type',
        MIME_TYPES[path.extname(abs).toLowerCase()] ?? 'application/octet-stream',
      );
      res.end(body);
    } catch {
      sendText(res, 404, 'Not found');
    }
  };

  // Stamped per request with the theme this board settles on, and never stored by
  // the browser: a copy kept from an earlier visit would carry the theme of then.
  const sendApp = async (
    res: http.ServerResponse,
    boardRoot: string | undefined,
    registry?: RegistryBoot,
    status = 200,
  ): Promise<void> => {
    let html: string;
    try {
      html = await fs.readFile(path.join(clientDir, 'index.html'), 'utf-8');
    } catch {
      sendText(res, 404, 'Not found');
      return;
    }
    const boot = await buildPageBoot(boardRoot, options.sharedConfig);
    res.statusCode = status;
    res.setHeader('Content-Type', MIME_TYPES['.html'] ?? 'text/html');
    res.setHeader('Cache-Control', 'no-store');
    res.end(stampPage(html, registry === undefined ? boot : { ...boot, registry }));
  };

  // The static route resolves a request path against a directory just like the
  // board routes do, so it goes through the same containment rule — this one is
  // a read path outside any board, in a process that can write to every
  // registered one.
  const sendStatic = async (res: http.ServerResponse, pathname: string): Promise<void> => {
    const target = resolveContained(clientDir, pathname.slice(1));
    if (!target.ok) {
      sendText(res, target.status, target.message);
      return;
    }
    await sendFile(res, target.abs);
  };

  const serveBoard = async (
    req: http.IncomingMessage,
    res: http.ServerResponse,
    rest: string,
    params: URLSearchParams,
    roots: BoardRoots,
  ): Promise<void> => {
    if (rest === '/' || rest === '') {
      await sendApp(res, roots.boardRoot);
      return;
    }
    if (rest.startsWith(BOARD_FS_PREFIX)) {
      await handleBoardFs(req, res, rest, params, roots.boardRoot, watch);
      return;
    }
    if (req.method === 'GET' && rest === PROJECT_FILE_ENDPOINT) {
      await handleProjectFile(res, params, roots.projectRoot);
      return;
    }
    if (req.method === 'GET' && rest === GIT_COMMITS_ENDPOINT) {
      await handleGitCommits(res, params, roots.projectRoot);
      return;
    }
    if (req.method === 'GET' && rest === SHARED_THEME_ENDPOINT) {
      await handleSharedTheme(res, options.sharedConfig);
      return;
    }
    // The board root comes from whichever registry entry this request resolved
    // to, which is the whole of what keeps one board's changes off another
    // board's tabs.
    if (watch !== undefined && req.method === 'GET' && rest === BOARD_EVENTS_ENDPOINT) {
      watch.openStream(res, params, roots.boardRoot);
      return;
    }
    sendText(res, 404, `Not found: ${rest}`);
  };

  const route = async (req: http.IncomingMessage, res: http.ServerResponse): Promise<void> => {
    if (
      !isLoopbackHost(req.headers.host) ||
      !isAllowedOrigin(req.headers.origin, req.headers.host)
    ) {
      sendText(res, 403, 'boardown-web serves the loopback interface only');
      return;
    }
    const url = new URL(req.url ?? '/', `http://${LOOPBACK_HOST}`);
    const pathname = url.pathname;

    if (options.mode.kind === 'single') {
      const roots = options.mode.roots;
      if (pathname === '/' || pathname.startsWith('/api/')) {
        await serveBoard(req, res, pathname, url.searchParams, roots);
        return;
      }
      await sendStatic(res, pathname);
      return;
    }

    const registry = options.mode.registry;
    const board = BOARD_PATH_PATTERN.exec(pathname);
    if (board === null) {
      if (req.method === 'GET' && pathname === SHARED_THEME_ENDPOINT) {
        await handleSharedTheme(res, options.sharedConfig);
        return;
      }
      if (req.method === 'GET' && pathname === PROJECTS_THEME_EVENTS) {
        if (watch === undefined || options.sharedConfig === undefined)
          sendText(res, 404, 'Not found');
        else watch.openThemeStream(res);
        return;
      }
      if (pathname === PROJECTS_ENDPOINT || pathname.startsWith(`${PROJECTS_ENDPOINT}/`)) {
        await handleProjects(req, res, url, {
          registry,
          pickFolder: options.pickFolder ?? chooseFolder,
          ...(options.preference === undefined ? {} : { preference: options.preference }),
        });
        return;
      }
      if (pathname === '/') {
        const state = await registry.read();
        let error = state.staleReason;
        let remembered: string | null = null;
        try {
          remembered = (await options.preference?.read()) ?? null;
        } catch (err) {
          error ??= err instanceof Error ? err.message : String(err);
        }
        const entry = state.entries.find((candidate) => candidate.id === remembered);
        const row = entry === undefined ? null : await describeEntry(entry);
        const project = row?.available === true ? row : null;
        await sendApp(res, project === null ? undefined : entry?.boardRoot, {
          id: project?.id ?? null,
          project,
          restored: project !== null,
          embedded: false,
          error,
        });
        return;
      }
      await sendStatic(res, pathname);
      return;
    }

    // A segment that is not valid percent-encoding cannot name anything the
    // registry holds, so it is an unknown id rather than a failure.
    let id: string;
    try {
      id = decodeURIComponent(board[1] ?? '');
    } catch {
      id = '';
    }
    const rest = board[2];
    if (rest === undefined) {
      // The page derives its own prefix from the path it was loaded at, so the
      // trailing slash is not cosmetic.
      res.statusCode = 308;
      res.setHeader('Location', `${pathname}/${url.search}`);
      res.end();
      return;
    }
    const state = await registry.read();
    const entry = state.entries.find((candidate) => candidate.id === id);
    if (rest === '/') {
      const project = entry === undefined ? null : await describeEntry(entry);
      await sendApp(
        res,
        project?.available === true ? entry?.boardRoot : undefined,
        {
          id,
          project,
          restored: false,
          embedded: isEmbedRequested(url.search),
          error: state.staleReason,
        },
        entry === undefined ? 404 : 200,
      );
      return;
    }
    if (entry === undefined) {
      sendText(res, 404, `No board registered as "${id}"`);
      return;
    }
    if (!(await isProjectDirectory(entry.projectRoot))) {
      sendText(res, 404, 'Project folder is unavailable');
      return;
    }
    await serveBoard(req, res, rest, url.searchParams, entry);
  };

  return http.createServer((req, res) => {
    void route(req, res).catch((err: unknown) => {
      sendText(res, 500, err instanceof Error ? err.message : String(err));
    });
  });
};
