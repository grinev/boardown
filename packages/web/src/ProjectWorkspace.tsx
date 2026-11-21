import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_THEME, type SharedThemeState } from '@boardown/core';
import { ProjectSidebar, useBoardStore, useDocumentTheme } from '@boardown/ui';
import { subscribeToBoardChanges } from './api/board-event-source';
import { HttpSharedThemeReader } from './api/http-shared-theme-reader';
import type { PageBoot } from './page-boot';
import {
  PROJECTS_ENDPOINT,
  PROJECTS_PICK,
  PROJECTS_PREFERENCE,
  PROJECTS_REGISTERED,
  PROJECTS_REMOVE,
  PROJECTS_THEME_EVENTS,
  projectUrl,
  type ProjectsSnapshot,
  type RegistryBoot,
} from './projects-endpoint';
import { SHARED_THEME_ENDPOINT } from './shared-theme-endpoint';
import { takeTaskFromHash, WebBoard } from './WebBoard';
import styles from './ProjectWorkspace.module.css';

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

async function request<T>(path: string, body?: object): Promise<T> {
  const reply = await fetch(
    path,
    body === undefined
      ? undefined
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
  );
  if (!reply.ok) {
    const text = await reply.text();
    if (reply.headers.get('Content-Type')?.includes('application/json') === true) {
      const failure = JSON.parse(text) as { message: string };
      throw new Error(failure.message);
    }
    throw new Error(text || `Project request failed (${reply.status})`);
  }
  return (await reply.json()) as T;
}

function useVisibleRefresh(refresh: () => void): void {
  useEffect(() => {
    const whenVisible = () => {
      if (!document.hidden) refresh();
    };
    const interval = window.setInterval(whenVisible, 1800);
    document.addEventListener('visibilitychange', whenVisible);
    window.addEventListener('focus', whenVisible);
    refresh();
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', whenVisible);
      window.removeEventListener('focus', whenVisible);
    };
  }, [refresh]);
}

interface Route {
  id: string | null;
  taskId: string | null;
  known: boolean;
}

function locationId(): string | null {
  const match = /^\/b\/([^/]+)\/$/.exec(window.location.pathname);
  if (match?.[1] === undefined) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

const initialThemeReader = new HttpSharedThemeReader(SHARED_THEME_ENDPOINT);

function Selection({
  shared,
  onOpenFolder,
  opening,
  message,
}: {
  shared: SharedThemeState | undefined;
  onOpenFolder?: () => void;
  opening?: boolean;
  message: string;
}) {
  useDocumentTheme(DEFAULT_THEME, shared?.theme ?? null);
  return (
    <main className={styles.empty}>
      <p role="status" className={styles.title}>
        {message}
      </p>
      {onOpenFolder !== undefined && (
        <button type="button" onClick={onOpenFolder} disabled={opening}>
          Open Folder…
        </button>
      )}
    </main>
  );
}

interface WorkspaceProps {
  boot: PageBoot;
  registry: RegistryBoot;
  taskId: string | null;
}

export function ProjectWorkspace({ boot, registry, taskId }: WorkspaceProps) {
  const [route, setRoute] = useState<Route>({
    id: registry.id,
    taskId,
    known: registry.project !== null,
  });
  const [snapshot, setSnapshot] = useState<ProjectsSnapshot | null>(null);
  const [registryError, setRegistryError] = useState<string | null>(registry.error);
  const [actionError, setActionError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [shared, setShared] = useState(boot.sharedTheme);
  const serial = useRef(0);
  const refreshing = useRef(false);
  const preferenceWrite = useRef(Promise.resolve());
  const routeRef = useRef(route);
  const snapshotRef = useRef(snapshot);
  const hasSharedConfig = boot.sharedTheme !== undefined;

  const refresh = useCallback(async () => {
    const requestId = ++serial.current;
    refreshing.current = true;
    try {
      const state = await request<ProjectsSnapshot>(PROJECTS_ENDPOINT);
      if (requestId !== serial.current) return;
      snapshotRef.current = state;
      setSnapshot(state);
      setRegistryError(state.error);
    } catch (err) {
      if (requestId === serial.current) setRegistryError(messageOf(err));
    } finally {
      if (requestId === serial.current) refreshing.current = false;
    }
  }, []);
  const refreshSoon = useCallback(() => {
    if (!refreshing.current) void refresh();
  }, [refresh]);
  useVisibleRefresh(refreshSoon);

  const remember = useCallback((id: string | null) => {
    preferenceWrite.current = preferenceWrite.current
      .then(async () => {
        await request(PROJECTS_PREFERENCE, { id });
      })
      .catch((err: unknown) => {
        setActionError(messageOf(err));
      });
  }, []);

  const setSelection = useCallback((next: Route) => {
    const state = useBoardStore.getState();
    if (state.sharedThemeReader !== null) {
      setShared({ theme: state.sharedTheme, error: state.sharedThemeError });
    }
    routeRef.current = next;
    setRoute(next);
  }, []);

  const navigate = useCallback(
    (id: string | null, replace = false) => {
      if (routeRef.current.id === id) return;
      setActionError(null);
      const url = id === null ? '/' : projectUrl(id);
      if (replace) window.history.replaceState(null, '', url);
      else window.history.pushState(null, '', url);
      setSelection({ id, taskId: null, known: id !== null });
      remember(id);
    },
    [remember, setSelection],
  );

  useEffect(() => {
    if (registry.id !== null && registry.project?.available === true && !registry.restored)
      remember(registry.id);
    const onHistory = () => {
      const id = locationId();
      const taskId = takeTaskFromHash();
      if (id === routeRef.current.id) {
        if (taskId !== null) useBoardStore.getState().jumpToTask(taskId);
        return;
      }
      const project = snapshotRef.current?.projects.find((candidate) => candidate.id === id);
      setSelection({ id, taskId, known: project !== undefined });
      if (id !== null && project?.available === true) remember(id);
      refreshSoon();
    };
    window.addEventListener('popstate', onHistory);
    return () => window.removeEventListener('popstate', onHistory);
  }, [registry, remember, setSelection, refreshSoon]);

  const project =
    snapshot === null
      ? route.id === registry.project?.id
        ? registry.project
        : null
      : (snapshot.projects.find(({ id }) => id === route.id) ?? null);
  const active = project?.available === true ? project : null;
  const isAvailable = active !== null;

  useEffect(() => {
    if (snapshot !== null && route.id !== null && route.known && project === null)
      navigate(null, true);
  }, [navigate, project, route, snapshot]);

  useEffect(() => {
    if (isAvailable || !hasSharedConfig) return;
    let disposed = false;
    const read = () => {
      void initialThemeReader
        .read()
        .then((theme) => {
          if (!disposed) setShared(theme);
        })
        .catch(() => undefined);
    };
    read();
    const stop = subscribeToBoardChanges(PROJECTS_THEME_EVENTS, '', {
      onBoardChange: () => undefined,
      onSharedConfigChange: read,
    });
    return () => {
      disposed = true;
      stop();
    };
  }, [isAvailable, hasSharedConfig]);

  const pick = async () => {
    if (opening) return;
    setOpening(true);
    setActionError(null);
    try {
      const { id } = await request<{ id: string | null }>(PROJECTS_PICK, {});
      if (id !== null) {
        await refresh();
        navigate(id);
      }
    } catch (err) {
      setActionError(messageOf(err));
    } finally {
      setOpening(false);
    }
  };

  const remove = async (id: string) => {
    await request(PROJECTS_REMOVE, { id });
    if (routeRef.current.id === id) navigate(null);
    await refresh();
  };
  const onOpenFolder = () => void pick();

  return (
    <div className={styles.layout}>
      <ProjectSidebar
        projects={snapshot?.projects ?? (registry.project === null ? [] : [registry.project])}
        activeId={project?.id ?? null}
        hrefFor={projectUrl}
        onOpenFolder={onOpenFolder}
        opening={opening}
        error={actionError ?? registryError}
        onSelect={(id) => navigate(id)}
        {...(active === null ? {} : { onClose: () => navigate(null) })}
        onRemove={remove}
      />
      <div className={styles.board}>
        {active === null ? (
          <Selection
            shared={shared}
            opening={opening}
            onOpenFolder={onOpenFolder}
            message={
              route.id === null
                ? 'No project open'
                : (project?.reason ??
                  (snapshot === null && route.known
                    ? 'Loading project…'
                    : 'Project is no longer registered'))
            }
          />
        ) : (
          <WebBoard
            key={`${active.id}:${active.projectRoot}`}
            prefix={projectUrl(active.id).slice(0, -1)}
            boot={{ theme: active.theme, ...(shared === undefined ? {} : { sharedTheme: shared }) }}
            taskId={route.taskId}
            onCancel={() => navigate(null)}
          />
        )}
      </div>
    </div>
  );
}

export function EmbeddedProject({ boot, registry, taskId }: WorkspaceProps) {
  const [availability, setAvailability] = useState({
    registered: registry.project !== null,
    available: registry.project?.available === true,
  });
  const id = registry.id;
  const refresh = useCallback(() => {
    if (id === null) return;
    void request<{ registered: boolean; available: boolean }>(
      `${PROJECTS_REGISTERED}?${new URLSearchParams({ id })}`,
    )
      .then(setAvailability)
      .catch(() => undefined);
  }, [id]);
  useVisibleRefresh(refresh);
  if (!availability.registered || id === null) {
    return <Selection shared={boot.sharedTheme} message="Project is no longer registered" />;
  }
  if (!availability.available)
    return <Selection shared={boot.sharedTheme} message="Project folder is unavailable" />;
  return <WebBoard prefix={projectUrl(id).slice(0, -1)} boot={boot} taskId={taskId} embedded />;
}
