import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import type { Theme } from '@boardown/core';
import { App, useBoardStore } from '@boardown/ui';
import { VsCodeFsAdapter } from './VsCodeFsAdapter';
import './webview.css';

// VS Code tags the webview <body> with its active color theme. Light variants
// are checked first because high-contrast-light also carries vscode-high-contrast.
function detectTheme(): Theme {
  const classes = document.body.classList;
  if (classes.contains('vscode-light') || classes.contains('vscode-high-contrast-light')) {
    return 'light';
  }
  if (classes.contains('vscode-dark') || classes.contains('vscode-high-contrast')) {
    return 'dark';
  }
  return 'light';
}

interface VsCodeApi {
  postMessage(message: unknown): void;
}

declare global {
  // Provided by the VS Code webview runtime; callable exactly once.
  function acquireVsCodeApi(): VsCodeApi;
}

const vscode = acquireVsCodeApi();

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root container #root not found');
}

createRoot(container).render(
  <StrictMode>
    <App fs={new VsCodeFsAdapter(vscode)} defaultTheme={detectTheme()} />
  </StrictMode>,
);

// The host pushes 'board-changed' when .boardown/ changed on disk outside the
// webview (git, the CLI, another editor). Refresh in place via reloadSilent so
// the board updates without flashing the loading screen. Separate from the FS
// request/response channel in VsCodeFsAdapter; both listeners filter by type.
window.addEventListener('message', (event: MessageEvent) => {
  const data = event.data as { type?: string } | null;
  if (data?.type === 'board-changed') {
    void useBoardStore.getState().reloadSilent();
  }
});

vscode.postMessage({ type: 'ready' });
