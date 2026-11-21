import { X } from 'lucide-react';
import { useBoardStore } from '../store';
import { Modal } from './Modal';
import styles from './ConversionNoticeDialog.module.css';

export function TaskIdRepairNotice() {
  const repairs = useBoardStore((s) => s.taskIdRepairs);
  const dismiss = useBoardStore((s) => s.dismissTaskIdRepairs);
  return (
    <Modal open onClose={dismiss} ariaLabel="Task IDs repaired" className={styles.dialog}>
      <header className={styles.header}>
        <h2 className={styles.title}>Task IDs repaired</h2>
        <button type="button" className={styles.closeButton} aria-label="Close" onClick={dismiss}>
          <X size={18} aria-hidden="true" />
        </button>
      </header>
      <div className={styles.body}>
        <ul>
          {repairs.map(({ oldId, newId, title }) => (
            <li key={newId}>
              {oldId} → {newId}: {title}
            </li>
          ))}
        </ul>
        <footer className={styles.footer}>
          <button type="button" className={styles.okButton} onClick={dismiss} data-autofocus>
            Got it
          </button>
        </footer>
      </div>
    </Modal>
  );
}
