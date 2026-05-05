import type { FsAdapter } from '@boardown/core';
import { useEffect } from 'react';
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
  const load = useBoardStore((s) => s.load);
  const setActiveTab = useBoardStore((s) => s.setActiveTab);

  useEffect(() => {
    void load(fs);
  }, [fs, load]);

  if (status === 'idle' || status === 'loading') {
    return (
      <main style={{ fontFamily: 'system-ui, sans-serif', padding: 16 }}>
        <h1>boardown</h1>
        <p>Loading…</p>
      </main>
    );
  }

  if (status === 'error' || snapshot === null) {
    return (
      <main style={{ fontFamily: 'system-ui, sans-serif', padding: 16 }}>
        <h1>boardown</h1>
        <p style={{ color: '#b91c1c' }}>Failed to load board.</p>
        {errorMessage && (
          <pre style={{ whiteSpace: 'pre-wrap', background: '#fef2f2', padding: 12 }}>
            {errorMessage}
          </pre>
        )}
      </main>
    );
  }

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif' }}>
      <header style={{ padding: '8px 16px', borderBottom: '1px solid #eee' }}>
        <h1 style={{ margin: 0, fontSize: 18 }}>boardown</h1>
      </header>
      <TabBar releases={snapshot.releases} activeTab={activeTab} onSelect={setActiveTab} />
      <TabContent activeTab={activeTab} releases={snapshot.releases} />
      {problems.length > 0 && (
        <section style={{ padding: 16, background: '#fffbeb', borderTop: '1px solid #fde68a' }}>
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
