import { type Attachment, ATTACHMENT_MAX_BYTES } from './attachments.js';
import type { FsAdapter } from './fs-adapter.js';
import { classifyProjectFile, isImageFile } from './project-file.js';

// The bytes of each listed attachment that shows as a picture, by name. A file
// the classifier would open as text, one over the cap, and one that cannot be
// read — gone since it was listed, say — have no entry, so their rows keep the
// file icon while the others still get theirs. Nothing is written.
export const readAttachmentPreviews = async (
  fs: FsAdapter,
  attachments: readonly Attachment[],
): Promise<Map<string, Uint8Array>> => {
  const previews = new Map<string, Uint8Array>();
  for (const attachment of attachments) {
    if (!isImageFile(attachment.name) || attachment.size > ATTACHMENT_MAX_BYTES) continue;
    let bytes: Uint8Array;
    try {
      bytes = await fs.readBytes(attachment.path);
    } catch {
      continue;
    }
    const read = classifyProjectFile(attachment.name, bytes);
    if (read.kind === 'image') previews.set(attachment.name, read.bytes);
  }
  return previews;
};
