import type { Release } from '@boardown/core';
import type { ActiveTab } from '../store';

interface TabBarProps {
  releases: Release[];
  activeTab: ActiveTab;
  onSelect: (tab: ActiveTab) => void;
}

const stripMd = (filename: string): string =>
  filename.endsWith('.md') ? filename.slice(0, -3) : filename;

const tabButtonStyle = (active: boolean): React.CSSProperties => ({
  padding: '8px 16px',
  border: '1px solid #ccc',
  borderBottom: active ? '2px solid #2563eb' : '1px solid #ccc',
  background: active ? '#eff6ff' : '#fff',
  cursor: 'pointer',
  fontWeight: active ? 600 : 400,
});

export function TabBar({ releases, activeTab, onSelect }: TabBarProps) {
  const sortedReleases = [...releases].sort((a, b) => a.filename.localeCompare(b.filename));

  return (
    <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #ddd', padding: '0 8px' }}>
      <button
        type="button"
        style={tabButtonStyle(activeTab.kind === 'backlog')}
        onClick={() => onSelect({ kind: 'backlog' })}
      >
        Backlog
      </button>
      {sortedReleases.map((release) => {
        const isActive = activeTab.kind === 'release' && activeTab.filename === release.filename;
        return (
          <button
            key={release.filename}
            type="button"
            style={tabButtonStyle(isActive)}
            onClick={() => onSelect({ kind: 'release', filename: release.filename })}
          >
            {stripMd(release.filename)}
          </button>
        );
      })}
    </div>
  );
}
