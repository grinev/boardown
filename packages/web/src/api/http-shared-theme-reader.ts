import type { SharedThemeReader, SharedThemeState } from '@boardown/core';
import { SHARED_THEME_ENDPOINT } from '../shared-theme-endpoint.js';

// Read-only, and its own object for the reason HttpProjectFileReader is: it reads
// outside the board, so no write path may hold it. A failed request rejects; the
// store keeps what is on screen and shows why.
export class HttpSharedThemeReader implements SharedThemeReader {
  constructor(private readonly base: string = SHARED_THEME_ENDPOINT) {}

  async read(): Promise<SharedThemeState> {
    const res = await fetch(this.base);
    if (!res.ok) throw new Error(`Shared configuration could not be read (HTTP ${res.status})`);
    return (await res.json()) as SharedThemeState;
  }
}
