import { useCallback, useEffect, useRef, useState } from 'react';
import { App } from '@boardown/ui';
import type { ProjectEntry } from '../bridge';
import { Sidebar } from './Sidebar';
import { folderName, suggestIdPrefix } from './project-name';
import styles from './Root.module.css';

const bridge = window.boardown;

// Claude-Desktop-style shell: a persistent left sidebar lists the known projects
// (the persisted recent folders); the main area shows the active project's
// @boardown/ui board, or an empty state when none is selected.
export function Root() {
  const [activeFolder, setActiveFolder] = useState<string | null>(bridge.initialFolder);
  const [theme, setTheme] = useState(bridge.theme);
  const [projects, setProjects] = useState<ProjectEntry[]>([]);

  // App's defaultTheme only seeds a brand-new board's onboarding; it must stay
  // stable for each mount, or an OS theme change (which updates `theme`) would
  // re-fire App's load effect and reload the board mid-edit. Re-capture the
  // current theme only when the board changes (App is keyed by activeFolder).
  const openThemeRef = useRef(theme);
  const openFolderRef = useRef(activeFolder);
  if (openFolderRef.current !== activeFolder) {
    openFolderRef.current = activeFolder;
    openThemeRef.current = theme;
  }

  const refreshProjects = useCallback(() => {
    void bridge.getRecents().then(setProjects);
  }, []);

  useEffect(() => {
    refreshProjects();
  }, [refreshProjects]);

  // The host sets the board root before emitting boardOpened, so the App can
  // mount and hit fs straight away. Refresh the list so a freshly opened folder
  // shows up (and jumps to the top) in the sidebar.
  useEffect(
    () =>
      bridge.onBoardOpened((folder) => {
        setActiveFolder(folder);
        refreshProjects();
      }),
    [refreshProjects],
  );
  useEffect(() => bridge.onBoardClosed(() => setActiveFolder(null)), []);
  useEffect(() => bridge.onThemeChange(setTheme), []);

  // With no board mounted, @boardown/ui's theme.css isn't loaded; keep the shell
  // palette in sync with the OS theme. Once App mounts it drives data-theme from
  // the board's own config.
  useEffect(() => {
    if (activeFolder === null) {
      document.documentElement.setAttribute('data-theme', theme);
    }
  }, [activeFolder, theme]);

  return (
    <div className={styles.layout}>
      <Sidebar
        projects={projects}
        activeFolder={activeFolder}
        onSelect={(folder) => {
          if (folder !== activeFolder) void bridge.openRecent(folder);
        }}
        onOpenFolder={() => void bridge.pickFolder()}
        onRemove={(folder) => {
          void bridge.removeRecent(folder).then(refreshProjects);
        }}
      />
      <main className={styles.main}>
        {activeFolder === null ? (
          <div className={styles.empty}>
            <p className={styles.emptyTitle}>No project open</p>
            <p className={styles.emptyHint}>
              Pick a project on the left, or open a folder to load its board.
            </p>
            <button
              type="button"
              className={styles.emptyButton}
              onClick={() => void bridge.pickFolder()}
            >
              Open Folder…
            </button>
          </div>
        ) : (
          <App
            key={activeFolder}
            fs={bridge.fs}
            defaultTheme={openThemeRef.current}
            defaultProjectName={folderName(activeFolder)}
            defaultIdPrefix={suggestIdPrefix(folderName(activeFolder))}
            onCancel={() => {
              // Always return to the welcome screen, even if the recents cleanup
              // fails — the host has already dropped this window's board context.
              const reset = () => {
                setActiveFolder(null);
                refreshProjects();
              };
              void bridge.cancelBoard().then(reset, reset);
            }}
          />
        )}
      </main>
    </div>
  );
}
