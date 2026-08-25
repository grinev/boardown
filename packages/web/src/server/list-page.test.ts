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

  it('offers the Add form, with a message slot for each field and one for neither', () => {
    const html = renderListPage([], null);
    expect(html).toContain('Add a project');
    expect(html).toContain('<label for="add-path">Path</label>');
    expect(html).toContain('<label for="add-id">ID</label>');
    expect(html).toContain('id="error-path"');
    expect(html).toContain('id="error-id"');
    expect(html).toContain('id="error-form"');
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
