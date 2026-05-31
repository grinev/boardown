import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Placeholder } from './Placeholder';
import './webview.css';

declare global {
  function acquireVsCodeApi(): { postMessage(message: unknown): void };
}

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root container #root not found');
}

createRoot(container).render(
  <StrictMode>
    <Placeholder />
  </StrictMode>,
);

acquireVsCodeApi().postMessage({ type: 'ready' });
