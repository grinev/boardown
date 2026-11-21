import { useState } from 'react';
import { Menu, Settings } from 'lucide-react';
import {
  CliHint,
  DocsTabField,
  EditFinishedReleasesField,
  GitIntegrationField,
  MultipleActiveReleasesField,
  StatusOutsideActiveReleaseField,
  TrackUpdatedAtField,
  WipLimitField,
  ProjectSidebar,
  type SidebarProject,
} from '@boardown/ui';
import type { ThemeChoice } from '../bridge';
import styles from './Sidebar.module.css';

interface SidebarProps {
  projects: readonly SidebarProject[];
  activeId: string | null;
  width: number;
  error: string | null;
  opening: boolean;
  onSelect: (id: string) => void;
  onOpenFolder: () => void;
  onClose: () => void;
  onRemove: (id: string) => Promise<void>;
  themeChoice: ThemeChoice;
  onThemeChoice: (choice: ThemeChoice) => void;
  autoRefresh: boolean;
  onAutoRefresh: (enabled: boolean) => void;
  boardOpen: boolean;
  showMenuButton: boolean;
  onMenuButton: () => void;
}

const THEME_OPTIONS: ReadonlyArray<{ value: ThemeChoice; label: string }> = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export function Sidebar({
  projects,
  activeId,
  width,
  error,
  opening,
  onSelect,
  onOpenFolder,
  onClose,
  onRemove,
  themeChoice,
  onThemeChoice,
  autoRefresh,
  onAutoRefresh,
  boardOpen,
  showMenuButton,
  onMenuButton,
}: SidebarProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <ProjectSidebar
      projects={projects}
      activeId={activeId}
      width={width}
      error={error}
      opening={opening}
      onSelect={onSelect}
      onOpenFolder={onOpenFolder}
      onClose={onClose}
      onRemove={onRemove}
      menu={
        showMenuButton && (
          <button
            type="button"
            className={styles.menuButton}
            onClick={onMenuButton}
            title="Menu"
            aria-label="Open menu"
          >
            <Menu size={18} aria-hidden="true" />
          </button>
        )
      }
    >
      <div className={styles.footer}>
        {settingsOpen && (
          <div className={styles.settingsPanel}>
            <span className={styles.settingsLabel}>Theme</span>
            <div className={styles.themeOptions}>
              {THEME_OPTIONS.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  className={
                    value === themeChoice
                      ? `${styles.themeOption} ${styles.themeOptionActive}`
                      : styles.themeOption
                  }
                  onClick={() => onThemeChoice(value)}
                  aria-pressed={value === themeChoice}
                >
                  {label}
                </button>
              ))}
            </div>
            <span className={styles.settingsLabel}>Board</span>
            <label className={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(event) => onAutoRefresh(event.target.checked)}
              />
              Auto-refresh on file changes
            </label>
            {/* Unlike its neighbours this one is stored in the board's
                config.yaml, so it only exists while a board is open. */}
            {boardOpen && <WipLimitField className={styles.boardSettingRow} />}
            {boardOpen && <MultipleActiveReleasesField className={styles.boardSettingRow} />}
            {boardOpen && <GitIntegrationField className={styles.boardSettingRow} />}
            {boardOpen && <TrackUpdatedAtField className={styles.boardSettingRow} />}
            {boardOpen && <StatusOutsideActiveReleaseField className={styles.boardSettingRow} />}
            {boardOpen && <EditFinishedReleasesField className={styles.boardSettingRow} />}
            {boardOpen && <DocsTabField className={styles.boardSettingRow} />}
            {/* Describes the installation rather than the board, so unlike the
                field above it shows with no board open. */}
            <span className={styles.settingsLabel}>CLI</span>
            <CliHint className={styles.cliHint} />
          </div>
        )}
        <button
          type="button"
          className={styles.settingsButton}
          onClick={() => setSettingsOpen((open) => !open)}
          aria-expanded={settingsOpen}
        >
          <Settings size={16} aria-hidden="true" />
          Settings
        </button>
      </div>
    </ProjectSidebar>
  );
}
