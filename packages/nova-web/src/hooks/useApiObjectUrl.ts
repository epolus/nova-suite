/* SPDX-License-Identifier: AGPL-3.0-only */
import { useEffect, useState } from 'react';
import { requestBlob } from '../api/http';

/** Object URL for an authenticated binary API resource (images); null while loading, on error or when `path` is null. */
export function useApiObjectUrl(path: string | null): string | null {
  const [loaded, setLoaded] = useState<{ path: string; url: string } | null>(null);

  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    requestBlob(path)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setLoaded({ path, url: objectUrl });
      })
      .catch(() => {
        if (!cancelled) setLoaded(null);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);

  return loaded && loaded.path === path ? loaded.url : null;
}
