import { describe, expect, it } from 'vitest';
import type { BoardListRow } from './board-list';
import { renderListPage, renderProjects } from './list-page';

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
    expect(html).toContain('&lt;script&gt;');
    // The page's own inline script is the only one on it.
    expect(html.match(/<script>/g)).toHaveLength(1);
    expect(html).not.toContain('<script>alert');
  });

  it('gives every row a Remove control outside its link, named for its project', () => {
    const html = renderListPage([row('shop')], null);
    const link = '<a href="/b/shop/">';
    expect(html.indexOf('data-id="shop"')).toBeGreaterThan(html.indexOf(link));
    expect(html.indexOf('data-id="shop"')).toBeGreaterThan(html.indexOf('</a>'));
    expect(html).toContain('aria-label="Remove shop"');
  });

  it('offers Add project as a button, with the form in a dialog behind it', () => {
    const html = renderListPage([], null);
    expect(html).toContain('id="add-open"');
    expect(html).toContain('Add project</button>');
    const dialog = '<dialog id="add-dialog"';
    expect(html).toContain(dialog);
    expect(html.indexOf('<label for="add-path">Path</label>')).toBeGreaterThan(
      html.indexOf(dialog),
    );
    expect(html).toContain('<label for="add-id">ID</label>');
    // A message slot for each field and one for a refusal that belongs to
    // neither — a registry that cannot be read, a write that failed.
    expect(html).toContain('id="error-path"');
    expect(html).toContain('id="error-id"');
    expect(html).toContain('id="error-form"');
  });

  it('asks for a removal in a dialog of its own rather than the browser’s', () => {
    const html = renderListPage([row('shop')], null);
    expect(html).toContain('<dialog id="remove-dialog"');
    expect(html).toContain('id="remove-question"');
    expect(html).toContain('id="remove-confirm"');
    expect(html).not.toContain('window.confirm');
  });

  it('renders the fragment the write endpoints answer with inside the page', () => {
    const rows = [row('shop')];
    expect(renderListPage(rows, null)).toContain(
      `<div id="projects">${renderProjects(rows, null)}</div>`,
    );
  });
});

describe('renderProjects', () => {
  it('escapes a project name, which comes from a board config', () => {
    const html = renderProjects([{ ...row('shop'), name: '<b>Shop</b>' }], null);
    expect(html).not.toContain('<b>');
    expect(html).toContain('&lt;b&gt;');
    expect(html).toContain('aria-label="Remove &lt;b&gt;Shop&lt;/b&gt;"');
  });
});
