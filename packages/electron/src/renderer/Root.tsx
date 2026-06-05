import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { App } from '@boardown/ui';
import type { ProjectEntry, ThemeChoice } from '../bridge';
import { Sidebar } from './Sidebar';
import { folderName, suggestIdPrefix } from './project-name';
import styles from './Root.module.css';

const bridge = window.boardown;

const SIDEBAR_MIN = 200;
const SIDEBAR_MAX = 480;
const SIDEBAR_DEFAULT = 240;
const SIDEBAR_WIDTH_KEY = 'boardown:sidebar-width';

function clampWidth(value: number): number {
  return Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, value));
}

function readStoredWidth(): number {
  // Number(null) === 0 (key absent) fails the > 0 guard and falls back to default.
  const stored = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY));
  return Number.isFinite(stored) && stored > 0 ? clampWidth(stored) : SIDEBAR_DEFAULT;
}

// Claude-Desktop-style shell: a persistent left sidebar lists the known projects
// (the persisted recent folders); the main area shows the active project's
// @boardown/ui board, or an empty state when none is selected.
export function Root() {
  const [activeFolder, setActiveFolder] = useState<string | null>(bridge.initialFolder);
  const [theme, setTheme] = useState(bridge.theme);
  const [projects, setProjects] = useState<ProjectEntry[]>([]);
  const [themeChoice, setThemeChoiceState] = useState<ThemeChoice>(bridge.themeChoice);

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

  const [sidebarWidth, setSidebarWidth] = useState(readStoredWidth);
  const draggingRef = useRef(false);
  const widthRef = useRef(sidebarWidth);

  // Resize via pointer capture on the handle itself: capture serialises the
  // pointer stream (no accumulating or leaked window listeners) and keeps moves
  // flowing even past the window edge. Persist the displayed width on release.
  const onResizeStart = useCallback((event: ReactPointerEvent) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    draggingRef.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  const onResizeMove = useCallback((event: ReactPointerEvent) => {
    if (!draggingRef.current) return;
    const width = clampWidth(event.clientX);
    widthRef.current = width;
    setSidebarWidth(width);
  }, []);

  const onResizeEnd = useCallback((event: ReactPointerEvent) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    event.currentTarget.releasePointerCapture(event.pointerId);
    document.body.style.removeProperty('cursor');
    document.body.style.removeProperty('user-select');
    localStorage.setItem(SIDEBAR_WIDTH_KEY, String(widthRef.current));
  }, []);

  const refreshProjects = useCallback(() => {
    void bridge.getRecents().then(setProjects);
  }, []);

  const chooseTheme = useCallback(
    (choice: ThemeChoice) => {
      const previous = themeChoice;
      setThemeChoiceState(choice);
      // Revert if the host fails to persist, so the UI never shows a choice that
      // wasn't actually saved.
      void bridge.setThemeChoice(choice).catch(() => setThemeChoiceState(previous));
    },
    [themeChoice],
  );

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
        width={sidebarWidth}
        onSelect={(folder) => {
          if (folder !== activeFolder) void bridge.openRecent(folder);
        }}
        onOpenFolder={() => void bridge.pickFolder()}
        onRemove={(folder) => {
          void bridge.removeRecent(folder).then(refreshProjects);
        }}
        themeChoice={themeChoice}
        onThemeChoice={chooseTheme}
        showMenuButton={bridge.showMenuButton}
        onMenuButton={() => bridge.popupMenu()}
      />
      <div
        className={styles.resizer}
        onPointerDown={onResizeStart}
        onPointerMove={onResizeMove}
        onPointerUp={onResizeEnd}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
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
            forcedTheme={theme}
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
