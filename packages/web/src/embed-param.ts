// `?embed` asks for a page rendered inside another app's window. Only an explicit
// yes turns it on: a typo must never strip a page somebody opened directly.
const ON_VALUES = new Set(['', '1', 'true']);

export const isEmbedRequested = (search: string): boolean => {
  const value = new URLSearchParams(search).get('embed');
  return value !== null && ON_VALUES.has(value.toLowerCase());
};
