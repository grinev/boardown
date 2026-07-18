import { describe, expect, it } from 'vitest';
import {
  type DocFolder,
  addDocFolder,
  addDocPage,
  docFilenameForTitle,
  docPageTitle,
  docPagesBeneath,
  emptyDocsTree,
  findDocFolder,
  findDocPage,
  isDocFolderEmpty,
  isInsideDocFolder,
  removeDocFolder,
  removeDocPage,
  sortDocsTree,
  targetDocFolder,
  validateDocFolderName,
} from './docs.js';
import type { DocPage } from './schemas.js';

const page = (path: string, title?: string): DocPage => ({
  path,
  slug: path.slice(path.lastIndexOf('/') + 1).replace(/\.md$/, ''),
  frontmatter: title === undefined ? {} : { title },
  body: '',
});

const tree = (): DocFolder => ({
  path: 'docs',
  name: 'docs',
  folders: [
    {
      path: 'docs/guides',
      name: 'guides',
      folders: [],
      pages: [page('docs/guides/setup.md', 'Setup')],
      otherEntries: [],
    },
  ],
  pages: [page('docs/intro.md', 'Intro')],
  otherEntries: [],
});

describe('docPageTitle', () => {
  it('falls back to the slug when the page carries no title', () => {
    expect(docPageTitle(page('docs/release-process.md'))).toBe('release-process');
  });

  it('falls back to the slug for a blank title', () => {
    expect(docPageTitle(page('docs/a.md', '   '))).toBe('a');
  });
});

describe('sortDocsTree', () => {
  it('orders folders and pages alphabetically at every level', () => {
    const unsorted: DocFolder = {
      path: 'docs',
      name: 'docs',
      folders: [
        { path: 'docs/z', name: 'z', folders: [], pages: [], otherEntries: [] },
        {
          path: 'docs/a',
          name: 'a',
          folders: [],
          pages: [page('docs/a/b.md', 'Beta'), page('docs/a/a.md', 'Alpha')],
          otherEntries: [],
        },
      ],
      pages: [page('docs/z.md', 'Zulu'), page('docs/a.md', 'Alpha')],
      otherEntries: [],
    };
    const sorted = sortDocsTree(unsorted);
    expect(sorted.folders.map((f) => f.name)).toEqual(['a', 'z']);
    expect(sorted.pages.map(docPageTitle)).toEqual(['Alpha', 'Zulu']);
    expect(sorted.folders[0]!.pages.map(docPageTitle)).toEqual(['Alpha', 'Beta']);
  });
});

describe('docFilenameForTitle', () => {
  it('derives a slug filename with the release rules', () => {
    expect(docFilenameForTitle('Release Process', emptyDocsTree())).toBe('release-process.md');
  });

  it('preserves unicode and emoji', () => {
    expect(docFilenameForTitle('Гайд по релизам 🚀', emptyDocsTree())).toBe(
      'гайд-по-релизам-🚀.md',
    );
  });

  it('suffixes rather than overwriting an existing page', () => {
    const folder: DocFolder = { ...emptyDocsTree(), pages: [page('docs/setup.md', 'Setup')] };
    expect(docFilenameForTitle('Setup', folder)).toBe('setup-2.md');
  });

  it('keeps suffixing past the first collision', () => {
    const folder: DocFolder = {
      ...emptyDocsTree(),
      pages: [page('docs/setup.md'), page('docs/setup-2.md')],
    };
    expect(docFilenameForTitle('Setup', folder)).toBe('setup-3.md');
  });

  it('avoids the name of a markdown file the parser could not understand', () => {
    // The broken page is invisible in the tree, but overwriting it would destroy
    // a file boardown never managed to read.
    const folder: DocFolder = { ...emptyDocsTree(), otherEntries: ['todo.md'] };
    expect(docFilenameForTitle('Todo', folder)).toBe('todo-2.md');
  });

  it('ignores a non-markdown neighbour, whose name cannot collide', () => {
    const folder: DocFolder = { ...emptyDocsTree(), otherEntries: ['diagram.png'] };
    expect(docFilenameForTitle('Diagram', folder)).toBe('diagram.md');
  });

  it('falls back to a usable name when the title sanitizes to nothing', () => {
    expect(docFilenameForTitle('///', emptyDocsTree())).toBe('page.md');
  });
});

describe('validateDocFolderName', () => {
  const root = tree();

  it('accepts a plain name', () => {
    expect(validateDocFolderName('drafts', root)).toBeNull();
  });

  it('rejects an empty or blank name', () => {
    expect(validateDocFolderName('', root)).toBe('empty');
    expect(validateDocFolderName('   ', root)).toBe('empty');
  });

  it('rejects path separators and dot-dot, so nothing escapes docs/', () => {
    expect(validateDocFolderName('a/b', root)).toBe('separator');
    expect(validateDocFolderName('a\\b', root)).toBe('separator');
    expect(validateDocFolderName('..', root)).toBe('separator');
  });

  it('rejects a name already taken by a folder or by a page at that level', () => {
    expect(validateDocFolderName('guides', root)).toBe('taken');
    expect(validateDocFolderName('GUIDES', root)).toBe('taken');
    expect(validateDocFolderName('intro', root)).toBe('taken');
  });

  it('rejects a name taken by a file the tree does not show', () => {
    const withHidden: DocFolder = { ...emptyDocsTree(), otherEntries: ['notes.txt', 'bad.md'] };
    expect(validateDocFolderName('notes.txt', withHidden)).toBe('taken');
    expect(validateDocFolderName('bad.md', withHidden)).toBe('taken');
  });
});

describe('targetDocFolder', () => {
  const root = tree();

  it('is the root when nothing is selected', () => {
    expect(targetDocFolder(root, null).path).toBe('docs');
  });

  it('is the selected folder itself', () => {
    expect(targetDocFolder(root, 'docs/guides').path).toBe('docs/guides');
  });

  it('is the folder holding the selected page', () => {
    expect(targetDocFolder(root, 'docs/guides/setup.md').path).toBe('docs/guides');
  });

  it('falls back to the root for an unknown path', () => {
    expect(targetDocFolder(root, 'docs/gone/away.md').path).toBe('docs');
  });
});

describe('tree mutation', () => {
  it('adds a page into a nested folder and keeps the order sorted', () => {
    const next = addDocPage(tree(), 'docs/guides', page('docs/guides/aaa.md', 'Aaa'));
    expect(findDocFolder(next, 'docs/guides')!.pages.map(docPageTitle)).toEqual(['Aaa', 'Setup']);
  });

  it('adds an empty folder', () => {
    const next = addDocFolder(tree(), 'docs', 'drafts');
    const created = findDocFolder(next, 'docs/drafts');
    expect(created).not.toBeNull();
    expect(created!.pages).toEqual([]);
  });

  it('removes a page and leaves its siblings alone', () => {
    const next = removeDocPage(tree(), 'docs/guides/setup.md');
    expect(findDocPage(next, 'docs/guides/setup.md')).toBeNull();
    expect(findDocPage(next, 'docs/intro.md')).not.toBeNull();
  });

  it('removes a folder from the tree', () => {
    const next = removeDocFolder(tree(), 'docs/guides');
    expect(findDocFolder(next, 'docs/guides')).toBeNull();
  });
});

describe('isDocFolderEmpty', () => {
  it('is true only when the folder holds nothing at all', () => {
    expect(isDocFolderEmpty(emptyDocsTree())).toBe(true);
  });

  it('is false when the folder holds a page', () => {
    expect(isDocFolderEmpty(findDocFolder(tree(), 'docs/guides')!)).toBe(false);
  });

  it('is false when the folder holds a subfolder', () => {
    expect(isDocFolderEmpty(tree())).toBe(false);
  });

  it('is false when the folder holds a file the tree does not show', () => {
    // Deleting it would take that file too, which the user never saw.
    expect(isDocFolderEmpty({ ...emptyDocsTree(), otherEntries: ['notes.txt'] })).toBe(false);
  });
});

describe('docPagesBeneath / isInsideDocFolder', () => {
  it('collects every page at any depth', () => {
    expect(docPagesBeneath(tree()).map((p) => p.path).sort()).toEqual([
      'docs/guides/setup.md',
      'docs/intro.md',
    ]);
  });

  it('knows a descendant path from an unrelated one', () => {
    const guides = findDocFolder(tree(), 'docs/guides')!;
    expect(isInsideDocFolder(guides, 'docs/guides/setup.md')).toBe(true);
    expect(isInsideDocFolder(guides, 'docs/guides')).toBe(true);
    expect(isInsideDocFolder(guides, 'docs/intro.md')).toBe(false);
    // A sibling whose name merely starts the same must not count as inside.
    expect(isInsideDocFolder(guides, 'docs/guides-old/x.md')).toBe(false);
  });
});
