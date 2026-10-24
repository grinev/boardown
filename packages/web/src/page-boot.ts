import type { Theme } from '../../core/src/schemas';
import type { SharedThemeState } from '../../core/src/shared-theme';

// The theme a host knew when it served a board page, embedded in that page so the
// shell can hand it to ui before the first frame. Shared by the two Node hosts,
// which write it, and by the browser, which reads it, like the endpoint names.
export const PAGE_BOOT_ELEMENT_ID = 'boardown-boot';

export interface PageBoot {
  /** The board's own theme, as the loader will settle it. */
  theme: Theme;
  /** Absent when the host has no shared configuration. */
  sharedTheme?: SharedThemeState;
}

// The host's own JSON, trusted like the shared-theme endpoint's answer. A page
// without it, or with something unreadable, behaves as an unstamped page did.
export const parsePageBoot = (text: string | null | undefined): PageBoot | null => {
  if (text === null || text === undefined || text === '') return null;
  try {
    return JSON.parse(text) as PageBoot;
  } catch {
    return null;
  }
};
