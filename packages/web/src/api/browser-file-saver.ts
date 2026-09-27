import type { FileSaver } from '@boardown/core';

// The browser's own download: the file lands wherever the browser puts downloads,
// or wherever its Save-as asks, by the user's own browser settings.
export class BrowserFileSaver implements FileSaver {
  save(name: string, content: Uint8Array): Promise<void> {
    const url = URL.createObjectURL(new Blob([content.slice()]));
    try {
      const link = document.createElement('a');
      link.href = url;
      link.download = name;
      link.click();
    } finally {
      // The click has handed the blob to the download by the time it returns; a
      // tick later is still in time and keeps a slow browser safe.
      setTimeout(() => URL.revokeObjectURL(url), 0);
    }
    return Promise.resolve();
  }
}
