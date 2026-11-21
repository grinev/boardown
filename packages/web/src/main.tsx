import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { configureLogging } from '@boardown/core';
import { createBrowserLogSink } from './browser-log-sink';
import { isEmbedRequested } from './embed-param';
import { PAGE_BOOT_ELEMENT_ID, parsePageBoot } from './page-boot';
import { resolveDevLogLevel } from './log-level';
import { ProjectWorkspace, EmbeddedProject } from './ProjectWorkspace';
import { projectUrl } from './projects-endpoint';
import { takeTaskFromHash, WebBoard } from './WebBoard';

if (import.meta.env.DEV) {
  configureLogging({
    sink: createBrowserLogSink(),
    level: resolveDevLogLevel(__BOARDOWN_LOG_LEVEL__),
  });
}

const container = document.getElementById('root');
if (!container) throw new Error('Root container #root not found');

const boot = parsePageBoot(document.getElementById(PAGE_BOOT_ELEMENT_ID)?.textContent);
const registry = boot?.registry;
if (registry !== undefined && window.location.pathname === '/') {
  const query = new URLSearchParams(window.location.search);
  if (registry.restored || query.has('embed')) {
    query.delete('embed');
    const path = registry.id !== null && registry.restored ? projectUrl(registry.id) : '/';
    const search = query.size === 0 ? '' : `?${query.toString()}`;
    window.history.replaceState(
      window.history.state,
      '',
      `${path}${search}${window.location.hash}`,
    );
  }
}
const taskId = takeTaskFromHash();

createRoot(container).render(
  <StrictMode>
    {boot === null || registry === undefined ? (
      <WebBoard
        prefix=""
        boot={boot}
        taskId={taskId}
        embedded={isEmbedRequested(window.location.search)}
      />
    ) : registry.embedded ? (
      <EmbeddedProject boot={boot} registry={registry} taskId={taskId} />
    ) : (
      <ProjectWorkspace boot={boot} registry={registry} taskId={taskId} />
    )}
  </StrictMode>,
);
