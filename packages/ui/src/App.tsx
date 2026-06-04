import type { FsAdapter, Theme } from '@boardown/core';
import { TASK_STATUSES } from '@boardown/core';
import { useEffect, useLayoutEffect } from 'react';
import './theme/theme.css';
import styles from './components/App.module.css';
import { CompleteReleaseDialog } from './components/CompleteReleaseDialog';
import { ConflictDialog } from './components/ConflictDialog';
import { CreateEpicDialog } from './components/CreateEpicDialog';
import { CreateReleaseDialog } from './components/CreateReleaseDialog';
import { CreateTaskDialog } from './components/CreateTaskDialog';
import { EpicDetailsDialog } from './components/EpicDetailsDialog';
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
}

export function App({
  fs,
  defaultTheme,
  defaultProjectName,
  defaultIdPrefix,
  onCancel,
}: AppProps) {
  const status = useBoardStore((s) => s.status);
  const snapshot = useBoardStore((s) => s.snapshot);
  const problems = useBoardStore((s) => s.problems);
  const errorMessage = useBoardStore((s) => s.errorMessage);
  const activeTab = useBoardStore((s) => s.activeTab);
  const theme = useBoardStore((s) => s.theme);
  const selectedTaskId = useBoardStore((s) => s.selectedTaskId);
  const selectedEpicSlug = useBoardStore((s) => s.selectedEpicSlug);
  const createTaskForReleaseFilename = useBoardStore(
    (s) => s.createTaskForReleaseFilename,
  );
  const createTaskOpen = useBoardStore((s) => s.createTaskOpen);
  const createTaskBacklog = useBoardStore((s) => s.createTaskBacklog);
  const createReleaseOpen = useBoardStore((s) => s.createReleaseOpen);
  const createEpicOpen = useBoardStore((s) => s.createEpicOpen);
  const settingsOpen = useBoardStore((s) => s.settingsOpen);
  const conflictOpen = useBoardStore((s) => s.conflictOpen);
  const completeReleaseOpen = useBoardStore((s) => s.completeReleaseOpen);
  const closeCompleteRelease = useBoardStore((s) => s.closeCompleteRelease);
  const startReleaseForFilename = useBoardStore((s) => s.startReleaseForFilename);
  const closeStartRelease = useBoardStore((s) => s.closeStartRelease);
  const load = useBoardStore((s) => s.load);
  const setActiveTab = useBoardStore((s) => s.setActiveTab);
  const closeTask = useBoardStore((s) => s.closeTask);
  const closeEpic = useBoardStore((s) => s.closeEpic);
  const openTask = useBoardStore((s) => s.openTask);
  const openEpic = useBoardStore((s) => s.openEpic);
  const closeCreateTask = useBoardStore((s) => s.closeCreateTask);
  const closeCreateRelease = useBoardStore((s) => s.closeCreateRelease);
  const closeCreateEpic = useBoardStore((s) => s.closeCreateEpic);
  const closeSettings = useBoardStore((s) => s.closeSettings);

  useEffect(() => {
    void load(fs, defaultTheme);
  }, [fs, load, defaultTheme]);

  // useLayoutEffect so the attribute is set before the browser paints the first
  // frame — a plain effect runs after paint and flashes the light-theme default.
  // While the board is still loading, prefer the host-provided theme (e.g. VS
  // Code's) over the store's 'light' default; once loaded, `theme` reflects
  // config and wins.
  useLayoutEffect(() => {
    const resolved =
      status === 'idle' || status === 'loading' ? (defaultTheme ?? theme) : theme;
    document.documentElement.setAttribute('data-theme', resolved);
  }, [theme, defaultTheme, status]);

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
  const createTaskRelease = createTaskForReleaseFilename
    ? snapshot.releases.find((r) => r.filename === createTaskForReleaseFilename)
    : undefined;
  const startReleaseTarget = startReleaseForFilename
    ? snapshot.releases.find((r) => r.filename === startReleaseForFilename)
    : undefined;

  return (
    <main className={styles.app}>
      <header className={styles.header}>
        <h1>{snapshot.config.projectName}</h1>
      </header>
      <TabBar activeTab={activeTab} onSelect={setActiveTab} />
      <TabContent
        activeTab={activeTab}
        releases={snapshot.releases}
        epics={snapshot.epics}
        statuses={TASK_STATUSES}
      />
      {problems.length > 0 && (
        <section className={styles.problems}>
          <strong>Parse warnings:</strong>
          <ul>
            {problems.map((p, i) => (
              <li key={i}>
                {p.file}: {p.message}
              </li>
            ))}
          </ul>
        </section>
      )}
      {selectedTask && (
        <TaskDetailsDialog
          task={selectedTask}
          epic={selectedTaskEpic}
          release={selectedTaskRelease}
          onClose={closeTask}
          onEpicClick={openEpic}
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
      {createTaskRelease && (
        <CreateTaskDialog
          release={createTaskRelease}
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
      {completeReleaseOpen && (
        <CompleteReleaseDialog onClose={closeCompleteRelease} />
      )}
      {startReleaseTarget && (
        <StartReleaseDialog
          release={startReleaseTarget}
          onClose={closeStartRelease}
        />
      )}
      {settingsOpen && <SettingsDialog onClose={closeSettings} />}
      {conflictOpen && <ConflictDialog />}
    </main>
  );
}
