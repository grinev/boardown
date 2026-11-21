import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const { outputFiles } = await build({
  stdin: {
    contents: `
      export { readBoardFrontmatter } from './src/board-frontmatter';
      export { VsCodeFsAdapter } from './src/webview/VsCodeFsAdapter';
      export { loadBoard } from '@boardown/core';
    `,
    resolveDir: fileURLToPath(new URL('..', import.meta.url)),
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
});
const { readBoardFrontmatter, VsCodeFsAdapter, loadBoard } = await import(
  `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString('base64')}`
);

test('native file workspace obtains metadata through Node, not the workspace provider', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'boardown-vscode-docs-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const fsPath = join(root, 'page.md');
  const header = '---\ntitle: Native\n---';
  await writeFile(fsPath, `${header}\n\n${'body'.repeat(5000)}`);
  assert.equal(
    await readBoardFrontmatter({ scheme: 'file', fsPath }, () => {
      throw new Error('Native read unexpectedly called the virtual provider');
    }),
    header,
  );
});

test('virtual provider reads a whole file only to return its frontmatter', async () => {
  const header = '---\ntitle: Virtual\n---';
  let reads = 0;
  const result = await readBoardFrontmatter(
    { scheme: 'virtual', fsPath: '/not-a-local-file' },
    async () => {
      reads += 1;
      return new TextEncoder().encode(`\uFEFF${header}\n\nHidden body`);
    },
  );
  assert.equal(reads, 1);
  assert.equal(result, header);
});

test('VS Code webview makes no Docs calls during board load and keeps read modes distinct', async (t) => {
  let onMessage;
  const calls = [];
  const header = '---\ntitle: Page\n---';
  const content = `${header}\n\nWhole body`;
  globalThis.window = {
    addEventListener: (_, callback) => {
      onMessage = callback;
    },
  };
  t.after(() => {
    delete globalThis.window;
  });
  const adapter = new VsCodeFsAdapter({
    postMessage({ id, method, path }) {
      calls.push({ method, path });
      let answer = method === 'list' ? [] : null;
      if (path === 'config.yaml') {
        answer =
          method === 'stat'
            ? { lastModified: 1, size: 45 }
            : 'idPrefix: BD\nprojectName: Test\nnextId: 5\n';
      } else if (path === 'docs/page.md') {
        answer = method === 'readFrontmatter' ? header : content;
      }
      onMessage({ data: { type: 'fs-response', id, ok: true, result: answer } });
    },
  });
  assert.equal((await loadBoard(adapter)).kind, 'loaded');
  assert(calls.every(({ path }) => !path.startsWith('docs')));
  assert.equal(await adapter.read('docs/page.md', 'frontmatter'), header);
  assert.equal(await adapter.read('docs/page.md'), content);
  assert.deepEqual(
    calls.slice(-2).map(({ method }) => method),
    ['readFrontmatter', 'read'],
  );
});
