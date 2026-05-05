import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@boardown/ui';
import { DevHttpFsAdapter } from './dev-http-fs-adapter';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root container #root not found');
}

const fs = new DevHttpFsAdapter();

createRoot(container).render(
  <StrictMode>
    <App fs={fs} />
  </StrictMode>,
);
