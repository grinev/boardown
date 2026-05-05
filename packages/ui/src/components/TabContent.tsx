import type { Release } from '@boardown/core';
import type { ActiveTab } from '../store';

interface TabContentProps {
  activeTab: ActiveTab;
  releases: Release[];
}

const stripMd = (filename: string): string =>
  filename.endsWith('.md') ? filename.slice(0, -3) : filename;

export function TabContent({ activeTab, releases }: TabContentProps) {
  if (activeTab.kind === 'backlog') {
    return (
      <section style={{ padding: 16 }}>
        <h2>Backlog</h2>
        <p style={{ color: '#666' }}>No tasks yet</p>
      </section>
    );
  }

  const release = releases.find((r) => r.filename === activeTab.filename);
  if (!release) {
    return (
      <section style={{ padding: 16 }}>
        <p style={{ color: '#b91c1c' }}>Release not found: {activeTab.filename}</p>
      </section>
    );
  }

  return (
    <section style={{ padding: 16 }}>
      <h2>Release {stripMd(release.filename)}</h2>
      <p style={{ color: '#666' }}>No tasks yet</p>
    </section>
  );
}
