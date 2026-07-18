import { ChevronDown, ChevronRight, FileText, Trash2 } from 'lucide-react';
import { type DocFolder, docPageTitle, isDocFolderEmpty } from '@boardown/core';
import styles from './DocTree.module.css';

interface DocTreeProps {
  folder: DocFolder;
  depth: number;
  selectedPath: string | null;
  collapsed: ReadonlySet<string>;
  onToggle: (path: string) => void;
  onSelect: (path: string) => void;
  onDelete: (path: string) => void;
}

const INDENT = 14;

export function DocTree({
  folder,
  depth,
  selectedPath,
  collapsed,
  onToggle,
  onSelect,
  onDelete,
}: DocTreeProps) {
  return (
    <>
      {folder.folders.map((child) => {
        const isCollapsed = collapsed.has(child.path);
        const selected = selectedPath === child.path;
        return (
          <div key={child.path}>
            <div
              className={[styles.row, selected && styles.rowSelected].filter(Boolean).join(' ')}
              style={{ paddingLeft: depth * INDENT + 8 }}
              data-testid="doc-folder-row"
            >
              <button
                type="button"
                className={styles.chevron}
                onClick={() => onToggle(child.path)}
                aria-label={isCollapsed ? `Expand ${child.name}` : `Collapse ${child.name}`}
                aria-expanded={!isCollapsed}
              >
                {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
              </button>
              <button
                type="button"
                className={styles.label}
                onClick={() => onSelect(child.path)}
                aria-current={selected ? 'true' : undefined}
              >
                {child.name}
              </button>
              <button
                type="button"
                className={styles.delete}
                onClick={() => onDelete(child.path)}
                disabled={!isDocFolderEmpty(child)}
                aria-label={`Delete folder ${child.name}`}
                title={
                  isDocFolderEmpty(child)
                    ? undefined
                    : 'Only an empty folder can be deleted. Delete its contents first.'
                }
              >
                <Trash2 size={14} />
              </button>
            </div>
            {!isCollapsed && (
              <DocTree
                folder={child}
                depth={depth + 1}
                selectedPath={selectedPath}
                collapsed={collapsed}
                onToggle={onToggle}
                onSelect={onSelect}
                onDelete={onDelete}
              />
            )}
          </div>
        );
      })}

      {folder.pages.map((page) => {
        const selected = selectedPath === page.path;
        const title = docPageTitle(page);
        return (
          <div
            key={page.path}
            className={[styles.row, selected && styles.rowSelected].filter(Boolean).join(' ')}
            style={{ paddingLeft: depth * INDENT + 8 }}
            data-testid="doc-page-row"
          >
            <span className={styles.pageIcon} aria-hidden>
              <FileText size={14} />
            </span>
            <button
              type="button"
              className={styles.label}
              onClick={() => onSelect(page.path)}
              aria-current={selected ? 'true' : undefined}
            >
              {title}
            </button>
            <button
              type="button"
              className={styles.delete}
              onClick={() => onDelete(page.path)}
              aria-label={`Delete page ${title}`}
            >
              <Trash2 size={14} />
            </button>
          </div>
        );
      })}
    </>
  );
}
