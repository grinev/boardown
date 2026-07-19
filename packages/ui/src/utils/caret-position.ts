// Viewport coordinates: a popup following the caret has to escape the dialog it
// sits in, which clips its own overflow, so it is positioned against the window
// rather than against any ancestor.
export interface CaretPoint {
  // Just below the caret's line, so a popup anchored here does not cover it.
  top: number;
  left: number;
  // Height of the caret's line, so a popup can step back over it when it has to
  // open upwards instead.
  lineHeight: number;
}

// Everything that affects where a glyph lands, so the mirror wraps exactly the
// way the textarea does.
const MIRRORED_STYLES = [
  'box-sizing',
  'border-bottom-width',
  'border-left-width',
  'border-right-width',
  'border-top-width',
  'font-family',
  'font-size',
  'font-stretch',
  'font-style',
  'font-variant',
  'font-weight',
  'letter-spacing',
  'line-height',
  'padding-bottom',
  'padding-left',
  'padding-right',
  'padding-top',
  'tab-size',
  'text-indent',
  'text-transform',
  'word-spacing',
] as const;

// A textarea exposes no caret geometry, so the usual trick applies: render the
// text up to the caret into an off-screen div carrying the textarea's own metrics
// and measure a marker placed at the end of it.
export const caretPoint = (
  el: HTMLTextAreaElement,
  offset: number,
): CaretPoint => {
  const computed = window.getComputedStyle(el);
  const mirror = document.createElement('div');

  for (const prop of MIRRORED_STYLES) {
    mirror.style.setProperty(prop, computed.getPropertyValue(prop));
  }
  mirror.style.position = 'absolute';
  mirror.style.top = '0';
  mirror.style.left = '-9999px';
  mirror.style.visibility = 'hidden';
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.overflowWrap = 'break-word';
  mirror.style.width = `${el.clientWidth}px`;

  mirror.textContent = el.value.slice(0, offset);
  const marker = document.createElement('span');
  // A zero-width space still lays out, so the marker has a position even at the
  // start of a line.
  marker.textContent = '​';
  mirror.appendChild(marker);

  document.body.appendChild(mirror);
  const top = marker.offsetTop;
  const left = marker.offsetLeft;
  const lineHeight = marker.offsetHeight;
  document.body.removeChild(mirror);

  // The marker's offsets are relative to the mirror's border box, which carries
  // the textarea's own border and padding, so adding the field's viewport
  // position lands on the caret.
  const box = el.getBoundingClientRect();
  return {
    top: box.top + top + lineHeight - el.scrollTop,
    left: box.left + left - el.scrollLeft,
    lineHeight,
  };
};
