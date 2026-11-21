import { Check, FilePlus, FolderPlus, Pencil } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { docPageTitle, findDocFolder } from '@boardown/core';
import type { DocPageState } from '../docs-state';
import { useDocRefSuggestions } from '../hooks/use-doc-ref-suggestions';
import { useDocPage, useDocsTree } from '../hooks/use-docs';
import { useBoardStore } from '../store';
import { CreateDocFolderDialog } from './CreateDocFolderDialog';
import { CreateDocPageDialog } from './CreateDocPageDialog';
import { DeleteDocDialog } from './DeleteDocDialog';
import { DocRefSuggestions } from './DocRefSuggestions';
import { DocTree } from './DocTree';
import { MarkdownContent } from './MarkdownContent';
import styles from './DocsView.module.css';

export function DocsView() {
  const tree = useDocsTree();
  const docs = tree.kind === 'ready' ? tree.tree : null;
  const selectedDocPath = useBoardStore((s) => s.selectedDocPath);
  const pagePath =
    selectedDocPath?.endsWith('.md') && (docs === null || !findDocFolder(docs, selectedDocPath))
      ? selectedDocPath
      : null;
  const result = useDocPage(pagePath);
  const loadDocsTree = useBoardStore((s) => s.loadDocsTree);
  const loadDocPage = useBoardStore((s) => s.loadDocPage);
  const selectDoc = useBoardStore((s) => s.selectDoc);
  const openDocPage = useBoardStore((s) => s.openDocPage);
  const openCreateDocPage = useBoardStore((s) => s.openCreateDocPage);
  const openCreateDocFolder = useBoardStore((s) => s.openCreateDocFolder);
  const openDeleteDoc = useBoardStore((s) => s.openDeleteDoc);
  const saveDocPage = useBoardStore((s) => s.saveDocPage);

  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const [editBase, setEditBase] = useState<Extract<DocPageState, { kind: 'ready' }> | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftBody, setDraftBody] = useState('');
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);
  const suggestions = useDocRefSuggestions(bodyRef, draftBody, setDraftBody);

  const editing = editBase?.value.path === pagePath ? editBase : null;
  const page = editing?.value ?? (result?.kind === 'ready' ? result.value : null);

  // A draft belongs to the page version it was opened on. Auto-refresh must not
  // rebase it onto a newer version. A selection can arrive from a link on the
  // board, so the folders on the way to it are expanded — a selected page the
  // tree does not show would look like nothing happened.
  useEffect(() => {
    setEditBase(null);
    if (selectedDocPath === null) return;
    setCollapsed((prev) => {
      const next = new Set(prev);
      let ancestor = selectedDocPath;
      let changed = false;
      while (ancestor.includes('/')) {
        ancestor = ancestor.slice(0, ancestor.lastIndexOf('/'));
        if (next.delete(ancestor)) changed = true;
      }
      return changed ? next : prev;
    });
  }, [selectedDocPath]);

  const isEmpty = tree.kind === 'ready' && tree.problems.length === 0 &&
    tree.tree.folders.length === 0 && tree.tree.pages.length === 0;

  const toggleCollapsed = (path: string): void => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const startEditing = (): void => {
    if (result?.kind !== 'ready') return;
    setDraftTitle(docPageTitle(result.value));
    setDraftBody(result.value.body);
    setEditBase(result);
  };

  const commit = async (): Promise<void> => {
    if (!editing) return;
    const { value: original, version } = editing;
    setEditBase(null);
    const title = draftTitle.trim();
    // An emptied title reverts rather than writing a nameless page.
    const nextTitle = title === '' ? docPageTitle(original) : title;
    if (nextTitle === docPageTitle(original) && draftBody === original.body) return;
    try {
      await saveDocPage(original.path, nextTitle, draftBody, version);
    } catch {
      // The store surfaced the failure.
    }
  };

  return (
    <div className={styles.layout}>
      <aside className={styles.pane} data-testid="docs-tree">
        <div className={styles.paneHeader}>
          <h2 className={styles.paneTitle}>Pages</h2>
          <div className={styles.paneActions}>
            <button
              type="button"
              className={styles.iconButton}
              onClick={openCreateDocFolder}
              aria-label="New folder"
              disabled={docs === null}
            >
              <FolderPlus size={16} />
            </button>
            <button
              type="button"
              className={styles.iconButton}
              onClick={openCreateDocPage}
              aria-label="New page"
              disabled={docs === null}
            >
              <FilePlus size={16} />
            </button>
          </div>
        </div>
        <div className={styles.tree}>
          {tree.kind === 'ready' ? (
            <>
              {tree.problems.length > 0 && (
                <div className={styles.placeholder}>
                  <p role="alert">Some pages could not be read.</p>
                  <button type="button" onClick={() => void loadDocsTree(true)}>Retry</button>
                </div>
              )}
              <DocTree
                folder={tree.tree}
                depth={0}
                selectedPath={selectedDocPath}
                collapsed={collapsed}
                onToggle={toggleCollapsed}
                onSelect={selectDoc}
                onDelete={openDeleteDoc}
              />
            </>
          ) : tree.kind === 'error' ? (
            <div className={styles.placeholder}>
              <p role="alert">Could not load pages: {tree.message}</p>
              <button type="button" onClick={() => void loadDocsTree(true)}>Retry</button>
            </div>
          ) : (
            <p role="status" className={styles.placeholder}>Loading pages…</p>
          )}
        </div>
      </aside>

      <section className={styles.content}>
        {pagePath === null && isEmpty ? (
          <div className={styles.placeholder}>
            <p>No pages yet.</p>
            <button type="button" className={styles.primary} onClick={openCreateDocPage}>
              Create the first page
            </button>
          </div>
        ) : pagePath === null && docs !== null ? (
          <div className={styles.placeholder}>
            <p className={styles.hint}>Select a page to read it.</p>
          </div>
        ) : page === null && pagePath !== null ? (
          <div className={styles.placeholder}>
            {result?.kind === 'missing' ? (
              <p>Page not found.</p>
            ) : result?.kind === 'error' ? (
              <>
                <p role="alert">{result.problem.message}</p>
                <button type="button" onClick={() => void loadDocPage(pagePath, true)}>Retry</button>
              </>
            ) : (
              <p role="status">Loading page…</p>
            )}
          </div>
        ) : page !== null ? (
          <>
            <header className={styles.contentHeader}>
              {editing ? (
                <input
                  className={styles.titleInput}
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  aria-label="Page title"
                />
              ) : (
                <h2 className={styles.title}>{docPageTitle(page)}</h2>
              )}
              <button
                type="button"
                className={styles.iconButton}
                onClick={editing ? () => void commit() : startEditing}
                aria-label={editing ? 'Done' : 'Edit'}
              >
                {editing ? <Check size={16} /> : <Pencil size={16} />}
              </button>
            </header>
            {editing ? (
              <>
                <textarea
                  ref={bodyRef}
                  className={styles.editor}
                  value={draftBody}
                  onChange={(e) => {
                    setDraftBody(e.target.value);
                    suggestions.sync();
                  }}
                  onSelect={suggestions.sync}
                  onKeyDown={(e) => suggestions.onKeyDown(e)}
                  // Picking a row keeps focus (the popup swallows mousedown), so
                  // a real blur means the caret is gone and the popup is stale.
                  onBlur={suggestions.close}
                  aria-label="Page content"
                  spellCheck={false}
                />
                <DocRefSuggestions suggestions={suggestions} />
              </>
            ) : (
              <MarkdownContent source={page.body} onDocRefClick={openDocPage} />
            )}
          </>
        ) : null}
      </section>

      <CreateDocPageDialog />
      <CreateDocFolderDialog />
      <DeleteDocDialog />
    </div>
  );
}
