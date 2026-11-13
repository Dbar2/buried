import { useEffect, useState } from 'react';

/** The image at `url` once it has loaded, or null. */
export function useImage(url: string | null): HTMLImageElement | null {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (url === null) {
      setImage(null);
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (!cancelled) setImage(img);
    };
    img.src = url;
    return () => {
      cancelled = true;
    };
  }, [url]);
  return image;
}
