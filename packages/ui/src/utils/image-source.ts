import { imageMimeType, isSvgFile } from '@boardown/core';

const toBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  // In slices: spreading a whole large file into one call overflows the stack.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
};

export type ImageSource = { kind: 'url'; url: string } | { kind: 'blob'; blob: Blob };

// What an `<img>` shows `bytes` from, typed by the file's name. A picture becomes
// a blob for a local object URL. An svg becomes a `data:` address instead: an
// object URL carries the app's origin, so an svg opened on its own tab would run
// its script as boardown, while a `data:` document gets an opaque origin that no
// write endpoint accepts.
export const imageSource = (bytes: Uint8Array, path: string): ImageSource => {
  const type = imageMimeType(path) ?? 'application/octet-stream';
  if (isSvgFile(path)) return { kind: 'url', url: `data:${type};base64,${toBase64(bytes)}` };
  return { kind: 'blob', blob: new Blob([bytes.slice()], { type }) };
};
