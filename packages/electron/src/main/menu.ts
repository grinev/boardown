import { Menu, type BrowserWindow, type MenuItemConstructorOptions } from 'electron';

interface MenuActions {
  openFolder: (window: BrowserWindow) => void;
  closeBoard: (window: BrowserWindow) => void;
}

// Native application menu. Built-in roles cover Edit (so copy/paste/undo work in
// the board's text inputs), View (reload, devtools, zoom) and Window; the custom
// File items drive the board picker (Open Folder…) and return to the welcome
// screen (Close Board).
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
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ];

  return Menu.buildFromTemplate(template);
}
