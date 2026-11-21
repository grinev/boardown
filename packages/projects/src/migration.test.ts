import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import {
  defaultRegistryPath,
  defaultStatePath,
  openDefaultRegistry,
  openNamedRegistry,
  type RegistryHost,
} from './default-registry.js';
import { ProjectStateFile } from './project-state.js';
import { RegistryFile } from './registry-file.js';

let dir: string;
let host: RegistryHost;
let config: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'boardown-projects-'));
  host = {
    platform: process.platform,
    env: { XDG_CONFIG_HOME: dir, APPDATA: dir },
    homedir: () => dir,
  };
  config = path.dirname(defaultRegistryPath(host));
  await fs.mkdir(config, { recursive: true });
});
afterEach(async () => fs.rm(dir, { recursive: true, force: true }));

async function folder(...parts: string[]) {
  const file = path.join(dir, ...parts);
  await fs.mkdir(file, { recursive: true });
  return file;
}

it('imports both legacy sources once, preserving current IDs, remaining Web IDs and the original files', async () => {
  const [shared, oldShop, oldShop2, onDesktop, last, missing] = await Promise.all([
    folder('shared'),
    folder('old-site'),
    folder('old-shop2'),
    folder('desktop'),
    folder('latest'),
    Promise.resolve(path.join(dir, 'missing')),
  ]);
  const oldWeb = path.join(
    await folder(path.dirname(path.relative(dir, config)), 'boardown-web'),
    'projects.yaml',
  );
  const webText = `projects:\n  shop: ${oldShop}\n  shop-2: ${oldShop2}\n  old-shared: ${shared}\n`;
  const recentText = JSON.stringify([
    { folder: oldShop },
    { folder: onDesktop },
    { folder: missing },
  ]);
  const settingsText = JSON.stringify({ lastFolder: last, themeChoice: 'dark' });
  const recents = path.join(config, 'recent-folders.json');
  const settings = path.join(config, 'settings.json');
  await Promise.all([
    fs.writeFile(defaultRegistryPath(host), `# current\nprojects:\n  shop: ${shared}\n`),
    fs.writeFile(oldWeb, webText),
    fs.writeFile(recents, recentText),
    fs.writeFile(settings, settingsText),
  ]);

  const [web, electron] = await Promise.all([openDefaultRegistry(host), openDefaultRegistry(host)]);
  const readings = await Promise.all([web.read(), electron.read()]);
  expect(readings[1]).toEqual(readings[0]);
  expect(
    Object.fromEntries(readings[0]?.entries.map(({ id, projectRoot }) => [id, projectRoot]) ?? []),
  ).toEqual({
    shop: shared,
    'shop-2': oldShop2,
    'shop-3': oldShop,
    desktop: onDesktop,
    latest: last,
    missing,
  });
  expect(await fs.readFile(oldWeb, 'utf8')).toBe(webText);
  expect(await fs.readFile(recents, 'utf8')).toBe(recentText);
  expect(await fs.readFile(settings, 'utf8')).toBe(settingsText);
  expect((await new ProjectStateFile(defaultStatePath(host)).read()).defaultRegistryMigrated).toBe(
    true,
  );
  await electron.remove('shop-2');
  expect(
    (await (await openDefaultRegistry(host)).read()).entries.map(({ id }) => id),
  ).not.toContain('shop-2');
});

it('finishes an interrupted migration without duplicating an already imported row or discarding preferences', async () => {
  const project = await folder('legacy');
  const state = new ProjectStateFile(defaultStatePath(host));
  await state.update((current) => ({
    ...current,
    webLastProjectByRegistry: { [path.join(dir, 'named.yaml')]: 'named' },
  }));
  const registry = new RegistryFile(defaultRegistryPath(host), { absentIsEmpty: true });
  await registry.register(project, 'original');
  await fs.writeFile(
    path.join(config, 'recent-folders.json'),
    JSON.stringify([{ folder: project }]),
  );
  const reopened = await openDefaultRegistry(host);
  expect((await reopened.read()).entries.map(({ id }) => id)).toEqual(['original']);
  expect(await state.read()).toEqual({
    defaultRegistryMigrated: true,
    webLastProjectByRegistry: { [path.join(dir, 'named.yaml')]: 'named' },
  });
});

it('leaves the shared default and its migration unopened in named registry mode', async () => {
  const named = path.join(dir, 'named.yaml');
  const original = 'projects: {}\n';
  await fs.writeFile(named, original);
  const registry = await openNamedRegistry(named);
  await registry.register(await folder('other'));
  await expect(fs.stat(defaultRegistryPath(host))).rejects.toMatchObject({ code: 'ENOENT' });
  await expect(fs.stat(defaultStatePath(host))).rejects.toMatchObject({ code: 'ENOENT' });
});

it('keeps both writers and allocates distinct stable IDs to same-name folders', async () => {
  const a = await folder('a', 'Shop');
  const b = await folder('b', 'Shop');
  const file = defaultRegistryPath(host);
  const web = new RegistryFile(file, { absentIsEmpty: true });
  const electron = new RegistryFile(file, { absentIsEmpty: true });
  const ids = await Promise.all([web.register(a), electron.register(b)]);
  expect([...ids].sort()).toEqual(['shop', 'shop-2']);
  expect(await web.register(a, 'ignored')).toBe(ids[0]);
  await expect(web.register(a, ids[1])).rejects.toThrow(/already registered/);
  expect((await electron.read()).entries).toHaveLength(2);
});

it('updates the one state file concurrently without dropping either preference', async () => {
  const file = defaultStatePath(host);
  const a = path.join(dir, 'a.yaml');
  const b = path.join(dir, 'b.yaml');
  const write = (key: string, id: string) =>
    new ProjectStateFile(file).update((current) => ({
      ...current,
      webLastProjectByRegistry: { ...current.webLastProjectByRegistry, [key]: id },
    }));
  await Promise.all([write(a, 'alpha'), write(b, 'beta')]);
  expect((await new ProjectStateFile(file).read()).webLastProjectByRegistry).toEqual({
    [a]: 'alpha',
    [b]: 'beta',
  });
});

it('recovers a killed lock owner without making racing recoverers overlap', async () => {
  const file = defaultRegistryPath(host);
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 10000)'], {
    windowsHide: true,
  });
  const ended = once(child, 'exit');
  try {
    await once(child, 'spawn');
    await fs.writeFile(`${file}.lock-${child.pid ?? 0}-123abc.claim`, '1');
  } finally {
    child.kill();
    await ended;
  }
  const [a, b] = await Promise.all([folder('a'), folder('b')]);
  await Promise.all([
    new RegistryFile(file, { absentIsEmpty: true }).register(a),
    new RegistryFile(file, { absentIsEmpty: true }).register(b),
  ]);
  expect((await new RegistryFile(file).read()).entries.map(({ id }) => id).sort()).toEqual([
    'a',
    'b',
  ]);
  expect((await fs.readdir(config)).filter((name) => name.includes('.lock-'))).toEqual([]);
});

it('refuses a malformed legacy YAML without updating state or the shared registry', async () => {
  const legacyPath = path.join(path.dirname(config), 'boardown-web', 'projects.yaml');
  await fs.mkdir(path.dirname(legacyPath));
  await fs.writeFile(legacyPath, 'projects: [bad');
  const registry = await openDefaultRegistry(host);
  expect((await registry.read()).staleReason).toContain('Cannot import legacy registry');
  expect((await new ProjectStateFile(defaultStatePath(host)).read()).defaultRegistryMigrated).toBe(
    false,
  );
  await expect(fs.stat(defaultRegistryPath(host))).rejects.toMatchObject({ code: 'ENOENT' });
  expect(await fs.readFile(legacyPath, 'utf8')).toBe('projects: [bad');
});
