import { describe, expect, it } from 'vitest';
import { classifyNavigation } from './external-links';

const DEV = 'http://localhost:5173/';
const PACKAGED = 'file:///C:/Program%20Files/boardown/renderer/index.html';

describe('classifyNavigation', () => {
  it('hands http and https to the OS', () => {
    expect(classifyNavigation('https://github.com/grinev/boardown', DEV)).toBe('external');
    expect(classifyNavigation('http://example.com/page', PACKAGED)).toBe('external');
  });

  it('refuses every other scheme', () => {
    for (const target of [
      'mailto:someone@example.com',
      'tel:+15551234567',
      'file:///C:/Windows/System32/calc.exe',
      'custom-app://do-something',
      'javascript:alert(1)',
      'data:text/html,<h1>hi</h1>',
    ]) {
      expect(classifyNavigation(target, PACKAGED)).toBe('blocked');
    }
  });

  it('refuses a URL it cannot parse', () => {
    expect(classifyNavigation('not a url', DEV)).toBe('blocked');
    expect(classifyNavigation('', DEV)).toBe('blocked');
  });

  it('lets the app navigate within its own document', () => {
    expect(classifyNavigation('http://localhost:5173/#section', DEV)).toBe('in-app');
    expect(classifyNavigation(`${PACKAGED}#section`, PACKAGED)).toBe('in-app');
  });

  // A prefix match would let localhost:51730 pass for localhost:5173.
  it('compares origins rather than string prefixes', () => {
    expect(classifyNavigation('http://localhost:51730/evil', DEV)).toBe('external');
    expect(classifyNavigation('http://localhost.evil.com/', DEV)).toBe('external');
  });

  // Same origin is not same document: under the dev server every path Vite
  // serves shares the board's origin, and none of them is the board.
  it('does not treat another path on the dev origin as the app document', () => {
    expect(classifyNavigation('http://localhost:5173/@vite/client', DEV)).toBe('external');
    expect(classifyNavigation('http://localhost:5173/src/main.tsx', DEV)).toBe('external');
    expect(classifyNavigation('http://localhost:5173/?x=1', DEV)).toBe('external');
  });

  // The packaged renderer must not be talked into loading a different local file.
  it('refuses a file: URL that is not the app document', () => {
    expect(classifyNavigation('file:///C:/Program%20Files/boardown/other.html', PACKAGED)).toBe(
      'blocked',
    );
  });

  it('does not treat a file: target as the dev document', () => {
    expect(classifyNavigation(PACKAGED, DEV)).toBe('blocked');
  });
});
