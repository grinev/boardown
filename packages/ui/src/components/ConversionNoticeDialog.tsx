import { X } from 'lucide-react';
import { useBoardStore } from '../store';
import { Modal } from './Modal';
import styles from './ConversionNoticeDialog.module.css';

export function ConversionNoticeDialog() {
  const dismiss = useBoardStore((s) => s.dismissConversionNotice);

  return (
    <Modal open onClose={dismiss} ariaLabel="Backlog moved to one file" className={styles.dialog}>
      <header className={styles.header}>
        <h2 className={styles.title}>Backlog moved to one file</h2>
        <button type="button" className={styles.closeButton} aria-label="Close" onClick={dismiss}>
          <X size={18} aria-hidden="true" />
        </button>
      </header>
      <div className={styles.body}>
        <p className={styles.text}>
          boardown 0.11 converted this board: every backlog task now lives in{' '}
          <code className={styles.path}>.boardown/backlog.md</code>, and epic files keep only
          the epic&apos;s name, colour and description. One file keeps backlog changes small in
          git diffs.
        </p>
        <p className={styles.text}>Builds older than 0.11 can no longer open this board.</p>
        <footer className={styles.footer}>
          <button type="button" className={styles.okButton} onClick={dismiss} data-autofocus>
            Got it
          </button>
        </footer>
      </div>
    </Modal>
  );
}
