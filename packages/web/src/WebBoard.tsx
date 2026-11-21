import { useEffect, useMemo } from 'react';
import { App, useBoardStore } from '@boardown/ui';
import { subscribeToBoardChanges } from './api/board-event-source';
import { BrowserFileSaver } from './api/browser-file-saver';
import { HttpFsAdapter } from './api/http-fs-adapter';
import { HttpGitHistoryReader } from './api/http-git-history-reader';
import { HttpProjectFileReader } from './api/http-project-file-reader';
import { HttpSharedThemeReader } from './api/http-shared-theme-reader';
import { BOARD_EVENTS_ENDPOINT } from './board-events-endpoint';
import { GIT_COMMITS_ENDPOINT } from './git-history-endpoint';
import type { PageBoot } from './page-boot';
import { PROJECT_FILE_ENDPOINT } from './project-file-endpoint';
import { SHARED_THEME_ENDPOINT } from './shared-theme-endpoint';
import { taskIdFromHash, urlWithoutHash } from './task-fragment';

const clientId = crypto.randomUUID();
const fileSaver = new BrowserFileSaver();

export const takeTaskFromHash = (): string | null => {
  const id = taskIdFromHash(window.location.hash);
  if (id !== null)
    window.history.replaceState(window.history.state, '', urlWithoutHash(window.location));
  return id;
};

interface WebBoardProps {
  prefix: string;
  boot: PageBoot | null;
  taskId: string | null;
  embedded?: boolean;
  onCancel?: () => void;
}

export function WebBoard({ prefix, boot, taskId, embedded = false, onCancel }: WebBoardProps) {
  const adapters = useMemo(
    () => ({
      fs: new HttpFsAdapter(`${prefix}/api/fs`, clientId),
      projectFiles: new HttpProjectFileReader(`${prefix}${PROJECT_FILE_ENDPOINT}`),
      gitHistory: new HttpGitHistoryReader(`${prefix}${GIT_COMMITS_ENDPOINT}`),
      sharedTheme: new HttpSharedThemeReader(`${prefix}${SHARED_THEME_ENDPOINT}`),
    }),
    [prefix],
  );

  useEffect(
    () =>
      subscribeToBoardChanges(`${prefix}${BOARD_EVENTS_ENDPOINT}`, clientId, {
        onBoardChange: () => void useBoardStore.getState().reloadSilent(),
        onSharedConfigChange: () => void useBoardStore.getState().refreshSharedTheme(),
      }),
    [prefix],
  );

  useEffect(() => {
    const onHash = () => {
      const id = takeTaskFromHash();
      if (id !== null) useBoardStore.getState().jumpToTask(id);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  return (
    <App
      {...adapters}
      fileSaver={fileSaver}
      {...(boot === null ? {} : { initialTheme: boot.theme })}
      {...(boot?.sharedTheme === undefined ? {} : { initialSharedTheme: boot.sharedTheme })}
      version={__BOARDOWN_VERSION__}
      embedded={embedded}
      {...(taskId === null ? {} : { initialTaskId: taskId })}
      {...(onCancel === undefined ? {} : { onCancel })}
    />
  );
}
