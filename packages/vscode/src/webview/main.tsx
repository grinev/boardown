import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@boardown/ui';
import { VsCodeFsAdapter } from './VsCodeFsAdapter';
import './webview.css';

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
    <App fs={new VsCodeFsAdapter(vscode)} />
  </StrictMode>,
);

vscode.postMessage({ type: 'ready' });
