import * as vscode from 'vscode';

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

      panel = vscode.window.createWebviewPanel('boardown', 'boardown', vscode.ViewColumn.Active, {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview')],
      });

      panel.webview.html = getHtml(panel.webview, context.extensionUri);

      panel.webview.onDidReceiveMessage((message: { type?: string }) => {
        if (message.type === 'ready') {
          output.appendLine('webview ready');
        }
      });

      panel.onDidDispose(() => {
        panel = undefined;
      });
    }),
  );
}

export function deactivate(): void {
  // Nothing to clean up beyond context.subscriptions.
}

function getHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const assetUri = (...segments: string[]): vscode.Uri =>
    webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'webview', ...segments));

  const scriptUri = assetUri('webview.js');
  const styleUri = assetUri('webview.css');
  const nonce = getNonce();

  const csp = [
    `default-src 'none'`,
    `style-src ${webview.cspSource}`,
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
