import { ATTACHMENT_MAX_BYTES, AttachmentTooLargeError, type NewAttachment } from '@boardown/core';

type PickedFile = Pick<File, 'name' | 'size' | 'arrayBuffer'>;

export async function deliverAttachmentPick(
  files: readonly PickedFile[],
  isCurrent: () => boolean,
  deliver: (accepted: NewAttachment[], refused: string[]) => void,
): Promise<void> {
  const accepted: NewAttachment[] = [];
  const refused: string[] = [];
  for (const file of files) {
    if (!isCurrent()) return;
    if (file.size > ATTACHMENT_MAX_BYTES) {
      refused.push(new AttachmentTooLargeError(file.name).message);
      continue;
    }
    try {
      accepted.push({ name: file.name, content: new Uint8Array(await file.arrayBuffer()) });
    } catch (error) {
      if (isCurrent()) throw error;
      return;
    }
  }
  if (isCurrent()) deliver(accepted, refused);
}
