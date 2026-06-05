import { Menu, type BrowserWindow, type MenuItemConstructorOptions } from 'electron';

interface MenuActions {
  openFolder: (window: BrowserWindow) => void;
  closeBoard: (window: BrowserWindow) => void;
}

// Native application menu, kept lean. Edit/Window use built-in roles (so
// copy/paste/undo work in the board's inputs); File drives the board picker and
// Close Board; View is trimmed to zoom / full screen / dev tools — the board has
// its own Reload, so the menu's Reload / Force Reload are left out.
//
// On macOS this is set as the application menu (the system menu bar). On
// Windows/Linux the menu bar is removed and this same menu is shown as a popup
// from the sidebar's ☰ button instead (see main.ts / IPC.popupMenu).
export function buildAppMenu(actions: MenuActions): Menu {
  const isMac = process.platform === 'darwin';

  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: 'appMenu' as const }] : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Folder…',
          accelerator: 'CmdOrCtrl+O',
          click: (_item, window) => {
            if (window) actions.openFolder(window as BrowserWindow);
          },
        },
        {
          label: 'Close Board',
          accelerator: 'CmdOrCtrl+Shift+W',
          click: (_item, window) => {
            if (window) actions.closeBoard(window as BrowserWindow);
          },
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { role: 'toggleDevTools' },
      ],
    },
    { role: 'windowMenu' },
  ];

  return Menu.buildFromTemplate(template);
}
