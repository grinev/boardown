const KB = 1024;
const MB = KB * 1024;
const GB = MB * 1024;

// 1024-based; whole numbers below a megabyte, one decimal from there up. The
// unit is picked after rounding, so nothing just under a unit reads as `1024 KB`.
export const formatFileSize = (bytes: number): string => {
  if (bytes < KB) return `${bytes} B`;
  if (Math.round(bytes / KB) < 1024) return `${Math.round(bytes / KB)} KB`;
  if (Number((bytes / MB).toFixed(1)) < 1024) return `${(bytes / MB).toFixed(1)} MB`;
  return `${(bytes / GB).toFixed(1)} GB`;
};
