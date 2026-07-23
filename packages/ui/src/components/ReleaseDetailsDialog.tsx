import { X } from 'lucide-react';
import type { Release, ReleaseStatus } from '@boardown/core';
import { useBoardStore } from '../store';
import { formatStatusLabel } from '../utils/format-status';
import { DialogBackButton } from './DialogBackButton';
import { InlineEditText } from './InlineEditText';
import { LinkedText } from './LinkedText';
import { Modal } from './Modal';
import styles from './ReleaseDetailsDialog.module.css';

interface ReleaseDetailsDialogProps {
  release: Release;
  onClose: () => void;
}

// Releases have no palette of their own; the three lifecycle stages map onto the
// three task-status colors, which carry the same "planned / active / closed" sense.
const STATUS_PILL_CLASS: Record<ReleaseStatus, string | undefined> = {
  future: styles.statusFuture,
  current: styles.statusCurrent,
  finished: styles.statusFinished,
};

const NO_DESCRIPTION = 'No description';

export function ReleaseDetailsDialog({
  release,
  onClose,
}: ReleaseDetailsDialogProps) {
  const updateRelease = useBoardStore((s) => s.updateRelease);

  const { status, name, description } = release.frontmatter;
  const title = name ?? release.slug;
  const readOnly = status === 'finished';
  const descriptionText = description ?? '';

  return (
    <Modal open onClose={onClose} ariaLabel={`Release ${title}`}>
      <header className={styles.header}>
        {readOnly ? (
          <h2 className={styles.nameText}>{title}</h2>
        ) : (
          <InlineEditText
            value={title}
            required
            ariaLabel="Release name"
            className={styles.nameText}
            onSave={(next) => updateRelease(release.filename, { name: next })}
          />
        )}
        <div className={styles.headerActions}>
          <DialogBackButton />
          <button
            type="button"
            className={styles.closeButton}
            aria-label="Close"
            onClick={onClose}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
      </header>
      <div className={styles.body}>
        <section className={styles.section}>
          <h3 className={styles.sectionHeading}>Status</h3>
          <span
            className={`${styles.statusPill} ${STATUS_PILL_CLASS[status] ?? ''}`}
          >
            {formatStatusLabel(status)}
          </span>
        </section>
        <section className={styles.section}>
          <h3 className={styles.sectionHeading}>Description</h3>
          {readOnly ? (
            descriptionText.trim() === '' ? (
              <p className={styles.descriptionEmpty}>{NO_DESCRIPTION}</p>
            ) : (
              <p className={styles.descriptionBody}>
                <LinkedText text={descriptionText} />
              </p>
            )
          ) : (
            <InlineEditText
              value={descriptionText}
              multiline
              placeholder={NO_DESCRIPTION}
              ariaLabel="Release description"
              className={styles.descriptionBody}
              renderView={(value) => <LinkedText text={value} />}
              onSave={(next) =>
                updateRelease(release.filename, { description: next })
              }
            />
          )}
        </section>
      </div>
    </Modal>
  );
}
