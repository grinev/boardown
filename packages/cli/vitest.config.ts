import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    {
      // Mirrors esbuild's `.md` text loader, so the embedded agent skill imports
      // the same way under test as in the bundle.
      name: 'markdown-as-text',
      enforce: 'pre',
      transform(code, id) {
        if (!id.endsWith('.md')) return null;
        return { code: `export default ${JSON.stringify(code)};`, map: null };
      },
    },
  ],
  test: {
    environment: 'node',
  },
});
