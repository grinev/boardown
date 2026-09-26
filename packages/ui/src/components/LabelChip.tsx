import { X } from 'lucide-react';
import styles from './LabelChip.module.css';

interface LabelChipProps {
  label: string;
  // Present only in the editor; everywhere else a chip carries no action.
  onRemove?: (() => void) | undefined;
}

export function LabelChip({ label, onRemove }: LabelChipProps) {
  return (
    <span className={styles.chip} title={label} data-testid="label-chip">
      <span className={styles.text}>{label}</span>
      {onRemove && (
        <button
          type="button"
          className={styles.remove}
          aria-label={`Remove label ${label}`}
          // Keeps focus in the editor, so removing a chip is not a focus loss.
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          <X size={12} aria-hidden="true" />
        </button>
      )}
    </span>
  );
}
