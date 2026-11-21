import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { App, useBoardStore } from '@boardown/ui';
import type { OpenProject, ProjectListSnapshot, ThemeChoice } from '../bridge';
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

export function Root() {
  const [active, setActive] = useState<OpenProject | null>(bridge.initialProject);
  const [snapshot, setSnapshot] = useState<ProjectListSnapshot>({ projects: [], error: null });
  const [actionError, setActionError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [theme, setTheme] = useState(bridge.theme);
  const [themeChoice, setThemeChoiceState] = useState<ThemeChoice>(bridge.themeChoice);
  const [autoRefresh, setAutoRefreshState] = useState(bridge.autoRefresh);

  // App's defaultTheme only seeds a brand-new board's onboarding; it must stay
  // stable for each mount, or an OS theme change (which updates `theme`) would
  // re-fire App's load effect and reload the board mid-edit. Re-capture the
  // current theme only when the board changes (App is keyed by activeFolder).
  const openThemeRef = useRef(theme);
  const scope = active?.scope;
  const openScopeRef = useRef(scope);
  if (openScopeRef.current !== scope) {
    openScopeRef.current = scope;
    openThemeRef.current = theme;
  }
  const capabilities = useMemo(
    () => (scope === undefined ? null : bridge.connectBoard(scope)),
    [scope],
  );
  const boardName = useBoardStore((state) => state.snapshot?.config.projectName);
  const listRead = useRef(0);

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
    const request = ++listRead.current;
    void bridge
      .getProjects()
      .then((result) => {
        if (request === listRead.current) setSnapshot(result);
      })
      .catch((error: unknown) => {
        if (request === listRead.current)
          setActionError(error instanceof Error ? error.message : String(error));
      });
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

  const chooseAutoRefresh = useCallback((enabled: boolean) => {
    setAutoRefreshState(enabled);
    // Revert on a failed save, so the checkbox never shows a state that wasn't
    // persisted (previous value of a boolean toggle is just its negation).
    void bridge.setAutoRefresh(enabled).catch(() => setAutoRefreshState(!enabled));
  }, []);

  useEffect(() => {
    refreshProjects();
  }, [refreshProjects, boardName]);

  useEffect(
    () =>
      bridge.onBoardOpened((project) => {
        setActive(project);
        refreshProjects();
      }),
    [refreshProjects],
  );
  useEffect(() => bridge.onBoardClosed(() => setActive(null)), []);
  useEffect(() => bridge.onProjectsChanged(refreshProjects), [refreshProjects]);
  useEffect(() => bridge.onThemeChange(setTheme), []);
  // The host signals when .boardown/ changed on disk outside this window; refresh
  // the board in place via reloadSilent (no loading flash). A no-op when no board
  // is mounted (store has no rawFs yet).
  useEffect(
    () =>
      bridge.onBoardChanged(() => {
        void useBoardStore.getState().reloadSilent();
        refreshProjects();
      }),
    [refreshProjects],
  );

  // With no board mounted, @boardown/ui's theme.css isn't loaded; keep the shell
  // palette in sync with the OS theme. Once App mounts it drives data-theme from
  // the board's own config.
  useEffect(() => {
    if (active === null) {
      document.documentElement.setAttribute('data-theme', theme);
    }
  }, [active, theme]);

  const act = async (run: () => Promise<void>) => {
    setActionError(null);
    try {
      await run();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    }
  };
  const pick = () => {
    if (opening) return;
    setOpening(true);
    void act(() => bridge.pickFolder()).finally(() => setOpening(false));
  };
  const close = () => void act(() => bridge.closeBoard());

  return (
    <div className={styles.layout}>
      <Sidebar
        projects={snapshot.projects}
        activeId={active?.id ?? null}
        width={sidebarWidth}
        error={actionError ?? snapshot.error}
        opening={opening}
        onSelect={(id) => {
          if (id !== active?.id) void act(() => bridge.openProject(id));
        }}
        onOpenFolder={pick}
        onClose={close}
        onRemove={(id) => bridge.removeProject(id)}
        themeChoice={themeChoice}
        onThemeChoice={chooseTheme}
        autoRefresh={autoRefresh}
        onAutoRefresh={chooseAutoRefresh}
        boardOpen={active !== null}
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
      <div className={styles.main}>
        {active === null || capabilities === null ? (
          <main className={styles.empty}>
            <p className={styles.emptyTitle}>No project open</p>
            <p className={styles.emptyHint}>
              Pick a project on the left, or open a folder to load its board.
            </p>
            <button type="button" className={styles.emptyButton} onClick={pick} disabled={opening}>
              Open Folder…
            </button>
          </main>
        ) : (
          <App
            key={active.scope}
            {...capabilities}
            fileSaver={bridge.fileSaver}
            forcedTheme={theme}
            defaultTheme={openThemeRef.current}
            defaultProjectName={folderName(active.projectRoot)}
            defaultIdPrefix={suggestIdPrefix(folderName(active.projectRoot))}
            onCancel={close}
          />
        )}
      </div>
    </div>
  );
}
