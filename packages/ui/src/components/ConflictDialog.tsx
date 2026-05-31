import { useBoardStore } from '../store';
import { Modal } from './Modal';
import styles from './ConflictDialog.module.css';

const noop = () => {};

export function ConflictDialog() {
  const reload = useBoardStore((s) => s.reload);

  return (
    <Modal
      open
      onClose={noop}
      ariaLabel="Board changed on disk"
      className={styles.dialog}
      dismissable={false}
    >
      <header className={styles.header}>
        <h2 className={styles.title}>Board changed on disk</h2>
      </header>
      <div className={styles.body}>
        <p className={styles.text}>
          The board files changed on disk since they were loaded — edited
          outside boardown, pulled from git, or saved in another window. Your
          last change was not written to avoid overwriting that.
        </p>
        <p className={styles.text}>Reload to pick up the latest version.</p>
        <footer className={styles.footer}>
          <button type="button" className={styles.reloadButton} onClick={() => void reload()}>
            Reload board
          </button>
        </footer>
      </div>
    </Modal>
  );
}
