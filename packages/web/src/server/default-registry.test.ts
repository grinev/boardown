import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CONFIG_FOLDER_NAME,
  REGISTRY_FILE_NAME,
  defaultRegistryPath,
  type RegistryHost,
} from './default-registry';

// Expectations are built with the flavour the case is about, so the suite says
// the same thing whatever machine runs it.
const win = (...parts: string[]): string =>
  path.win32.join(...parts, CONFIG_FOLDER_NAME, REGISTRY_FILE_NAME);
const posix = (...parts: string[]): string =>
  path.posix.join(...parts, CONFIG_FOLDER_NAME, REGISTRY_FILE_NAME);

const host = (over: Partial<RegistryHost>): RegistryHost => ({
  platform: 'linux',
  env: {},
  homedir: () => '/home/me',
  ...over,
});

const windows = (over: Partial<RegistryHost>): RegistryHost =>
  host({ platform: 'win32', homedir: () => 'C:\\Users\\me', ...over });

describe('defaultRegistryPath', () => {
  it('takes APPDATA on Windows', () => {
    const file = defaultRegistryPath(windows({ env: { APPDATA: 'D:\\config' } }));
    expect(file).toBe(win('D:\\config'));
  });

  it('falls back to the roaming folder under home when APPDATA is unset', () => {
    expect(defaultRegistryPath(windows({}))).toBe(win('C:\\Users\\me', 'AppData', 'Roaming'));
  });

  it('takes Application Support on macOS', () => {
    const file = defaultRegistryPath(host({ platform: 'darwin', homedir: () => '/Users/me' }));
    expect(file).toBe(posix('/Users/me', 'Library', 'Application Support'));
  });

  it('ignores XDG_CONFIG_HOME on macOS', () => {
    const file = defaultRegistryPath(
      host({
        platform: 'darwin',
        env: { XDG_CONFIG_HOME: '/elsewhere' },
        homedir: () => '/Users/me',
      }),
    );
    expect(file).toBe(posix('/Users/me', 'Library', 'Application Support'));
  });

  it('takes XDG_CONFIG_HOME elsewhere', () => {
    const file = defaultRegistryPath(host({ env: { XDG_CONFIG_HOME: '/home/me/conf' } }));
    expect(file).toBe(posix('/home/me/conf'));
  });

  it('falls back to .config under home when XDG_CONFIG_HOME is unset', () => {
    expect(defaultRegistryPath(host({}))).toBe(posix('/home/me', '.config'));
  });

  it('treats a blank variable as unset', () => {
    expect(defaultRegistryPath(host({ env: { XDG_CONFIG_HOME: '   ' } }))).toBe(
      posix('/home/me', '.config'),
    );
    expect(defaultRegistryPath(windows({ env: { APPDATA: '' } }))).toBe(
      win('C:\\Users\\me', 'AppData', 'Roaming'),
    );
  });

  it('treats a relative variable as unset, so the path never follows the working directory', () => {
    expect(defaultRegistryPath(host({ env: { XDG_CONFIG_HOME: 'conf' } }))).toBe(
      posix('/home/me', '.config'),
    );
    expect(defaultRegistryPath(windows({ env: { APPDATA: 'conf' } }))).toBe(
      win('C:\\Users\\me', 'AppData', 'Roaming'),
    );
  });

  it('refuses a relative home the same way, so the path never follows the working directory', () => {
    expect(() => defaultRegistryPath(host({ homedir: () => '.' }))).toThrow(/home directory/);
    expect(() => defaultRegistryPath(windows({ homedir: () => 'me' }))).toThrow(/home directory/);
    expect(() => defaultRegistryPath(host({ platform: 'darwin', homedir: () => '~' }))).toThrow(
      /home directory/,
    );
  });

  it('refuses when nothing answers, naming what was missing', () => {
    expect(() => defaultRegistryPath(host({ homedir: () => '' }))).toThrow(/XDG_CONFIG_HOME/);
    expect(() => defaultRegistryPath(windows({ homedir: () => '' }))).toThrow(/APPDATA/);
    expect(() =>
      defaultRegistryPath(
        host({
          platform: 'darwin',
          homedir: () => {
            throw new Error('uv_os_homedir');
          },
        }),
      ),
    ).toThrow(/no absolute home directory/);
  });

  it('still answers on a machine with no home when the variable is set', () => {
    const file = defaultRegistryPath(
      host({
        env: { XDG_CONFIG_HOME: '/etc/boardown' },
        homedir: () => {
          throw new Error('uv_os_homedir');
        },
      }),
    );
    expect(file).toBe(posix('/etc/boardown'));
  });
});
