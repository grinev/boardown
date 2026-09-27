import { File as FileIcon, Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import {
  ATTACHMENT_MAX_BYTES,
  AttachmentTooLargeError,
  attachmentProjectPath,
  type Attachment,
  type NewAttachment,
} from '@boardown/core';
import { useImageUrl } from '../hooks/use-image-url';
import { useBoardStore } from '../store';
import { formatFileSize } from '../utils/file-size';
import { AttachmentRowMenu } from './AttachmentRowMenu';
import { DeleteAttachmentDialog } from './DeleteAttachmentDialog';
import styles from './Attachments.module.css';

const byName = (a: string, b: string): number =>
  a.toLowerCase().localeCompare(b.toLowerCase()) || a.localeCompare(b);

// A file over the cap is refused before its bytes are read, and the rest of the
// pick goes on without it.
const readPicked = async (
  list: FileList,
): Promise<{ accepted: NewAttachment[]; refused: string[] }> => {
  const accepted: NewAttachment[] = [];
  const refused: string[] = [];
  for (const file of Array.from(list)) {
    if (file.size > ATTACHMENT_MAX_BYTES) {
      refused.push(new AttachmentTooLargeError(file.name).message);
      continue;
    }
    accepted.push({ name: file.name, content: new Uint8Array(await file.arrayBuffer()) });
  }
  return { accepted, refused };
};

interface HeadingProps {
  count: number;
  // Null drops the `+` altogether: a finished release takes no new files.
  onPick: ((files: NewAttachment[], refused: string[]) => void) | null;
  messages: string[];
  headingClassName?: string | undefined;
}

function AttachmentsHeading({ count, onPick, messages, headingClassName }: HeadingProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const list = input.files;
    if (onPick === null || list === null || list.length === 0) return;
    const { accepted, refused } = await readPicked(list);
    // Cleared so picking the same file again still reports a change.
    input.value = '';
    onPick(accepted, refused);
  };

  return (
    <>
      <div className={styles.heading}>
        <h3 className={headingClassName ?? styles.headingText}>Attachments</h3>
        {count > 0 && <span className={styles.count}>{count}</span>}
        {onPick !== null && (
          <>
            <button
              type="button"
              className={styles.addButton}
              aria-label="Attach files"
              onClick={() => inputRef.current?.click()}
            >
              <Plus size={16} aria-hidden="true" />
            </button>
            <input
              ref={inputRef}
              type="file"
              multiple
              hidden
              tabIndex={-1}
              onChange={(e) => void handleChange(e)}
            />
          </>
        )}
      </div>
      {messages.map((message) => (
        <p key={message} className={styles.message} role="alert">
          {message}
        </p>
      ))}
    </>
  );
}

interface ThumbnailProps {
  name: string;
  bytes: Uint8Array | null;
}

// The file icon, or the picture itself in the icon's square once its bytes are
// read — and back to the icon if the browser cannot decode them.
function AttachmentThumbnail({ name, bytes }: ThumbnailProps) {
  const url = useImageUrl(bytes, name);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [url]);

  if (url === null || failed) {
    return <FileIcon className={styles.fileIcon} size={16} aria-hidden="true" />;
  }
  return (
    <img
      className={styles.thumbnail}
      src={url}
      alt=""
      aria-hidden="true"
      data-testid="attachment-thumbnail"
      onError={() => setFailed(true)}
    />
  );
}

interface TaskAttachmentsProps {
  taskId: string;
  readOnly: boolean;
}

// The task dialog's section. The folder is the only record of a task's files,
// so the list is read each time the dialog opens and after every change it makes.
export function TaskAttachments({ taskId, readOnly }: TaskAttachmentsProps) {
  const listTaskAttachments = useBoardStore((s) => s.listTaskAttachments);
  const readTaskAttachmentPreviews = useBoardStore((s) => s.readTaskAttachmentPreviews);
  const addTaskAttachments = useBoardStore((s) => s.addTaskAttachments);
  const downloadTaskAttachment = useBoardStore((s) => s.downloadTaskAttachment);
  const openRepoFilePopup = useBoardStore((s) => s.openRepoFilePopup);

  const [attachments, setAttachments] = useState<Attachment[] | null>(null);
  const [previews, setPreviews] = useState<Map<string, Uint8Array>>(new Map());
  const [messages, setMessages] = useState<string[]>([]);
  const [deleting, setDeleting] = useState<string | null>(null);
  const live = useRef(true);

  // The rows show as soon as the folder is listed; thumbnails replace their icons
  // once the pictures are read.
  const refresh = useCallback(async () => {
    let next: Attachment[];
    try {
      next = await listTaskAttachments(taskId);
    } catch {
      next = [];
    }
    if (!live.current) return;
    setAttachments(next);
    const read = await readTaskAttachmentPreviews(next);
    if (live.current) setPreviews(read);
  }, [listTaskAttachments, readTaskAttachmentPreviews, taskId]);

  useEffect(() => {
    live.current = true;
    setAttachments(null);
    setPreviews(new Map());
    void refresh();
    return () => {
      live.current = false;
    };
  }, [refresh]);

  const handlePick = async (files: NewAttachment[], refused: string[]) => {
    setMessages(refused);
    if (files.length === 0) return;
    try {
      await addTaskAttachments(taskId, files);
    } catch {
      // The store has put the failure where failures go; the list shows what is
      // on disk either way.
    }
    await refresh();
  };

  const handleDownload = async (name: string) => {
    setMessages([]);
    try {
      if ((await downloadTaskAttachment(taskId, name)) === 'not-found') {
        setMessages(['File not found']);
        await refresh();
      }
    } catch {
      // Reported by the store.
    }
  };

  return (
    <section className={styles.section} data-testid="attachments">
      <AttachmentsHeading
        count={attachments?.length ?? 0}
        onPick={readOnly ? null : (files, refused) => void handlePick(files, refused)}
        messages={messages}
      />
      {attachments === null ? (
        <p className={styles.loading}>Loading…</p>
      ) : (
        attachments.length > 0 && (
          <div className={styles.table}>
            {attachments.map((attachment) => (
              <div key={attachment.name} className={styles.row}>
                <AttachmentThumbnail
                  name={attachment.name}
                  bytes={previews.get(attachment.name) ?? null}
                />
                <button
                  type="button"
                  className={styles.nameButton}
                  onClick={() => openRepoFilePopup(attachmentProjectPath(taskId, attachment.name))}
                >
                  {attachment.name}
                </button>
                <span className={styles.size}>{formatFileSize(attachment.size)}</span>
                <AttachmentRowMenu
                  name={attachment.name}
                  deleteDisabled={readOnly}
                  onDownload={() => void handleDownload(attachment.name)}
                  onDelete={() => {
                    setMessages([]);
                    setDeleting(attachment.name);
                  }}
                />
              </div>
            ))}
          </div>
        )
      )}
      {deleting !== null && (
        <DeleteAttachmentDialog
          taskId={taskId}
          name={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            setDeleting(null);
            void refresh();
          }}
        />
      )}
    </section>
  );
}

interface CreateTaskAttachmentsProps {
  files: NewAttachment[];
  onChange: (files: NewAttachment[]) => void;
  headingClassName?: string | undefined;
}

// Create task's field: the picked files stay in the form, and nothing is written
// until Create. Nothing exists yet to preview or download, so a row only drops.
export function CreateTaskAttachments({ files, onChange, headingClassName }: CreateTaskAttachmentsProps) {
  const [messages, setMessages] = useState<string[]>([]);
  const sorted = [...files].sort((a, b) => byName(a.name, b.name));

  return (
    <section className={styles.section} data-testid="attachments">
      <AttachmentsHeading
        count={files.length}
        onPick={(picked, refused) => {
          setMessages(refused);
          if (picked.length > 0) onChange([...files, ...picked]);
        }}
        messages={messages}
        headingClassName={headingClassName}
      />
      {sorted.length > 0 && (
        <div className={styles.table}>
          {sorted.map((file, index) => (
            // Two picked files may share a name, so the key carries the position.
            <div key={`${index}:${file.name}`} className={styles.row}>
              <FileIcon className={styles.fileIcon} size={16} aria-hidden="true" />
              <span className={styles.nameText}>{file.name}</span>
              <span className={styles.size}>{formatFileSize(file.content.byteLength)}</span>
              <button
                type="button"
                className={styles.removeButton}
                aria-label={`Remove ${file.name}`}
                onClick={() => onChange(files.filter((f) => f !== file))}
              >
                <Trash2 size={14} aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
