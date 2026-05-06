export const formatStatusLabel = (slug: string): string => {
  const normalized = slug.replace(/[-_]+/g, ' ').trim();
  if (normalized.length === 0) return slug;
  return normalized.charAt(0).toUpperCase() + normalized.slice(1).toLowerCase();
};
