import type { FsAdapter } from '@boardown/core';
import { TASK_STATUSES } from '@boardown/core';
import { useEffect } from 'react';
import './theme/theme.css';
import styles from './components/App.module.css';
import { TabBar } from './components/TabBar';
import { TabContent } from './components/TabContent';
import { useBoardStore } from './store';

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
  const load = useBoardStore((s) => s.load);
  const setActiveTab = useBoardStore((s) => s.setActiveTab);

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

  return (
    <main className={styles.app}>
      <header className={styles.header}>
        <h1>boardown</h1>
      </header>
      <TabBar releases={snapshot.releases} activeTab={activeTab} onSelect={setActiveTab} />
      <TabContent
        activeTab={activeTab}
        releases={snapshot.releases}
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
    </main>
  );
}
