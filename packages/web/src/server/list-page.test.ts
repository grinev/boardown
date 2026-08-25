import { describe, expect, it } from 'vitest';
import type { BoardListRow } from './board-list';
import { renderListPage } from './list-page';

const row = (id: string): BoardListRow => ({
  id,
  name: id,
  projectRoot: `/projects/${id}`,
  reason: null,
});

describe('renderListPage', () => {
  it('says a registry with nothing in it lists no projects', () => {
    const html = renderListPage([], null);
    expect(html).toContain('The registry lists no projects.');
    expect(html).not.toContain('could not be read');
  });

  it('keeps the rows of a mapping that has gone stale, and says why', () => {
    const html = renderListPage([row('shop')], 'invalid YAML: bad indentation');
    expect(html).toContain('could not be read (invalid YAML: bad indentation)');
    expect(html).toContain('Showing the last version that loaded.');
    expect(html).toContain('/projects/shop');
  });

  it('does not promise a last version that loaded when none did', () => {
    const html = renderListPage([], 'invalid YAML: bad indentation');
    expect(html).toContain('could not be read (invalid YAML: bad indentation)');
    expect(html).not.toContain('Showing the last version');
    expect(html).not.toContain('The registry lists no projects.');
  });

  it('escapes the reason, which carries a message from outside', () => {
    const html = renderListPage([], '<script>alert(1)</script>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
