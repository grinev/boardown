import { useLayoutEffect, useRef, type RefObject } from 'react';

type Field = HTMLInputElement | HTMLTextAreaElement;

// Collapsing the field to measure it shrinks its scroll container's content, and
// a container scrolled near its end has its offset clamped by the browser and
// never given back. Recording the offsets first is what keeps a long description
// from jumping under the caret on every keystroke.
const scrolledAncestors = (el: HTMLElement): Array<[Element, number]> => {
  const saved: Array<[Element, number]> = [];
  for (let node = el.parentElement; node; node = node.parentElement) {
    if (node.scrollTop > 0) saved.push([node, node.scrollTop]);
  }
  return saved;
};

const fit = (el: HTMLTextAreaElement): void => {
  const saved = scrolledAncestors(el);
  el.style.height = 'auto';
  // `scrollHeight` never falls below the padding box, which at `height: auto` is
  // the field's own `rows` height — so this is also what keeps every field at the
  // height it has today, with no minimum written down anywhere.
  const content = el.scrollHeight;
  if (content === 0) {
    // Mounted inside a dialog that has not been shown yet: nothing is measurable,
    // so leave the field to its CSS. The observer re-fits it once it has a box.
    el.style.height = '';
    return;
  }
  // `scrollHeight` excludes the border, which `box-sizing: border-box` counts.
  el.style.height = `${content + el.offsetHeight - el.clientHeight}px`;
  for (const [node, top] of saved) node.scrollTop = top;
};

// Sizes a textarea to its text. Shared rather than repeated because a field that
// quietly loses it looks right until someone types past the fold.
//
// It re-fits after every render rather than watching the text: `InlineEditText`
// mounts its textarea on entering edit mode with a draft that is often already
// equal to the stored value, so a value the hook could compare against would not
// change at the one moment the field appears.
export const useAutoGrow = (ref: RefObject<Field | null>): void => {
  const widthRef = useRef(-1);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!(el instanceof HTMLTextAreaElement)) return;
    fit(el);
    widthRef.current = el.offsetWidth;

    // Three things change what the field has to measure: its dialog opening (it
    // has no box until then), the viewport resizing under a `92vw` dialog, and
    // the scroll container gaining a scrollbar as the field grows past the
    // dialog's cap. All three move the width, which is what this watches — the
    // height set above must not feed back in.
    //
    // The observer is built and dropped by the same effect rather than kept
    // across renders: an observer whose teardown lives somewhere else is one a
    // re-run can leave disconnected, which is exactly what StrictMode's
    // mount-unmount-mount does in every dev build.
    const observer = new ResizeObserver(() => {
      if (el.offsetWidth === widthRef.current) return;
      widthRef.current = el.offsetWidth;
      fit(el);
    });
    observer.observe(el);
    return () => observer.disconnect();
  });
};
