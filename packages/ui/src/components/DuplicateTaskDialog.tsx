import { X } from 'lucide-react';
import { useState } from 'react';
import type { DuplicateTaskIds, ParseProblem } from '@boardown/core';
import { useBoardStore } from '../store';
import { DialogBackButton } from './DialogBackButton';
import { Modal } from './Modal';
import styles from './ConversionNoticeDialog.module.css';

export function DuplicateTaskDialog({
  group,
  onClose,
}: {
  group: DuplicateTaskIds;
  onClose: () => void;
}) {
  const repair = useBoardStore((s) => s.repairTaskIds);
  const [running, setRunning] = useState(false);
  const [problems, setProblems] = useState<ParseProblem[]>([]);
  const [error, setError] = useState<string>();

  const submit = async (): Promise<void> => {
    setRunning(true);
    setError(undefined);
    try {
      setProblems(
        (await repair(group.id)).filter((problem) => problem.duplicateTaskIds === undefined),
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setRunning(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      ariaLabel={`Duplicate task ID ${group.id}`}
      className={styles.dialog}
    >
      <header className={styles.header}>
        <h2 className={styles.title}>Duplicate task ID {group.id}</h2>
        <DialogBackButton />
        <button type="button" className={styles.closeButton} aria-label="Close" onClick={onClose}>
          <X size={18} aria-hidden="true" />
        </button>
      </header>
      <div className={styles.body}>
        <p className={styles.text}>
          More than one task has this ID. Repair IDs before editing or moving these tasks.
        </p>
        <ul>
          {group.copies.map(({ title, file, taskIndex }) => (
            <li key={`${file}:${taskIndex}`}>
              {title} — <code className={styles.path}>{file}</code>, task block {taskIndex + 1}
            </li>
          ))}
        </ul>
        {problems.length > 0 && (
          <section aria-label="Repair blockers" role="alert">
            <strong>These IDs cannot be repaired safely:</strong>
            <ul>
              {problems.map((problem, index) => (
                <li key={index}>
                  {problem.file}: {problem.message}
                </li>
              ))}
            </ul>
          </section>
        )}
        {error !== undefined && <p role="alert">{error}</p>}
        <footer className={styles.footer}>
          <button
            type="button"
            className={styles.okButton}
            onClick={() => void submit()}
            disabled={running}
          >
            {running ? 'Checking…' : 'Repair IDs'}
          </button>
        </footer>
      </div>
    </Modal>
  );
}
