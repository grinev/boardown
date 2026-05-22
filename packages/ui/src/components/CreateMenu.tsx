import { Layers, Plus, SquareCheckBig, Tag, type LucideIcon } from 'lucide-react';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { useBoardStore } from '../store';
import styles from './CreateMenu.module.css';

interface MenuPosition {
  top: number;
  right: number;
}

interface MenuItem {
  key: string;
  label: string;
  icon: LucideIcon;
  color: string;
  action: () => void;
  disabled?: boolean;
}

export function CreateMenu() {
  const status = useBoardStore((s) => s.status);
  const openCreateTaskMenu = useBoardStore((s) => s.openCreateTaskMenu);
  const openCreateEpic = useBoardStore((s) => s.openCreateEpic);
  const openCreateRelease = useBoardStore((s) => s.openCreateRelease);

  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);

  const items: MenuItem[] = [
    {
      key: 'task',
      label: 'Task',
      icon: SquareCheckBig,
      color: 'var(--create-task)',
      action: openCreateTaskMenu,
    },
    {
      key: 'epic',
      label: 'Epic',
      icon: Layers,
      color: 'var(--type-epic)',
      action: openCreateEpic,
    },
    {
      key: 'release',
      label: 'Release',
      icon: Tag,
      color: 'var(--create-release)',
      action: openCreateRelease,
    },
  ];

  const disabled = status !== 'ready';

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
    if (open) {
      const first = items.findIndex((i) => !i.disabled);
      setHighlightedIndex(first === -1 ? 0 : first);
      menuRef.current?.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const closeAndFocusTrigger = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const activateAt = (index: number) => {
    const item = items[index];
    if (!item || item.disabled) return;
    setOpen(false);
    item.action();
  };

  const moveHighlight = (delta: number) => {
    setHighlightedIndex((current) => {
      let next = current;
      for (let i = 0; i < items.length; i++) {
        next = (next + delta + items.length) % items.length;
        if (!items[next]!.disabled) return next;
      }
      return current;
    });
  };

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
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
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveHighlight(1);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveHighlight(-1);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      activateAt(highlightedIndex);
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
        aria-label="Create"
        disabled={disabled}
        onClick={() => !disabled && setOpen((v) => !v)}
        onKeyDown={handleTriggerKeyDown}
      >
        <Plus size={16} aria-hidden="true" />
        <span className={styles.label}>Create</span>
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
          {items.map((item, index) => {
            const Icon = item.icon;
            const isHighlighted = index === highlightedIndex;
            return (
              <li
                key={item.key}
                role="menuitem"
                aria-disabled={item.disabled}
                className={`${styles.item}${
                  isHighlighted && !item.disabled ? ` ${styles.itemHighlighted}` : ''
                }${item.disabled ? ` ${styles.itemDisabled}` : ''}`}
                onMouseEnter={() => !item.disabled && setHighlightedIndex(index)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  activateAt(index);
                }}
              >
                <Icon
                  size={14}
                  style={{ color: item.disabled ? undefined : item.color }}
                  aria-hidden="true"
                />
                <span>{item.label}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
