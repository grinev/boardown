import type { FsAdapter } from '@boardown/core';
import { TASK_STATUSES } from '@boardown/core';
import { useEffect } from 'react';
import './theme/theme.css';
import styles from './components/App.module.css';
import { CreateTaskDialog } from './components/CreateTaskDialog';
import { EpicDetailsDialog } from './components/EpicDetailsDialog';
import { SettingsDialog } from './components/SettingsDialog';
import { TabBar } from './components/TabBar';
import { TabContent } from './components/TabContent';
import { TaskDetailsDialog } from './components/TaskDetailsDialog';
import { useBoardStore } from './store';
import { findReleaseOfTask } from './utils/find-release-of-task';
import { findTaskById } from './utils/find-task';
import { findTasksByEpic } from './utils/find-tasks-by-epic';

interface AppProps {
  fs: FsAdapter;
}

export function App({ fs }: AppProps) {
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
  const settingsOpen = useBoardStore((s) => s.settingsOpen);
  const load = useBoardStore((s) => s.load);
  const setActiveTab = useBoardStore((s) => s.setActiveTab);
  const closeTask = useBoardStore((s) => s.closeTask);
  const closeEpic = useBoardStore((s) => s.closeEpic);
  const openTask = useBoardStore((s) => s.openTask);
  const openEpic = useBoardStore((s) => s.openEpic);
  const closeCreateTask = useBoardStore((s) => s.closeCreateTask);
  const closeSettings = useBoardStore((s) => s.closeSettings);

  useEffect(() => {
    void load(fs);
  }, [fs, load]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  if (status === 'idle' || status === 'loading') {
    return (
      <main className={styles.app}>
        <header className={styles.header}>
          <h1>boardown</h1>
        </header>
        <div className={styles.loading}>Loading…</div>
      </main>
    );
  }

  if (status === 'error' || snapshot === null) {
    return (
      <main className={styles.app}>
        <header className={styles.header}>
          <h1>boardown</h1>
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

  return (
    <main className={styles.app}>
      <header className={styles.header}>
        <h1>boardown</h1>
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
      {settingsOpen && <SettingsDialog onClose={closeSettings} />}
    </main>
  );
}
