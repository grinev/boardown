import { useRef } from 'react';
import { useDocRefSuggestions } from '../hooks/use-doc-ref-suggestions';
import { DocRefSuggestions } from './DocRefSuggestions';

interface DocRefTextareaProps {
  value: string;
  onChange: (next: string) => void;
  className?: string | undefined;
  rows?: number | undefined;
}

// A controlled textarea that offers the `[[` doc-page suggestions. The wiring is
// easy to get subtly wrong — the sync on caret moves is the part that silently
// goes missing — so the fields that need it share this instead of repeating it.
export function DocRefTextarea({
  value,
  onChange,
  className,
  rows,
}: DocRefTextareaProps) {
  const fieldRef = useRef<HTMLTextAreaElement | null>(null);
  const suggestions = useDocRefSuggestions(fieldRef, value, onChange);

  return (
    <>
      <textarea
        ref={fieldRef}
        className={className}
        value={value}
        rows={rows}
        onChange={(e) => {
          onChange(e.target.value);
          suggestions.sync();
        }}
        onSelect={suggestions.sync}
        onKeyDown={(e) => {
          suggestions.onKeyDown(e);
        }}
        // Picking a row keeps focus (the popup swallows mousedown), so a real
        // blur means the caret is gone and the popup is stale.
        onBlur={suggestions.close}
      />
      <DocRefSuggestions suggestions={suggestions} />
    </>
  );
}
