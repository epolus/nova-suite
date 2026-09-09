/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState, type Dispatch, type SetStateAction } from 'react';

/**
 * Local state that tracks an external value. When `value` changes, state is
 * updated during render (React's recommended alternative to syncing in an effect).
 */
export function useSyncedState<T>(value: T): [T, Dispatch<SetStateAction<T>>] {
  const [state, setState] = useState(value);
  const [prev, setPrev] = useState(value);
  if (!Object.is(prev, value)) {
    setPrev(value);
    setState(value);
  }
  return [state, setState];
}

/**
 * State that resets to `initial` whenever `resetKey` changes (during render).
 */
export function useResettingState<T>(
  initial: T,
  resetKey: unknown,
): [T, Dispatch<SetStateAction<T>>] {
  const [state, setState] = useState(initial);
  const [prevKey, setPrevKey] = useState(resetKey);
  if (!Object.is(prevKey, resetKey)) {
    setPrevKey(resetKey);
    setState(initial);
  }
  return [state, setState];
}
