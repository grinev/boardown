import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Connect, Plugin } from 'vite';

interface DevFsPluginOptions {
  root: string;
  boardDir?: string;
}

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

const sendJson = (res: Parameters<Connect.NextHandleFunction>[1], status: number, body: unknown) => {
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

export function devFsPlugin(options: DevFsPluginOptions): Plugin {
  const boardRoot = path.resolve(options.root, options.boardDir ?? '.boardown');

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
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
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
              sendText(res, 200, content);
            } catch (err) {
              if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
                sendText(res, 404, `Not found: ${target.rel}`);
              } else {
                sendText(res, 500, (err as Error).message);
              }
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
              const names = entries.filter((e) => e.isFile()).map((e) => e.name);
              sendJson(res, 200, names);
            } catch (err) {
              if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
                sendText(res, 404, `Not found: ${target.rel}`);
              } else {
                sendText(res, 500, (err as Error).message);
              }
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
              sendJson(res, 200, { lastModified: stat.mtimeMs });
            } catch (err) {
              if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
                sendText(res, 404, `Not found: ${target.rel}`);
              } else {
                sendText(res, 500, (err as Error).message);
              }
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
              res.statusCode = 204;
              res.end();
            } catch (err) {
              sendText(res, 500, (err as Error).message);
            }
            return;
          }

          sendText(res, 404, `Unknown endpoint: ${req.method} ${url.pathname}`);
        } catch (err) {
          sendText(res, 500, (err as Error).message);
        }
      });
    },
  };
}
