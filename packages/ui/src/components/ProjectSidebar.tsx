import { useState, type MouseEvent, type ReactNode } from 'react';
import { Modal } from './Modal';
import styles from './ProjectSidebar.module.css';

export interface SidebarProject {
  id: string;
  projectRoot: string;
  name: string;
  available: boolean;
  reason: string | null;
}

interface ProjectSidebarProps {
  projects: readonly SidebarProject[];
  activeId: string | null;
  onOpenFolder: () => void;
  onSelect: (id: string) => void;
  onClose?: () => void;
  onRemove: (id: string) => Promise<void>;
  hrefFor?: (id: string) => string;
  error?: string | null;
  opening?: boolean;
  width?: number;
  menu?: ReactNode;
  children?: ReactNode;
}

function followInThisTab(event: MouseEvent<HTMLAnchorElement>): boolean {
  return event.button === 0 && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey;
}

export function ProjectSidebar({
  projects,
  activeId,
  onOpenFolder,
  onSelect,
  onClose,
  onRemove,
  hrefFor,
  error,
  opening,
  width,
  menu,
  children,
}: ProjectSidebarProps) {
  const [removal, setRemoval] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const pending = projects.find(({ id }) => id === removal);
  const sorted = [...projects].sort(
    (a, b) =>
      a.name.localeCompare(b.name) ||
      a.projectRoot.localeCompare(b.projectRoot) ||
      a.id.localeCompare(b.id),
  );

  const confirm = async (id: string) => {
    setRemoving(true);
    setRemoveError(null);
    try {
      await onRemove(id);
      setRemoval(null);
    } catch (err) {
      setRemoveError(err instanceof Error ? err.message : String(err));
    } finally {
      setRemoving(false);
    }
  };

  return (
    <aside
      className={styles.sidebar}
      style={width === undefined ? undefined : { width }}
      aria-label="Projects"
    >
      <div className={styles.header}>
        <div className={styles.titleRow}>
          {menu}
          <h1>boardown</h1>
        </div>
        <button type="button" className={styles.action} onClick={onOpenFolder} disabled={opening}>
          Open Folder…
        </button>
        {activeId !== null && onClose !== undefined && (
          <button type="button" className={styles.action} onClick={onClose}>
            Close Board
          </button>
        )}
        {error != null && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
      </div>
      <nav aria-label="Registered projects" className={styles.scroll}>
        <div className={styles.sectionLabel}>Projects</div>
        {sorted.length === 0 ? (
          <p className={styles.empty}>No projects yet — open a folder to start.</p>
        ) : (
          <ul className={styles.list}>
            {sorted.map((project) => {
              const current = activeId === project.id;
              const className = current ? `${styles.item} ${styles.current}` : styles.item;
              const contents = (
                <>
                  <span className={styles.name}>{project.name}</span>
                  <span className={styles.path}>{project.projectRoot}</span>
                  {project.reason !== null && (
                    <span className={styles.reason}>{project.reason}</span>
                  )}
                </>
              );
              return (
                <li key={project.id} className={styles.row}>
                  {hrefFor !== undefined && project.available ? (
                    <a
                      href={hrefFor(project.id)}
                      className={className}
                      aria-current={current ? 'page' : undefined}
                      title={project.projectRoot}
                      onClick={(event) => {
                        if (!followInThisTab(event)) return;
                        event.preventDefault();
                        onSelect(project.id);
                      }}
                    >
                      {contents}
                    </a>
                  ) : (
                    <button
                      type="button"
                      className={className}
                      aria-current={current ? 'page' : undefined}
                      title={project.projectRoot}
                      disabled={!project.available}
                      onClick={() => onSelect(project.id)}
                    >
                      {contents}
                    </button>
                  )}
                  <button
                    type="button"
                    className={styles.remove}
                    aria-label={`Remove ${project.name} from the list`}
                    onClick={() => {
                      setRemoveError(null);
                      setRemoval(project.id);
                    }}
                  >
                    ×
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </nav>
      {children}
      {pending !== undefined && (
        <Modal
          open
          onClose={() => setRemoval(null)}
          ariaLabel="Remove project"
          dismissable={!removing}
          className={styles.confirm}
        >
          <div className={styles.confirmBody}>
            <h2>Remove {pending.name} from the list?</h2>
            <p>The folder and its board files will not be deleted.</p>
            {removeError !== null && (
              <p className={styles.error} role="alert">
                {removeError}
              </p>
            )}
            <div className={styles.confirmActions}>
              <button
                type="button"
                disabled={removing}
                data-autofocus
                onClick={() => setRemoval(null)}
              >
                Cancel
              </button>
              <button type="button" disabled={removing} onClick={() => void confirm(pending.id)}>
                Remove
              </button>
            </div>
          </div>
        </Modal>
      )}
    </aside>
  );
}
