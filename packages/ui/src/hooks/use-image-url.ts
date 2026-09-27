import { useEffect, useState } from 'react';
import { imageSource } from '../utils/image-source';

// The address an `<img>` shows `bytes` from, and null until there is one. An
// object URL is revoked when the bytes change or the component goes away.
export const useImageUrl = (bytes: Uint8Array | null, path: string): string | null => {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (bytes === null) {
      setUrl(null);
      return;
    }
    const source = imageSource(bytes, path);
    if (source.kind === 'url') {
      setUrl(source.url);
      return;
    }
    const objectUrl = URL.createObjectURL(source.blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [bytes, path]);

  return url;
};
