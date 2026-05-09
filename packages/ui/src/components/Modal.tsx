import { useEffect, useRef, type MouseEvent, type ReactNode } from 'react';
import styles from './Modal.module.css';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  ariaLabel: string;
  children: ReactNode;
  className?: string | undefined;
}

export function Modal({ open, onClose, ariaLabel, children, className }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
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
    if (event.target === dialogRef.current) {
      dialogRef.current?.close();
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className={className ? `${styles.dialog} ${className}` : styles.dialog}
      aria-label={ariaLabel}
      onMouseDown={handleBackdropMouseDown}
    >
      <div className={styles.content}>{children}</div>
    </dialog>
  );
}
