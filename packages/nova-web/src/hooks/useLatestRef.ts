/* SPDX-License-Identifier: AGPL-3.0-only */
import { useEffect, useRef, type MutableRefObject } from 'react';

/**
 * Ref that always holds the latest `value`. Updated in an effect so reading or
 * writing `ref.current` is not done during render (react-hooks/refs).
 */
export function useLatestRef<T>(value: T): MutableRefObject<T> {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  });
  return ref;
}
