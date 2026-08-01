/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState, useEffect } from 'react';

export default function AuthImage({ itemId, className }: { itemId: string; className?: string }) {
  const [src, setSrc] = useState<string>('');
  useEffect(() => {
    let objectUrl = '';
    const token = localStorage.getItem('nova_token');
    fetch(`/api/catalog/items/${itemId}/picture`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => { if (res.ok) return res.blob(); throw new Error(); })
      .then((blob) => { objectUrl = URL.createObjectURL(blob); setSrc(objectUrl); })
      .catch(() => {});
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [itemId]);

  if (!src) return null;
  return <img src={src} className={className} alt="" />;
}
