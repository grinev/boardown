import { expect, it, vi } from 'vitest';
import { chooseFolder, FolderChooserUnavailable } from './folder-chooser';

it('starts the built-in Windows chooser and returns the selected path as written', async () => {
  const run = vi.fn().mockResolvedValue('C:\\Project with spaces');
  await expect(chooseFolder('win32', run)).resolves.toBe('C:\\Project with spaces');
  expect(run).toHaveBeenCalledWith(
    expect.stringMatching(/powershell\.exe$/i),
    expect.arrayContaining(['-STA']),
  );
});

it('treats cancellation as no selection without trying another chooser', async () => {
  await expect(chooseFolder('win32', vi.fn().mockResolvedValue(''))).resolves.toBeNull();
  await expect(
    chooseFolder('darwin', vi.fn().mockRejectedValue({ code: 1, stderr: 'User canceled. (-128)' })),
  ).resolves.toBeNull();
  const linux = vi.fn().mockRejectedValue({ code: 1, stderr: '' });
  await expect(chooseFolder('linux', linux)).resolves.toBeNull();
  expect(linux).toHaveBeenCalledTimes(1);
});

it('tries the other Linux tool if one is absent and explains when neither works', async () => {
  const run = vi
    .fn<(command: string, args: string[]) => Promise<string>>()
    .mockRejectedValueOnce({ code: 'ENOENT' })
    .mockResolvedValueOnce('/another project \n');
  await expect(chooseFolder('linux', run)).resolves.toBe('/another project ');
  expect(run.mock.calls.map(([program]) => program)).toEqual(['zenity', 'kdialog']);
  await expect(
    chooseFolder('linux', vi.fn().mockRejectedValue({ code: 'ENOENT' })),
  ).rejects.toThrow(FolderChooserUnavailable);
});
