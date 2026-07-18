import { DOCS_DIR, sanitizeFilenameForFs } from './board-ops.js';
import type { DocPage } from './schemas.js';

// The docs tree mirrors the folder structure under `.boardown/docs/`. Folders
// are real entities the user creates and deletes, so an empty one is a valid
// node rather than something to prune.
export interface DocFolder {
  path: string;
  name: string;
  folders: DocFolder[];
  pages: DocPage[];
  // Files present in this folder that the tree does not show: non-markdown, and
  // markdown the parser could not understand. They are invisible to the user but
  // still own their names, so creating a page or a folder must avoid them —
  // boardown never rewrites a file it failed to parse.
  otherEntries: string[];
}

export const emptyDocsTree = (): DocFolder => ({
  path: DOCS_DIR,
  name: DOCS_DIR,
  folders: [],
  pages: [],
  otherEntries: [],
});

export const docPageTitle = (page: DocPage): string => {
  const title = page.frontmatter.title;
  return title !== undefined && title.trim() !== '' ? title : page.slug;
};

// Folders first, then pages, alphabetically within each group — the convention
// of every file tree.
const byName = (a: string, b: string): number => a.localeCompare(b);

export const sortDocsTree = (folder: DocFolder): DocFolder => ({
  ...folder,
  folders: [...folder.folders].sort((a, b) => byName(a.name, b.name)).map(sortDocsTree),
  pages: [...folder.pages].sort((a, b) => byName(docPageTitle(a), docPageTitle(b))),
});

export const findDocFolder = (root: DocFolder, path: string): DocFolder | null => {
  if (root.path === path) return root;
  for (const child of root.folders) {
    const found = findDocFolder(child, path);
    if (found !== null) return found;
  }
  return null;
};

export const findDocPage = (root: DocFolder, path: string): DocPage | null => {
  const page = root.pages.find((p) => p.path === path);
  if (page !== undefined) return page;
  for (const child of root.folders) {
    const found = findDocPage(child, path);
    if (found !== null) return found;
  }
  return null;
};

// The folder a new page or folder lands in: the selected folder, the folder
// holding the selected page, or the docs root when nothing is selected.
export const targetDocFolder = (root: DocFolder, selectedPath: string | null): DocFolder => {
  if (selectedPath === null) return root;
  const folder = findDocFolder(root, selectedPath);
  if (folder !== null) return folder;
  const parentPath = selectedPath.slice(0, selectedPath.lastIndexOf('/'));
  return findDocFolder(root, parentPath) ?? root;
};

export const docPagesBeneath = (folder: DocFolder): DocPage[] => [
  ...folder.pages,
  ...folder.folders.flatMap(docPagesBeneath),
];

export const isInsideDocFolder = (folder: DocFolder, path: string): boolean =>
  path === folder.path || path.startsWith(`${folder.path}/`);

// Only an empty folder can be deleted, so nothing the user cannot see goes with
// it. `otherEntries` counts: a folder holding a file the tree does not show is
// not empty, and deleting it would take that file too.
export const isDocFolderEmpty = (folder: DocFolder): boolean =>
  folder.folders.length === 0 && folder.pages.length === 0 && folder.otherEntries.length === 0;

// A title turns into a filename with the same rules releases use. Unlike a
// release, a collision is not an error the user can see coming — the filename is
// derived, not typed — so it gets a numeric suffix instead of throwing.
export const docFilenameForTitle = (title: string, folder: DocFolder): string => {
  const base = sanitizeFilenameForFs(title) || 'page';
  const taken = new Set([
    ...folder.pages.map((p) => p.slug.toLowerCase()),
    ...folder.otherEntries
      .filter((n) => n.toLowerCase().endsWith('.md'))
      .map((n) => n.slice(0, -3).toLowerCase()),
  ]);
  if (!taken.has(base.toLowerCase())) return `${base}.md`;
  let n = 2;
  while (taken.has(`${base}-${n}`.toLowerCase())) n++;
  return `${base}-${n}.md`;
};

export const docPagePath = (folder: DocFolder, filename: string): string =>
  `${folder.path}/${filename}`;

export type DocFolderNameError = 'empty' | 'separator' | 'taken';

// A folder name is typed literally, so it is validated rather than sanitized:
// silently turning `a/b` into `a-b` would create a folder the user did not ask
// for. One level at a time, and nothing that escapes `docs/`.
export const validateDocFolderName = (
  name: string,
  parent: DocFolder,
): DocFolderNameError | null => {
  const trimmed = name.trim();
  if (trimmed === '') return 'empty';
  if (trimmed.includes('/') || trimmed.includes('\\') || trimmed === '.' || trimmed === '..') {
    return 'separator';
  }
  const lower = trimmed.toLowerCase();
  if (parent.folders.some((f) => f.name.toLowerCase() === lower)) return 'taken';
  if (parent.pages.some((p) => p.slug.toLowerCase() === lower)) return 'taken';
  if (parent.otherEntries.some((n) => n.toLowerCase() === lower)) return 'taken';
  return null;
};

const replaceFolder = (root: DocFolder, target: string, next: DocFolder): DocFolder => {
  if (root.path === target) return next;
  return {
    ...root,
    folders: root.folders.map((f) => replaceFolder(f, target, next)),
  };
};

export const addDocPage = (root: DocFolder, folderPath: string, page: DocPage): DocFolder => {
  const folder = findDocFolder(root, folderPath);
  if (folder === null) throw new Error(`Unknown docs folder: ${folderPath}`);
  return sortDocsTree(replaceFolder(root, folderPath, { ...folder, pages: [...folder.pages, page] }));
};

export const addDocFolder = (root: DocFolder, parentPath: string, name: string): DocFolder => {
  const parent = findDocFolder(root, parentPath);
  if (parent === null) throw new Error(`Unknown docs folder: ${parentPath}`);
  const created: DocFolder = {
    path: `${parent.path}/${name}`,
    name,
    folders: [],
    pages: [],
    otherEntries: [],
  };
  return sortDocsTree(
    replaceFolder(root, parentPath, { ...parent, folders: [...parent.folders, created] }),
  );
};

export const replaceDocPage = (root: DocFolder, page: DocPage): DocFolder =>
  sortDocsTree({
    ...root,
    pages: root.pages.map((p) => (p.path === page.path ? page : p)),
    folders: root.folders.map((f) => replaceDocPage(f, page)),
  });

export const removeDocPage = (root: DocFolder, path: string): DocFolder => ({
  ...root,
  pages: root.pages.filter((p) => p.path !== path),
  folders: root.folders.map((f) => removeDocPage(f, path)),
});

export const removeDocFolder = (root: DocFolder, path: string): DocFolder => ({
  ...root,
  folders: root.folders.filter((f) => f.path !== path).map((f) => removeDocFolder(f, path)),
});
