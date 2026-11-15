/* SPDX-License-Identifier: AGPL-3.0-only */
import { useApiObjectUrl } from '../../hooks/useApiObjectUrl';

export default function AuthImage({ itemId, className }: { itemId: string; className?: string }) {
  const src = useApiObjectUrl(`/catalog/items/${itemId}/picture`);
  if (!src) return null;
  return <img src={src} className={className} alt="" />;
}
