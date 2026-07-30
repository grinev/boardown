import { Check } from 'lucide-react';
import { EPIC_COLORS } from '../epic-colors';
import { pickContrastText } from '../utils/contrast-color';
import styles from './EpicColorSwatches.module.css';

interface EpicColorSwatchesProps {
  value: string;
  onSelect: (color: string) => void;
  className?: string | undefined;
}

export function EpicColorSwatches({ value, onSelect, className }: EpicColorSwatchesProps) {
  const selectedColor = value.toLowerCase();
  return (
    <div
      className={className === undefined ? styles.swatches : `${styles.swatches} ${className}`}
      role="radiogroup"
      aria-label="Epic color"
    >
      {EPIC_COLORS.map((c) => {
        const selected = c.toLowerCase() === selectedColor;
        return (
          <button
            key={c}
            type="button"
            className={selected ? `${styles.swatch} ${styles.swatchSelected}` : styles.swatch}
            // The value is data, not a theme token, so it is set inline.
            style={{ background: c }}
            role="radio"
            aria-checked={selected}
            aria-label={c}
            onClick={() => onSelect(c)}
          >
            {selected && <Check size={14} color={pickContrastText(c)} aria-hidden="true" />}
          </button>
        );
      })}
    </div>
  );
}
