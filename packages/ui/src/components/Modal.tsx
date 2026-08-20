import {
  useEffect,
  useRef,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type SyntheticEvent,
} from 'react';
import styles from './Modal.module.css';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  ariaLabel: string;
  children: ReactNode;
  className?: string | undefined;
  dismissable?: boolean;
  // Passed straight to the <dialog>. That element is the only one containing
  // every focus position in the dialog: a click on inert space parks focus on
  // it, and a handler on any descendant never sees the keystroke.
  onKeyDown?: ((event: KeyboardEvent<HTMLDialogElement>) => void) | undefined;
}

export function Modal({
  open,
  onClose,
  ariaLabel,
  children,
  className,
  dismissable = true,
  onKeyDown,
}: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      // React's `autoFocus` is dead in here: it fires at mount, while the dialog
      // is still closed and nothing inside it is focusable. A dialog declares its
      // first field with an attribute the DOM keeps, and showModal()'s own
      // fallback — the first focusable element, i.e. the header close button —
      // is overridden in the same tick, before the browser paints.
      dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleClose = () => {
      if (open) onClose();
    };
    dialog.addEventListener('close', handleClose);
    return () => dialog.removeEventListener('close', handleClose);
  }, [open, onClose]);

  const handleBackdropMouseDown = (event: MouseEvent<HTMLDialogElement>) => {
    if (!dismissable) return;
    if (event.target === dialogRef.current) {
      dialogRef.current?.close();
    }
  };

  const handleCancel = (event: SyntheticEvent<HTMLDialogElement>) => {
    if (!dismissable) {
      event.preventDefault();
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className={className ? `${styles.dialog} ${className}` : styles.dialog}
      aria-label={ariaLabel}
      onMouseDown={handleBackdropMouseDown}
      onCancel={handleCancel}
      onKeyDown={onKeyDown}
    >
      <div className={styles.content}>{children}</div>
    </dialog>
  );
}
