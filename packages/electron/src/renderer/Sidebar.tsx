import { useState } from 'react';
import { Settings } from 'lucide-react';
import type { ProjectEntry, ThemeChoice } from '../bridge';
import styles from './Sidebar.module.css';

interface SidebarProps {
  projects: ProjectEntry[];
  activeFolder: string | null;
  onSelect: (folder: string) => void;
  onOpenFolder: () => void;
  onRemove: (folder: string) => void;
  themeChoice: ThemeChoice;
  onThemeChoice: (choice: ThemeChoice) => void;
}

const THEME_OPTIONS: ReadonlyArray<{ value: ThemeChoice; label: string }> = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export function Sidebar({
  projects,
  activeFolder,
  onSelect,
  onOpenFolder,
  onRemove,
  themeChoice,
  onThemeChoice,
}: SidebarProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Stable alphabetical order so selecting a project never makes it jump in the
  // list (recents are stored most-recent-first; we don't reorder on click).
  const sorted = [...projects].sort(
    (a, b) => a.name.localeCompare(b.name) || a.folder.localeCompare(b.folder),
  );

  return (
    <aside className={styles.sidebar}>
      <div className={styles.header}>
        <h1 className={styles.title}>boardown</h1>
        <button type="button" className={styles.openButton} onClick={onOpenFolder}>
          + Open Folder…
        </button>
      </div>

      <div className={styles.scroll}>
        <div className={styles.sectionLabel}>Projects</div>
        {sorted.length === 0 ? (
          <p className={styles.emptyList}>No projects yet — open a folder to start.</p>
        ) : (
          <ul className={styles.list}>
            {sorted.map((project) => {
              const active = project.folder === activeFolder;
              return (
                <li key={project.folder} className={styles.row}>
                  <button
                    type="button"
                    className={active ? `${styles.item} ${styles.itemActive}` : styles.item}
                    onClick={() => onSelect(project.folder)}
                    title={project.folder}
                    aria-current={active || undefined}
                  >
                    <span className={styles.nameRow}>
                      <span className={styles.name}>{project.name}</span>
                      {!project.hasBoard && <span className={styles.badge}>Needs setup</span>}
                    </span>
                    <span className={styles.path}>{project.folder}</span>
                  </button>
                  {!active && (
                    <button
                      type="button"
                      className={styles.remove}
                      onClick={() => onRemove(project.folder)}
                      title="Remove from list"
                      aria-label={`Remove ${project.name} from the list`}
                    >
                      ×
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className={styles.footer}>
        {settingsOpen && (
          <div className={styles.settingsPanel}>
            <span className={styles.settingsLabel}>Theme</span>
            <div className={styles.themeOptions}>
              {THEME_OPTIONS.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  className={
                    value === themeChoice
                      ? `${styles.themeOption} ${styles.themeOptionActive}`
                      : styles.themeOption
                  }
                  onClick={() => onThemeChoice(value)}
                  aria-pressed={value === themeChoice}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
        <button
          type="button"
          className={styles.settingsButton}
          onClick={() => setSettingsOpen((open) => !open)}
          aria-expanded={settingsOpen}
        >
          <Settings size={16} aria-hidden="true" />
          Settings
        </button>
      </div>
    </aside>
  );
}
