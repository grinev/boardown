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
  // Called when Escape or the backdrop was refused because `dismissable` is
  // false — the dialog's own ✕ and Cancel go straight to `onClose` and never come
  // through here. A dialog holding unsaved input asks its own question from this.
  onDismissBlocked?: (() => void) | undefined;
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
  onDismissBlocked,
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
    // Anything else is a click inside the dialog — or, when a dialog is stacked
    // on this one, a click on *its* backdrop bubbling through on the way up.
    if (event.target !== dialogRef.current) return;
    if (!dismissable) {
      onDismissBlocked?.();
      return;
    }
    dialogRef.current?.close();
  };

  const handleCancel = (event: SyntheticEvent<HTMLDialogElement>) => {
    // React walks its own tree for `cancel`, so a dialog stacked on this one has
    // its Escape offered here too — even though the DOM event does not bubble.
    // Answering it would prevent the close request the child is entitled to.
    if (event.target !== dialogRef.current) return;
    // A picker inside the dialog takes the first Escape for itself, by preventing
    // this very event from a capture listener. That one is spoken for.
    if (event.defaultPrevented) return;
    if (dismissable) return;
    event.preventDefault();
    onDismissBlocked?.();
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
