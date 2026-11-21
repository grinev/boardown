import { open } from 'node:fs/promises';
import { fileFrontmatterPrefix, readFrontmatterPrefix } from '@boardown/core';

export async function readBoardFrontmatter(
  target: { scheme: string; fsPath: string },
  readProvider: () => PromiseLike<Uint8Array>,
): Promise<string> {
  if (target.scheme !== 'file') {
    // A virtual provider only exposes whole-file reads. Do not send the body
    // across to the webview when it requested just metadata.
    return fileFrontmatterPrefix(new TextDecoder().decode(await readProvider()));
  }
  const file = await open(target.fsPath, 'r');
  try {
    return await readFrontmatterPrefix(async (position, length) => {
      const { buffer, bytesRead } = await file.read({ buffer: new Uint8Array(length), position });
      return buffer.subarray(0, bytesRead);
    }, true);
  } finally {
    await file.close();
  }
}
