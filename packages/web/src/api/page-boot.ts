import { promises as fs } from 'node:fs';
import path from 'node:path';
// By relative path into core's sources, like board-api.ts: Vite loads this file
// with its own config, where the workspace package's `.ts` entry cannot resolve.
import { CONFIG_FILENAME, DEFAULT_THEME, boardThemeOfConfigText } from '../../../core/src/config';
import { createLogger } from '../../../core/src/logger';
import type { Theme } from '../../../core/src/schemas';
import { displayedTheme, sharedThemeOverrides } from '../../../core/src/shared-theme';
import { PAGE_BOOT_ELEMENT_ID, type PageBoot } from '../page-boot.js';
import { escapeHtml } from './html-escape.js';
import type { SharedConfigSource } from './shared-config.js';

// A board page is served already in the theme it will settle on: both hosts stamp
// it into the HTML, so the first frame is right before ui has read anything.

const log = createLogger('web.page-boot');

const readBoardTheme = async (boardRoot: string): Promise<Theme> => {
  try {
    const text = await fs.readFile(path.join(boardRoot, CONFIG_FILENAME), 'utf-8');
    return boardThemeOfConfigText(text);
  } catch {
    // Missing is onboarding and unreadable is the error screen; both are light.
    return DEFAULT_THEME;
  }
};

export const buildPageBoot = async (
  boardRoot: string,
  sharedConfig: SharedConfigSource | undefined,
): Promise<PageBoot> => {
  const [theme, sharedTheme] = await Promise.all([
    readBoardTheme(boardRoot),
    sharedConfig?.read(),
  ]);
  log.debug(`page theme for ${boardRoot}: ${theme}, shared ${sharedTheme?.theme?.id ?? 'none'}`);
  return sharedTheme === undefined ? { theme } : { theme, sharedTheme };
};

const HTML_OPEN_TAG = /<html\b[^>]*>/i;
const HEAD_CLOSE_TAG = /<\/head>/i;

// The attributes give a paint before the bundle runs its palette; the payload
// gives ui the same state, so its own effects take the stamped values over as
// theirs rather than painting the default over them.
export const stampPage = (html: string, boot: PageBoot): string => {
  const shared = boot.sharedTheme?.theme ?? null;
  const overrides = Object.entries(sharedThemeOverrides(shared));
  const style = overrides.map(([name, value]) => `${name}: ${value}`).join('; ');
  const attributes =
    ` data-theme="${displayedTheme(shared, boot.theme)}"` +
    (style === '' ? '' : ` style="${escapeHtml(style)}"`);
  // `<` escaped so no value can close the script element early.
  const json = JSON.stringify(boot).replace(/</g, '\\u003c');
  const script = `<script type="application/json" id="${PAGE_BOOT_ELEMENT_ID}">${json}</script>`;

  const open = HTML_OPEN_TAG.exec(html);
  if (open === null) return script + html;
  const stamped =
    html.slice(0, open.index) +
    open[0].slice(0, -1) +
    attributes +
    '>' +
    html.slice(open.index + open[0].length);
  const head = HEAD_CLOSE_TAG.exec(stamped);
  if (head !== null) {
    return stamped.slice(0, head.index) + script + stamped.slice(head.index);
  }
  const afterOpen = open.index + open[0].length + attributes.length;
  return stamped.slice(0, afterOpen) + script + stamped.slice(afterOpen);
};
