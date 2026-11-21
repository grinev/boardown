import {
  docPageTitle,
  docPathFromRefToken,
  findDocPage,
  type DocPage,
  type DocRead,
  type DocsTreeRead,
  type ParseProblem,
} from '@boardown/core';

export type DocsTreeState =
  | { kind: 'idle' | 'loading' }
  | { kind: 'error'; message: string }
  | ({ kind: 'ready' } & DocsTreeRead);

export type DocPageState = DocRead<DocPage> | { kind: 'loading' };
export type DocPages = Readonly<Record<string, DocPageState | undefined>>;

export const docPathLabel = (path: string): string =>
  path.slice(path.lastIndexOf('/') + 1, -'.md'.length);

export const wikiDocLink = (tree: DocsTreeState, pages: DocPages, token: string) => {
  const path = docPathFromRefToken(token);
  if (path === null) return null;
  const body = pages[path];
  if (body?.kind === 'ready') return { path, title: docPageTitle(body.value) };
  if (body?.kind === 'missing') return null;
  if (tree.kind === 'ready') {
    const metadata = findDocPage(tree.tree, path);
    if (metadata !== null) return { path, title: docPageTitle(metadata) };
    if (body === undefined && !tree.problems.some((problem) => problem.file === path)) return null;
  }
  return { path, title: docPathLabel(path) };
};

export const docsProblems = (tree: DocsTreeState, pages: DocPages): ParseProblem[] => {
  const byFile = new Map(tree.kind === 'ready' ? tree.problems.map((p) => [p.file, p]) : []);
  for (const [path, page] of Object.entries(pages)) {
    if (page?.kind === 'error') byFile.set(path, page.problem);
    else if (page?.kind === 'ready' || page?.kind === 'missing') byFile.delete(path);
  }
  return [...byFile.values()];
};
