import * as vscode from 'vscode';
import type { FsRequestMessage } from './messages';

let panel: vscode.WebviewPanel | undefined;

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

      created.webview.html = getHtml(created.webview, context.extensionUri);

      created.webview.onDidReceiveMessage((message: { type?: string }) => {
        if (message.type === 'ready') {
          output.appendLine('webview ready');
          return;
        }
        if (message.type === 'fs-request') {
          void handleFsRequest(created.webview, boardRootUri, message as FsRequestMessage);
        }
      });

      created.onDidDispose(() => {
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

function getHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const assetUri = (...segments: string[]): vscode.Uri =>
    webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'webview', ...segments));

  const scriptUri = assetUri('webview.js');
  const styleUri = assetUri('webview.css');
  const nonce = getNonce();

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
<html lang="en">
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
