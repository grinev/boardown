import type {
  FsAdapter,
  GitHistoryReader,
  ProjectFileReader,
  Theme,
} from '@boardown/core';
import { boardStatusKeys } from '@boardown/core';
import { useEffect, useLayoutEffect, useMemo } from 'react';
import './theme/theme.css';
import styles from './components/App.module.css';
import { CompleteReleaseDialog } from './components/CompleteReleaseDialog';
import { ConflictDialog } from './components/ConflictDialog';
import { UnwritableFileDialog } from './components/UnwritableFileDialog';
import { CreateEpicDialog } from './components/CreateEpicDialog';
import { CreateReleaseDialog } from './components/CreateReleaseDialog';
import { CreateTaskDialog } from './components/CreateTaskDialog';
import { DocPopupDialog } from './components/DocPopupDialog';
import { EpicDetailsDialog } from './components/EpicDetailsDialog';
import { ReleaseDetailsDialog } from './components/ReleaseDetailsDialog';
import { RepoFilePopupDialog } from './components/RepoFilePopupDialog';
import { OnboardingDialog } from './components/OnboardingDialog';
import { SettingsDialog } from './components/SettingsDialog';
import { StartReleaseDialog } from './components/StartReleaseDialog';
import { TabBar } from './components/TabBar';
import { TabContent } from './components/TabContent';
import { TaskDetailsDialog } from './components/TaskDetailsDialog';
import { useBoardStore } from './store';
import { findReleaseOfTask } from './utils/find-release-of-task';
import { findTaskById } from './utils/find-task';
import { findTasksByEpic } from './utils/find-tasks-by-epic';

interface AppProps {
  fs: FsAdapter;
  // Read-only access to the project folder, for repo file links. Deliberately
  // not part of `fs`: that one is board-scoped and carries every write.
  projectFiles: ProjectFileReader;
  // Read-only access to the repository around the project folder, for the task
  // dialog's Commits panel. A third capability for the same reason as the
  // second: it reaches outside `.boardown/`, so no write path may hold it.
  gitHistory: GitHistoryReader;
  // Host-provided fallback theme (e.g. VS Code's color theme). Seeds the theme
  // only when onboarding writes a brand-new config; ignored once a board exists.
  defaultTheme?: Theme;
  // Host-provided seeds for the onboarding form (e.g. the opened folder's name
  // and a prefix derived from it). Used only when a brand-new board runs
  // onboarding; ignored once a board exists.
  defaultProjectName?: string;
  defaultIdPrefix?: string;
  // When provided, onboarding can be cancelled (shells with somewhere to go
  // back to, e.g. the desktop sidebar). Omitted by web/vscode.
  onCancel?: () => void;
  // When provided, the shell owns the theme app-wide: this value drives
  // data-theme and the board's own config.theme is ignored for display. The
  // per-board theme control is hidden so there is a single source of truth.
  forcedTheme?: Theme;
  // The running build's version, supplied by the shell. Shown read-only in the
  // settings dialog; omitted by shells that surface it their own way.
  version?: string | undefined;
}

export function App({
  fs,
  projectFiles,
  gitHistory,
  defaultTheme,
  defaultProjectName,
  defaultIdPrefix,
  onCancel,
  forcedTheme,
  version,
}: AppProps) {
  const status = useBoardStore((s) => s.status);
  const snapshot = useBoardStore((s) => s.snapshot);
  // Stable identity: the board columns memoise on it, and a fresh array every
  // render would rebuild every bucket on any unrelated state change.
  const statuses = useMemo(
    () => (snapshot === null ? [] : boardStatusKeys(snapshot.config)),
    [snapshot],
  );
  const problems = useBoardStore((s) => s.problems);
  // An error-level problem means the file is not written back until it is fixed
  // by hand, so it is a different message from a warning, not a louder one.
  const blocking = useMemo(() => problems.filter((p) => p.level === 'error'), [problems]);
  const warnings = useMemo(() => problems.filter((p) => p.level !== 'error'), [problems]);
  const errorMessage = useBoardStore((s) => s.errorMessage);
  const activeTab = useBoardStore((s) => s.activeTab);
  const theme = useBoardStore((s) => s.theme);
  const selectedTaskId = useBoardStore((s) => s.selectedTaskId);
  const selectedEpicSlug = useBoardStore((s) => s.selectedEpicSlug);
  const selectedReleaseFilename = useBoardStore((s) => s.selectedReleaseFilename);
  const docPopupPath = useBoardStore((s) => s.docPopupPath);
  const createTaskForReleaseFilename = useBoardStore(
    (s) => s.createTaskForReleaseFilename,
  );
  const createTaskForEpicSlug = useBoardStore((s) => s.createTaskForEpicSlug);
  const createTaskOpen = useBoardStore((s) => s.createTaskOpen);
  const createTaskBacklog = useBoardStore((s) => s.createTaskBacklog);
  const createReleaseOpen = useBoardStore((s) => s.createReleaseOpen);
  const createEpicOpen = useBoardStore((s) => s.createEpicOpen);
  const settingsOpen = useBoardStore((s) => s.settingsOpen);
  const conflictOpen = useBoardStore((s) => s.conflictOpen);
  const unwritableFile = useBoardStore((s) => s.unwritableFile);
  const completeReleaseForFilename = useBoardStore((s) => s.completeReleaseForFilename);
  const closeCompleteRelease = useBoardStore((s) => s.closeCompleteRelease);
  const startReleaseForFilename = useBoardStore((s) => s.startReleaseForFilename);
  const closeStartRelease = useBoardStore((s) => s.closeStartRelease);
  const load = useBoardStore((s) => s.load);
  const setProjectFiles = useBoardStore((s) => s.setProjectFiles);
  const setGitHistory = useBoardStore((s) => s.setGitHistory);
  const repoFilePopupPath = useBoardStore((s) => s.repoFilePopupPath);
  const setActiveTab = useBoardStore((s) => s.setActiveTab);
  const closeTask = useBoardStore((s) => s.closeTask);
  const closeEpic = useBoardStore((s) => s.closeEpic);
  const closeRelease = useBoardStore((s) => s.closeRelease);
  const openTask = useBoardStore((s) => s.openTask);
  const openEpic = useBoardStore((s) => s.openEpic);
  const closeCreateTask = useBoardStore((s) => s.closeCreateTask);
  const closeCreateRelease = useBoardStore((s) => s.closeCreateRelease);
  const closeCreateEpic = useBoardStore((s) => s.closeCreateEpic);
  const closeSettings = useBoardStore((s) => s.closeSettings);

  useEffect(() => {
    void load(fs, defaultTheme);
  }, [fs, load, defaultTheme]);

  useEffect(() => {
    setProjectFiles(projectFiles);
  }, [projectFiles, setProjectFiles]);

  useEffect(() => {
    setGitHistory(gitHistory);
  }, [gitHistory, setGitHistory]);

  // useLayoutEffect so the attribute is set before the browser paints the first
  // frame — a plain effect runs after paint and flashes the light-theme default.
  // While the board is still loading, prefer the host-provided theme (e.g. VS
  // Code's) over the store's 'light' default; once loaded, `theme` reflects
  // config and wins.
  useLayoutEffect(() => {
    const resolved =
      forcedTheme ??
      (status === 'idle' || status === 'loading' ? (defaultTheme ?? theme) : theme);
    document.documentElement.setAttribute('data-theme', resolved);
  }, [theme, defaultTheme, forcedTheme, status]);

  if (status === 'idle' || status === 'loading') {
    return (
      <main className={styles.app}>
        <header className={styles.header}>
          <h1 />
        </header>
        <div className={styles.loading}>Loading…</div>
      </main>
    );
  }

  if (status === 'onboarding') {
    return (
      <main className={styles.app}>
        <header className={styles.header}>
          <h1 />
        </header>
        <OnboardingDialog
          defaultProjectName={defaultProjectName ?? ''}
          defaultIdPrefix={defaultIdPrefix ?? ''}
          {...(onCancel ? { onCancel } : {})}
        />
      </main>
    );
  }

  if (status === 'error' || snapshot === null) {
    return (
      <main className={styles.app}>
        <header className={styles.header}>
          <h1 />
        </header>
        <div className={styles.errorScreen}>
          <p className={styles.errorMessage}>Failed to load board.</p>
          {errorMessage && <pre className={styles.errorDetails}>{errorMessage}</pre>}
        </div>
      </main>
    );
  }

  const selectedTask = selectedTaskId ? findTaskById(snapshot, selectedTaskId) : null;
  const selectedTaskEpicSlug = selectedTask?.frontmatter.epic;
  const selectedTaskEpic = selectedTaskEpicSlug
    ? snapshot.epics.find((e) => e.slug === selectedTaskEpicSlug)
    : undefined;
  const selectedTaskRelease = selectedTaskId
    ? findReleaseOfTask(snapshot, selectedTaskId)
    : undefined;
  const selectedEpic = selectedEpicSlug
    ? snapshot.epics.find((e) => e.slug === selectedEpicSlug)
    : undefined;
  const selectedEpicTasks = selectedEpic
    ? findTasksByEpic(snapshot, selectedEpic.slug)
    : [];
  const selectedRelease = selectedReleaseFilename
    ? snapshot.releases.find((r) => r.filename === selectedReleaseFilename)
    : undefined;
  const createTaskRelease = createTaskForReleaseFilename
    ? snapshot.releases.find((r) => r.filename === createTaskForReleaseFilename)
    : undefined;
  const createTaskEpic = createTaskForEpicSlug
    ? snapshot.epics.find((e) => e.slug === createTaskForEpicSlug)
    : undefined;
  const startReleaseTarget = startReleaseForFilename
    ? snapshot.releases.find((r) => r.filename === startReleaseForFilename)
    : undefined;
  const completeReleaseTarget = completeReleaseForFilename
    ? snapshot.releases.find((r) => r.filename === completeReleaseForFilename)
    : undefined;

  return (
    <main className={styles.app}>
      <header className={styles.header}>
        <h1>{snapshot.config.projectName}</h1>
      </header>
      <TabBar
        activeTab={activeTab}
        onSelect={setActiveTab}
        hideSettings={forcedTheme !== undefined}
      />
      <TabContent
        activeTab={activeTab}
        epics={snapshot.epics}
        statuses={statuses}
      />
      {problems.length > 0 && (
        <section className={styles.problems} data-testid="problems-banner">
          {blocking.length > 0 && (
            <div className={styles.problemGroup} data-testid="problems-blocking">
              <strong>Not writable — fix these files by hand:</strong>
              <ul>
                {blocking.map((p, i) => (
                  <li key={i}>
                    {p.file}: {p.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {warnings.length > 0 && (
            <div className={styles.problemGroup} data-testid="problems-warnings">
              <strong>Parse warnings:</strong>
              <ul>
                {warnings.map((p, i) => (
                  <li key={i}>
                    {p.file}: {p.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
      {selectedTask && (
        <TaskDetailsDialog
          task={selectedTask}
          epic={selectedTaskEpic}
          release={selectedTaskRelease}
          onClose={closeTask}
          onEpicClick={openEpic}
          onTaskClick={openTask}
        />
      )}
      {selectedEpic && (
        <EpicDetailsDialog
          epic={selectedEpic}
          tasks={selectedEpicTasks}
          onClose={closeEpic}
          onTaskClick={openTask}
        />
      )}
      {selectedRelease && (
        <ReleaseDetailsDialog release={selectedRelease} onClose={closeRelease} />
      )}
      {docPopupPath && <DocPopupDialog />}
      {repoFilePopupPath && <RepoFilePopupDialog />}
      {createTaskRelease && (
        <CreateTaskDialog
          release={createTaskRelease}
          epics={snapshot.epics}
          onClose={closeCreateTask}
        />
      )}
      {createTaskEpic && (
        <CreateTaskDialog
          epic={createTaskEpic}
          releases={snapshot.releases}
          epics={snapshot.epics}
          onClose={closeCreateTask}
        />
      )}
      {createTaskOpen && (
        <CreateTaskDialog
          releases={snapshot.releases}
          epics={snapshot.epics}
          onClose={closeCreateTask}
        />
      )}
      {createTaskBacklog && (
        <CreateTaskDialog
          backlogLocked
          epics={snapshot.epics}
          onClose={closeCreateTask}
        />
      )}
      {createReleaseOpen && <CreateReleaseDialog onClose={closeCreateRelease} />}
      {createEpicOpen && <CreateEpicDialog onClose={closeCreateEpic} />}
      {completeReleaseTarget && (
        <CompleteReleaseDialog
          release={completeReleaseTarget}
          onClose={closeCompleteRelease}
        />
      )}
      {startReleaseTarget && (
        <StartReleaseDialog
          release={startReleaseTarget}
          onClose={closeStartRelease}
        />
      )}
      {settingsOpen && !forcedTheme && (
        <SettingsDialog onClose={closeSettings} version={version} />
      )}
      {conflictOpen ? (
        <ConflictDialog />
      ) : (
        unwritableFile && (
          <UnwritableFileDialog
            path={unwritableFile.path}
            problems={unwritableFile.problems}
          />
        )
      )}
    </main>
  );
}
