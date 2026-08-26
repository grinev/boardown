import { useBoardStore } from '../store';
import { Modal } from './Modal';
import styles from './UnwritableFileDialog.module.css';

interface UnwritableFileDialogProps {
  path: string;
  problems: readonly { message: string }[];
}

export function UnwritableFileDialog({ path, problems }: UnwritableFileDialogProps) {
  const reload = useBoardStore((s) => s.reload);
  const close = useBoardStore((s) => s.closeUnwritable);

  return (
    <Modal open onClose={close} ariaLabel="File cannot be written" className={styles.dialog}>
      <header className={styles.header}>
        <h2 className={styles.title}>File cannot be written</h2>
      </header>
      <div className={styles.body}>
        <p className={styles.text}>
          <code className={styles.path}>{path}</code> contains a block boardown could
          not read. Writing the file would lose that block, so your change was not
          saved.
        </p>
        <p className={styles.text}>Fix the block in your editor, then reload.</p>
        <ul className={styles.problems}>
          {problems.map((p, i) => (
            <li key={i}>{p.message}</li>
          ))}
        </ul>
        <footer className={styles.footer}>
          <button type="button" className={styles.closeButton} onClick={close}>
            Close
          </button>
          <button type="button" className={styles.reloadButton} onClick={() => void reload()}>
            Reload board
          </button>
        </footer>
      </div>
    </Modal>
  );
}
