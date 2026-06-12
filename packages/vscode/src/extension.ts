import * as vscode from 'vscode';
import type { FsRequestMessage } from './messages';

let panel: vscode.WebviewPanel | undefined;

// How long after the host writes a file its own filesystem event is ignored, so
// the webview's own saves don't bounce back as an "external change" refresh.
const ECHO_WINDOW_MS = 2000;
// Collapse a burst of changes (e.g. a `git checkout` touching many files) into a
// single refresh.
const REFRESH_DEBOUNCE_MS = 200;

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel('boardown');
  context.subscriptions.push(output);

  context.subscriptions.push(
    vscode.commands.registerCommand('boardown.openBoard', () => {
      if (panel) {
        panel.reveal();
        return;
      }

      const folder = vscode.workspace.workspaceFolders?.[0];
      if (!folder) {
        void vscode.window.showErrorMessage(
          'boardown: open a folder first — the board lives in its .boardown/ directory.',
        );
        return;
      }
      const boardRootUri = vscode.Uri.joinPath(folder.uri, '.boardown');

      const created = vscode.window.createWebviewPanel(
        'boardown',
        'boardown',
        vscode.ViewColumn.Active,
        {
          enableScripts: true,
          localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview')],
        },
      );
      panel = created;
      created.iconPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'board.svg');

      created.webview.html = getHtml(created.webview, context.extensionUri);

      // Records fsPath -> timestamp of the host's own writes so the watcher can
      // tell its own saves apart from genuinely external changes (see below).
      const recentWrites = new Map<string, number>();

      created.webview.onDidReceiveMessage((message: { type?: string }) => {
        if (message.type === 'ready') {
          output.appendLine('webview ready');
          return;
        }
        if (message.type === 'fs-request') {
          void handleFsRequest(
            created.webview,
            boardRootUri,
            message as FsRequestMessage,
            recentWrites,
          );
        }
      });

      const autoRefresh = setupAutoRefresh(created, boardRootUri, recentWrites);

      created.onDidDispose(() => {
        autoRefresh.dispose();
        panel = undefined;
      });
    }),
  );
}

export function deactivate(): void {
  // Nothing to clean up beyond context.subscriptions.
}

// Join a webview-supplied relative path onto the board root, rejecting absolute
// paths and any escape via '..' — the webview must never reach outside .boardown/.
function resolveTarget(boardRootUri: vscode.Uri, userPath: string): vscode.Uri | null {
  const normalized = userPath.replace(/\\/g, '/');
  if (normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized)) {
    return null;
  }
  const segments = normalized.split('/').filter((s) => s !== '' && s !== '.');
  if (segments.includes('..')) {
    return null;
  }
  return vscode.Uri.joinPath(boardRootUri, ...segments);
}

async function handleFsRequest(
  webview: vscode.Webview,
  boardRootUri: vscode.Uri,
  message: FsRequestMessage,
  recentWrites: Map<string, number>,
): Promise<void> {
  const respond = (ok: boolean, result?: unknown, error?: string): void => {
    void webview.postMessage({ type: 'fs-response', id: message.id, ok, result, error });
  };

  const target = resolveTarget(boardRootUri, message.path);
  if (!target) {
    respond(false, undefined, `Invalid path: ${message.path}`);
    return;
  }

  try {
    switch (message.method) {
      case 'read': {
        const bytes = await vscode.workspace.fs.readFile(target);
        respond(true, new TextDecoder('utf-8').decode(bytes));
        return;
      }
      case 'write': {
        await vscode.workspace.fs.writeFile(target, new TextEncoder().encode(message.content ?? ''));
        recentWrites.set(target.fsPath, Date.now());
        respond(true);
        return;
      }
      case 'list': {
        try {
          const entries = await vscode.workspace.fs.readDirectory(target);
          respond(
            true,
            entries.filter(([, type]) => type === vscode.FileType.File).map(([name]) => name),
          );
        } catch (err) {
          if (isFileNotFound(err)) respond(true, []);
          else throw err;
        }
        return;
      }
      case 'stat': {
        try {
          const stat = await vscode.workspace.fs.stat(target);
          respond(true, { lastModified: stat.mtime });
        } catch (err) {
          if (isFileNotFound(err)) respond(true, null);
          else throw err;
        }
        return;
      }
    }
  } catch (err) {
    respond(false, undefined, err instanceof Error ? err.message : String(err));
  }
}

function isFileNotFound(err: unknown): boolean {
  return err instanceof vscode.FileSystemError && err.code === 'FileNotFound';
}

// Watches the board's .boardown/ directory and tells the webview to refresh when
// its files change on disk outside the board (git, the CLI, another editor).
// Three concerns: (1) gate on the boardown.autoRefresh setting and react to it
// being toggled live; (2) ignore the host's own writes — without this every save
// from the board would echo back as an "external change"; (3) debounce bursts so
// one `git checkout` is a single refresh, not one per file.
function setupAutoRefresh(
  panel: vscode.WebviewPanel,
  boardRootUri: vscode.Uri,
  recentWrites: Map<string, number>,
): vscode.Disposable {
  let watcher: vscode.FileSystemWatcher | undefined;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  const isOwnWrite = (fsPath: string): boolean => {
    const at = recentWrites.get(fsPath);
    if (at === undefined) return false;
    if (Date.now() - at > ECHO_WINDOW_MS) {
      recentWrites.delete(fsPath);
      return false;
    }
    return true;
  };

  const scheduleRefresh = (): void => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = undefined;
      void panel.webview.postMessage({ type: 'board-changed' });
    }, REFRESH_DEBOUNCE_MS);
  };

  const onFsEvent = (uri: vscode.Uri): void => {
    if (isOwnWrite(uri.fsPath)) return;
    scheduleRefresh();
  };

  const startWatching = (): void => {
    if (watcher) return;
    watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(boardRootUri, '**'),
    );
    watcher.onDidChange(onFsEvent);
    watcher.onDidCreate(onFsEvent);
    watcher.onDidDelete(onFsEvent);
  };

  const stopWatching = (): void => {
    watcher?.dispose();
    watcher = undefined;
  };

  const applySetting = (): void => {
    const enabled = vscode.workspace
      .getConfiguration('boardown')
      .get<boolean>('autoRefresh', true);
    if (enabled) startWatching();
    else stopWatching();
  };

  applySetting();
  const configSub = vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration('boardown.autoRefresh')) applySetting();
  });

  return {
    dispose: (): void => {
      if (debounceTimer) clearTimeout(debounceTimer);
      stopWatching();
      configSub.dispose();
      // A path is only evicted from recentWrites when a matching watcher event
      // arrives; entries that never get one would otherwise outlive the panel.
      recentWrites.clear();
    },
  };
}

function themeName(kind: vscode.ColorThemeKind): 'light' | 'dark' {
  return kind === vscode.ColorThemeKind.Light || kind === vscode.ColorThemeKind.HighContrastLight
    ? 'light'
    : 'dark';
}

function getHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const assetUri = (...segments: string[]): vscode.Uri =>
    webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'webview', ...segments));

  const scriptUri = assetUri('webview.js');
  const styleUri = assetUri('webview.css');
  const nonce = getNonce();
  // Seed data-theme on <html> from VS Code's active theme so the board palette
  // (theme.css keys off [data-theme]) resolves on the very first parse, before
  // any script runs — otherwise :root's light default paints white for a frame.
  const theme = themeName(vscode.window.activeColorTheme.kind);

  const csp = [
    `default-src 'none'`,
    // @dnd-kit and React write to elements' inline style attribute; a strict
    // style-src without 'unsafe-inline' blocks that and breaks drag & drop.
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `font-src ${webview.cspSource}`,
    `img-src ${webview.cspSource} data:`,
    `script-src 'nonce-${nonce}'`,
  ].join('; ');

  return `<!doctype html>
<html lang="en" data-theme="${theme}">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="stylesheet" href="${styleUri.toString()}" />
    <title>boardown</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" nonce="${nonce}" src="${scriptUri.toString()}"></script>
  </body>
</html>`;
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let text = '';
  for (let i = 0; i < 32; i += 1) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}
