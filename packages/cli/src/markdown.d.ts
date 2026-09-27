// A `.md` import is its text: esbuild's text loader in the bundle, the matching
// plugin in vitest.config.ts under test.
declare module '*.md' {
  const text: string;
  export default text;
}
