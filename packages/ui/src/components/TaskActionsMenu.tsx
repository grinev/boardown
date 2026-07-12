import { MoreHorizontal, Trash2 } from 'lucide-react';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import styles from './TaskActionsMenu.module.css';

interface MenuPosition {
  top: number;
  right: number;
}

interface TaskActionsMenuProps {
  // A task in a finished release is read-only: the menu still opens, its one action
  // is dead.
  deleteDisabled: boolean;
  onDelete: () => void;
}

export function TaskActionsMenu({ deleteDisabled, onDelete }: TaskActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (target == null) return;
      if (containerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [open]);

  // Fixed positioning off the trigger's rect, so the menu escapes the dialog's
  // overflow instead of being clipped by it.
  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    const update = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      setPosition({
        top: rect.bottom + 4,
        right: window.innerWidth - rect.right,
      });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open]);

  // The menu only mounts once its position is known, so focus has to wait for that
  // render — otherwise the keyboard never enters the menu and Escape/Enter go to the
  // trigger instead.
  useEffect(() => {
    if (open && position) menuRef.current?.focus();
  }, [open, position]);

  // Escape inside a native <dialog> is a close request the browser handles itself:
  // preventing the keydown does not stop it. Catching the dialog's `cancel` while
  // the menu is open lets Escape dismiss the menu without closing the task dialog.
  useEffect(() => {
    if (!open) return;
    const handler = (event: Event) => {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    };
    window.addEventListener('cancel', handler, true);
    return () => window.removeEventListener('cancel', handler, true);
  }, [open]);

  const closeAndFocusTrigger = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const activate = () => {
    if (deleteDisabled) return;
    setOpen(false);
    onDelete();
  };

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (
      event.key === 'ArrowDown' ||
      event.key === 'ArrowUp' ||
      event.key === 'Enter' ||
      event.key === ' '
    ) {
      event.preventDefault();
      setOpen(true);
    }
  };

  const handleMenuKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeAndFocusTrigger();
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      activate();
      return;
    }
    if (event.key === 'Tab') {
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className={styles.root}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Task actions"
        onClick={() => setOpen((v) => !v)}
        onKeyDown={handleTriggerKeyDown}
      >
        <MoreHorizontal size={18} aria-hidden="true" />
      </button>
      {open && position && (
        <ul
          role="menu"
          className={styles.menu}
          style={{ position: 'fixed', top: position.top, right: position.right }}
          tabIndex={-1}
          ref={menuRef}
          onKeyDown={handleMenuKeyDown}
        >
          <li
            role="menuitem"
            aria-disabled={deleteDisabled}
            className={`${styles.item}${deleteDisabled ? ` ${styles.itemDisabled}` : ''}`}
            onMouseDown={(e) => {
              e.preventDefault();
              activate();
            }}
          >
            <Trash2 size={14} aria-hidden="true" />
            <span>Delete</span>
          </li>
        </ul>
      )}
    </div>
  );
}
