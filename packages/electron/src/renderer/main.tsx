import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './shell-theme.css';
import { Root } from './Root';

// Stamp the theme before React's first render so the welcome screen never
// flashes the light palette on a dark system — the entry module runs before any
// paint of #root's contents, and the bridge knows the theme synchronously.
document.documentElement.setAttribute('data-theme', window.boardown.theme);

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root container #root not found');
}

createRoot(container).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
