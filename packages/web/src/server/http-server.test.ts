import { promises as fs } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBoardownServer, isAllowedOrigin, isLoopbackHost } from './http-server';
import { RegistryFile } from './registry';
import { rootsFromProjectFolder } from './roots';

interface Reply {
  status: number;
  location?: string;
  body: string;
}

let server: http.Server | null = null;
let port = 0;
let dir = '';

const request = (
  requestPath: string,
  options: { method?: string; headers?: Record<string, string>; body?: string } = {},
): Promise<Reply> =>
  new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path: requestPath,
        method: options.method ?? 'GET',
        headers: options.headers,
      },
      (res) => {
        let body = '';
        res.setEncoding('utf-8');
        res.on('data', (chunk: string) => (body += chunk));
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            ...(typeof res.headers.location === 'string'
              ? { location: res.headers.location }
              : {}),
            body,
          }),
        );
      },
    );
    req.on('error', reject);
    if (options.body !== undefined) req.write(options.body);
    req.end();
  });

// A stream never ends, so it cannot go through `request`: the response headers
// are the answer, and the caller destroys it before the server is closed —
// otherwise `server.close()` waits on the socket for the rest of the run.
const openStream = (
  requestPath: string,
): Promise<{ status: number; contentType: string; close: () => void }> =>
  new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: requestPath }, (res) => {
      res.on('data', () => {});
      res.on('error', () => {});
      resolve({
        status: res.statusCode ?? 0,
        contentType: res.headers['content-type'] ?? '',
        close: () => req.destroy(),
      });
    });
    req.on('error', reject);
    req.end();
  });

const listen = (created: http.Server): Promise<number> =>
  new Promise((resolve) => {
    created.listen(0, '127.0.0.1', () => {
      const address = created.address();
      resolve(typeof address === 'object' && address !== null ? address.port : 0);
    });
  });

const writeBoard = async (folder: string, projectName: string): Promise<void> => {
  const boardRoot = rootsFromProjectFolder(folder).boardRoot;
  await fs.mkdir(boardRoot, { recursive: true });
  await fs.writeFile(
    path.join(boardRoot, 'config.yaml'),
    `idPrefix: SH\nnextId: 1\nprojectName: ${projectName}\n`,
    'utf-8',
  );
};

const clientDir = (): string => path.join(dir, 'client');

const start = async (
  mode: Parameters<typeof createBoardownServer>[0]['mode'],
  watch = true,
): Promise<void> => {
  // A test that starts a second server drops the first one, so it is closed here
  // rather than left listening for the rest of the run.
  if (server !== null) await new Promise((resolve) => server?.close(resolve));
  server = createBoardownServer({ mode, clientDir: clientDir(), watch });
  port = await listen(server);
};

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'boardown-server-'));
  await fs.mkdir(path.join(clientDir(), 'assets'), { recursive: true });
  await fs.writeFile(path.join(clientDir(), 'index.html'), '<html>THE APP</html>', 'utf-8');
  await fs.writeFile(path.join(clientDir(), 'assets', 'app.js'), 'export {};', 'utf-8');
});

afterEach(async () => {
  if (server !== null) {
    await new Promise((resolve) => server?.close(resolve));
    server = null;
  }
  await fs.rm(dir, { recursive: true, force: true });
});

describe('the loopback guard', () => {
  it('accepts the three names of the loopback interface', () => {
    expect(isLoopbackHost('127.0.0.1:7777')).toBe(true);
    expect(isLoopbackHost('localhost:7777')).toBe(true);
    expect(isLoopbackHost('[::1]:7777')).toBe(true);
    expect(isLoopbackHost('127.0.0.1')).toBe(true);
  });

  it('refuses anything else', () => {
    expect(isLoopbackHost('example.com')).toBe(false);
    expect(isLoopbackHost('192.168.1.4:7777')).toBe(false);
    expect(isLoopbackHost(undefined)).toBe(false);
  });

  it('allows an absent Origin and one naming this very server', () => {
    expect(isAllowedOrigin(undefined, '127.0.0.1:7777')).toBe(true);
    expect(isAllowedOrigin('http://127.0.0.1:7777', '127.0.0.1:7777')).toBe(true);
    expect(isAllowedOrigin('http://localhost:7777', 'localhost:7777')).toBe(true);
  });

  it('refuses another origin on the same loopback interface', () => {
    expect(isAllowedOrigin('http://127.0.0.1:3000', '127.0.0.1:7777')).toBe(false);
    expect(isAllowedOrigin('http://localhost:7777', '127.0.0.1:7777')).toBe(false);
    expect(isAllowedOrigin('https://127.0.0.1:7777', '127.0.0.1:7777')).toBe(false);
    expect(isAllowedOrigin('http://example.com', '127.0.0.1:7777')).toBe(false);
    expect(isAllowedOrigin('null', '127.0.0.1:7777')).toBe(false);
  });
});

describe('single-board mode', () => {
  beforeEach(async () => {
    await writeBoard(dir, 'Solo');
    await start({ kind: 'single', roots: rootsFromProjectFolder(dir) });
  });

  it('serves the app at the root', async () => {
    const reply = await request('/');
    expect(reply.status).toBe(200);
    expect(reply.body).toContain('THE APP');
  });

  it('serves the board through the api', async () => {
    const reply = await request('/api/fs/read?path=config.yaml');
    expect(reply.status).toBe(200);
    expect(reply.body).toContain('projectName: Solo');
  });

  it('serves the board event stream', async () => {
    const stream = await openStream('/api/events?client=a');
    expect(stream.status).toBe(200);
    expect(stream.contentType).toContain('text/event-stream');
    stream.close();
  });

  it('has no event stream under --no-watch, and still serves the board', async () => {
    await start({ kind: 'single', roots: rootsFromProjectFolder(dir) }, false);
    expect((await request('/api/events?client=a')).status).toBe(404);
    expect((await request('/api/fs/read?path=config.yaml')).status).toBe(200);
  });

  it('serves static assets', async () => {
    const reply = await request('/assets/app.js');
    expect(reply.status).toBe(200);
    expect(reply.body).toBe('export {};');
  });

  it('refuses a request from a foreign host', async () => {
    const reply = await request('/', { headers: { Host: 'example.com' } });
    expect(reply.status).toBe(403);
  });

  it('refuses a request carrying a foreign Origin', async () => {
    const reply = await request('/', { headers: { Origin: 'http://example.com' } });
    expect(reply.status).toBe(403);
  });
});

describe('registry mode', () => {
  let registryPath = '';
  let good = '';
  let empty = '';

  beforeEach(async () => {
    good = path.join(dir, 'good');
    empty = path.join(dir, 'empty');
    await writeBoard(good, 'Shop');
    await fs.mkdir(empty, { recursive: true });
    registryPath = path.join(dir, 'projects.yaml');
    await fs.writeFile(
      registryPath,
      `projects:\n  shop: ${good.replace(/\\/g, '/')}\n  empty: ${empty.replace(/\\/g, '/')}\n`,
      'utf-8',
    );
    await start({ kind: 'registry', registry: new RegistryFile(registryPath) });
  });

  it('lists the projects, naming the readable one and explaining the other', async () => {
    const reply = await request('/');
    expect(reply.status).toBe(200);
    expect(reply.body).toContain('Shop');
    expect(reply.body).toContain('no board yet');
    expect(reply.body).toContain('/b/shop/');
  });

  it('serves a board under its prefix', async () => {
    expect((await request('/b/shop/')).body).toContain('THE APP');
    const read = await request('/b/shop/api/fs/read?path=config.yaml');
    expect(read.status).toBe(200);
    expect(read.body).toContain('projectName: Shop');
  });

  it('writes through the prefixed api', async () => {
    const reply = await request('/b/shop/api/fs/write', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: 'docs/note.md', content: 'hello' }),
    });
    expect(reply.status).toBe(204);
    const written = await fs.readFile(
      path.join(rootsFromProjectFolder(good).boardRoot, 'docs', 'note.md'),
      'utf-8',
    );
    expect(written).toBe('hello');
  });

  it('serves an event stream per board, under that board prefix', async () => {
    const shop = await openStream('/b/shop/api/events?client=a');
    expect(shop.status).toBe(200);
    expect(shop.contentType).toContain('text/event-stream');
    shop.close();
    // An unregistered id has no board, so it has no stream either.
    expect((await request('/b/nope/api/events?client=a')).status).toBe(404);
  });

  it('redirects a prefix without its trailing slash', async () => {
    const reply = await request('/b/shop');
    expect(reply.status).toBe(308);
    expect(reply.location).toBe('/b/shop/');
  });

  it('answers an unknown id with 404', async () => {
    expect((await request('/b/nope/')).status).toBe(404);
  });

  it('answers an id that is not valid percent-encoding with 404', async () => {
    expect((await request('/b/%ZZ/')).status).toBe(404);
  });

  it('refuses a write carrying another origin from the same interface', async () => {
    const reply = await request('/b/shop/api/fs/write', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain', Origin: `http://127.0.0.1:${port + 1}` },
      body: JSON.stringify({ path: 'PWNED.md', content: 'x' }),
    });
    expect(reply.status).toBe(403);
    await expect(
      fs.stat(path.join(rootsFromProjectFolder(good).boardRoot, 'PWNED.md')),
    ).rejects.toThrow();
  });

  it('refuses a path escaping the board root', async () => {
    const reply = await request('/b/shop/api/fs/read?path=../../secrets.txt');
    expect(reply.status).toBe(400);
  });

  it('shares one copy of the assets across prefixes', async () => {
    expect((await request('/assets/app.js')).status).toBe(200);
  });

  it('reads a repo file under the prefix, from that project and no other', async () => {
    await fs.writeFile(path.join(good, 'notes.txt'), 'from the project folder', 'utf-8');
    const reply = await request('/b/shop/api/project-file?path=notes.txt');
    expect(reply.status).toBe(200);
    expect(JSON.parse(reply.body)).toEqual({ kind: 'text', text: 'from the project folder' });

    // The same name in another project is not this project's file.
    expect(JSON.parse((await request('/b/empty/api/project-file?path=notes.txt')).body)).toEqual({
      kind: 'not-found',
    });
    // And the reader cannot climb out of the project it was given.
    expect(
      JSON.parse((await request('/b/shop/api/project-file?path=../projects.yaml')).body),
    ).toEqual({ kind: 'unreadable' });
  });

  it('reads git commits under the prefix, against that project folder', async () => {
    const reply = await request('/b/shop/api/git/commits?task=TS-1');
    expect(reply.status).toBe(200);
    // The temp project is not a repository, which is a successful read.
    expect(JSON.parse(reply.body)).toEqual({ state: 'not-a-repository', commits: [] });
  });

  it('stops serving a project once it leaves the registry', async () => {
    expect((await request('/b/shop/api/fs/read?path=config.yaml')).status).toBe(200);
    await fs.writeFile(registryPath, `projects:\n  empty: ${empty.replace(/\\/g, '/')}\n`, 'utf-8');
    await fs.utimes(registryPath, new Date(), new Date(Date.now() + 1000));
    expect((await request('/b/shop/api/fs/read?path=config.yaml')).status).toBe(404);
    expect((await request('/')).body).not.toContain('/b/shop/');
  });

  it('keeps serving the last good registry when a re-read fails', async () => {
    // The bin reads the registry once before it listens, so a running server
    // always has a mapping behind it; this stands in for that first read.
    expect((await request('/')).status).toBe(200);
    await fs.writeFile(registryPath, 'projects:\n  - [unclosed\n', 'utf-8');
    await fs.utimes(registryPath, new Date(), new Date(Date.now() + 1000));
    const list = await request('/');
    expect(list.status).toBe(200);
    expect(list.body).toContain('last version that loaded');
    expect((await request('/b/shop/api/fs/read?path=config.yaml')).status).toBe(200);
  });
});

describe('the registry endpoints', () => {
  let registryFile = '';
  let projectA = '';
  let projectB = '';

  const post = (endpoint: string, body: unknown): Promise<Reply> =>
    request(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  const registryText = (): Promise<string> => fs.readFile(registryFile, 'utf-8');

  beforeEach(async () => {
    registryFile = path.join(dir, 'projects.yaml');
    projectA = path.join(dir, 'alpha');
    projectB = path.join(dir, 'beta');
    await fs.mkdir(projectA, { recursive: true });
    await fs.mkdir(projectB, { recursive: true });
    await writeBoard(projectA, 'Alpha');
    await fs.writeFile(registryFile, `# mine\nprojects:\n  alpha: ${projectA}\n`, 'utf-8');
    await start({ kind: 'registry', registry: new RegistryFile(registryFile) });
  });

  it('adds a project and answers with the list it is now', async () => {
    const reply = await post('/api/projects/add', { path: projectB, id: 'beta' });
    expect(reply.status).toBe(200);
    const html = (JSON.parse(reply.body) as { html: string }).html;
    expect(html).toContain('/b/beta/');
    expect(html).toContain('no board yet');
    expect(await registryText()).toBe(`# mine\nprojects:\n  alpha: ${projectA}\n  beta: ${projectB}\n`);
  });

  it('shows the new project on the page too', async () => {
    await post('/api/projects/add', { path: projectB, id: 'beta' });
    expect((await request('/')).body).toContain('/b/beta/');
  });

  it('creates a registry file that was not there', async () => {
    const fresh = path.join(dir, 'fresh', 'projects.yaml');
    await start({ kind: 'registry', registry: new RegistryFile(fresh, { absentIsEmpty: true }) });
    const reply = await post('/api/projects/add', { path: projectA, id: 'alpha' });
    expect(reply.status).toBe(200);
    expect(await fs.readFile(fresh, 'utf-8')).toBe(`projects:\n  alpha: ${projectA}\n`);
  });

  it('refuses a path that names nothing, at the path field', async () => {
    const reply = await post('/api/projects/add', {
      path: path.join(dir, 'nowhere'),
      id: 'gamma',
    });
    expect(reply.status).toBe(400);
    expect(JSON.parse(reply.body)).toMatchObject({ field: 'path' });
  });

  it('refuses a folder already registered, at the path field', async () => {
    const reply = await post('/api/projects/add', { path: projectA, id: 'second' });
    expect(reply.status).toBe(400);
    expect(JSON.parse(reply.body)).toMatchObject({ field: 'path' });
  });

  it('refuses an id already taken, and one that is no URL segment', async () => {
    expect(JSON.parse((await post('/api/projects/add', { path: projectB, id: 'alpha' })).body))
      .toMatchObject({ field: 'id' });
    expect(JSON.parse((await post('/api/projects/add', { path: projectB, id: 'Beta One' })).body))
      .toMatchObject({ field: 'id' });
    expect(await registryText()).not.toContain('beta');
  });

  it('removes a project and leaves its files alone', async () => {
    const reply = await post('/api/projects/remove', { id: 'alpha' });
    expect(reply.status).toBe(200);
    expect(await registryText()).toBe('# mine\nprojects: {}\n');
    expect((await fs.stat(path.join(projectA, '.boardown', 'config.yaml'))).isFile()).toBe(true);
  });

  it('reports success for an id that is already gone', async () => {
    const reply = await post('/api/projects/remove', { id: 'nobody' });
    expect(reply.status).toBe(200);
    expect(await registryText()).toContain('alpha:');
  });

  it('refuses both writes while the registry cannot be read', async () => {
    await fs.writeFile(registryFile, 'projects:\n  - [unclosed\n', 'utf-8');
    const add = await post('/api/projects/add', { path: projectB, id: 'beta' });
    const remove = await post('/api/projects/remove', { id: 'alpha' });
    expect(add.status).toBe(409);
    expect(remove.status).toBe(409);
    expect(JSON.parse(add.body)).toMatchObject({ field: null });
    expect(await registryText()).toBe('projects:\n  - [unclosed\n');
  });

  it('writes against the file as it is, not as it was loaded', async () => {
    await request('/');
    await fs.writeFile(
      registryFile,
      `# mine\nprojects:\n  alpha: ${projectA}\n  byhand: ${projectB}\n`,
      'utf-8',
    );
    const reply = await post('/api/projects/remove', { id: 'alpha' });
    expect(reply.status).toBe(200);
    expect(await registryText()).toBe(`# mine\nprojects:\n  byhand: ${projectB}\n`);
  });

  it('answers a body of the wrong shape with a 400', async () => {
    expect((await post('/api/projects/add', { path: projectB })).status).toBe(400);
    expect((await post('/api/projects/remove', {})).status).toBe(400);
  });

  it('has no such endpoints in single-board mode', async () => {
    await start({ kind: 'single', roots: rootsFromProjectFolder(projectA) });
    expect((await post('/api/projects/add', { path: projectB, id: 'beta' })).status).toBe(404);
  });
});
