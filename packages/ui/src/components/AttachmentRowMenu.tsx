import { Download, MoreHorizontal, Trash2 } from 'lucide-react';
import {
  useEffect,
  useId,
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

interface AttachmentRowMenuProps {
  name: string;
  // A task in a finished release keeps its files readable: Download stays, Delete
  // is dead — the same treatment as the task's own menu.
  deleteDisabled: boolean;
  onDownload: () => void;
  onDelete: () => void;
}

// The task actions menu's shape, with two items: a row's `…` in the Attachments
// section.
export function AttachmentRowMenu({
  name,
  deleteDisabled,
  onDownload,
  onDelete,
}: AttachmentRowMenuProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const [active, setActive] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const idBase = useId();

  const items = [
    { label: 'Download', icon: Download, disabled: false, run: onDownload },
    { label: 'Delete', icon: Trash2, disabled: deleteDisabled, run: onDelete },
  ];

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

  useEffect(() => {
    if (open && position) menuRef.current?.focus();
  }, [open, position]);

  // Escape inside a native <dialog> is a close request the browser handles itself;
  // catching the dialog's `cancel` while the menu is open dismisses only the menu.
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

  const openMenu = () => {
    setActive(0);
    setOpen(true);
  };

  const activate = (index: number) => {
    const item = items[index];
    if (!item || item.disabled) return;
    setOpen(false);
    item.run();
  };

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (
      event.key === 'ArrowDown' ||
      event.key === 'ArrowUp' ||
      event.key === 'Enter' ||
      event.key === ' '
    ) {
      event.preventDefault();
      openMenu();
    }
  };

  const handleMenuKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((i) => (i + 1) % items.length);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      activate(active);
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
        aria-label={`Actions for ${name}`}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={handleTriggerKeyDown}
      >
        <MoreHorizontal size={16} aria-hidden="true" />
      </button>
      {open && position && (
        <ul
          role="menu"
          className={styles.menu}
          style={{ position: 'fixed', top: position.top, right: position.right }}
          tabIndex={-1}
          ref={menuRef}
          aria-activedescendant={`${idBase}-${active}`}
          onKeyDown={handleMenuKeyDown}
        >
          {items.map((item, index) => {
            const Icon = item.icon;
            const classes = [
              styles.item,
              item.disabled ? styles.itemDisabled : '',
              index === active && !item.disabled ? styles.itemActive : '',
            ];
            return (
              <li
                key={item.label}
                id={`${idBase}-${index}`}
                role="menuitem"
                aria-disabled={item.disabled}
                className={classes.filter(Boolean).join(' ')}
                onMouseEnter={() => setActive(index)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  activate(index);
                }}
              >
                <Icon size={14} aria-hidden="true" />
                <span>{item.label}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
