import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

type Run = (command: string, args: string[]) => Promise<string>;
const exec = promisify(execFile);
const run: Run = async (command, args) =>
  (await exec(command, args, { windowsHide: true, encoding: 'utf8' })).stdout;

const windowsDialog = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Windows.Forms
$dialog = [System.Windows.Forms.FolderBrowserDialog]::new()
$dialog.Description = 'Open Board Folder'
try {
  if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
    [Console]::Write($dialog.SelectedPath)
  }
} finally { $dialog.Dispose() }
`;

const macDialog = 'POSIX path of (choose folder with prompt "Open Board Folder")';

interface ChooserCommand {
  command: string;
  args: string[];
  cancelled?: (code: unknown, stderr: string) => boolean;
  lineOutput?: boolean;
}

function commands(platform: NodeJS.Platform): ChooserCommand[] {
  if (platform === 'win32') {
    return [
      {
        command: path.win32.join(
          process.env.SystemRoot ?? 'C:\\Windows',
          'System32',
          'WindowsPowerShell',
          'v1.0',
          'powershell.exe',
        ),
        args: ['-NoProfile', '-NonInteractive', '-STA', '-Command', windowsDialog],
      },
    ];
  }
  if (platform === 'darwin') {
    return [
      {
        command: '/usr/bin/osascript',
        args: ['-e', macDialog],
        lineOutput: true,
        cancelled: (code, stderr) => code === 1 && stderr.includes('(-128)'),
      },
    ];
  }
  if (platform === 'linux') {
    const cancelled = (code: unknown, stderr: string) => code === 1 && stderr.trim() === '';
    return [
      {
        command: 'zenity',
        args: ['--file-selection', '--directory', '--title=Open Board Folder'],
        cancelled,
        lineOutput: true,
      },
      {
        command: 'kdialog',
        args: ['--title', 'Open Board Folder', '--getexistingdirectory'],
        cancelled,
        lineOutput: true,
      },
    ];
  }
  return [];
}

export class FolderChooserUnavailable extends Error {}

export async function chooseFolder(
  platform = process.platform,
  execute = run,
): Promise<string | null> {
  for (const candidate of commands(platform)) {
    try {
      const stdout = await execute(candidate.command, candidate.args);
      const folder = candidate.lineOutput === true ? stdout.replace(/\r?\n$/, '') : stdout;
      return folder === '' ? null : folder;
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error) {
        const stderr = 'stderr' in error && typeof error.stderr === 'string' ? error.stderr : '';
        if (candidate.cancelled?.(error.code, stderr) === true) return null;
      }
    }
  }
  const requirement =
    platform === 'win32'
      ? 'Windows PowerShell and an interactive desktop'
      : platform === 'darwin'
        ? 'osascript and an interactive macOS desktop'
        : platform === 'linux'
          ? 'Zenity or KDialog and an interactive desktop session'
          : 'a supported desktop environment';
  throw new FolderChooserUnavailable(
    `The system folder chooser is unavailable. This server needs ${requirement}.`,
  );
}
