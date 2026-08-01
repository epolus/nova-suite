/* SPDX-License-Identifier: AGPL-3.0-only */
import { useCallback, useEffect, useRef, useState } from 'react';
import { auth } from '../api/client';

interface WrappedPreference<T> {
  value: T;
}

function readLegacyValue<T>(legacyStorageKey: string | undefined, fallback: T): T {
  if (!legacyStorageKey) return fallback;
  try {
    const raw = localStorage.getItem(legacyStorageKey);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeLegacyValue<T>(legacyStorageKey: string | undefined, value: T) {
  if (!legacyStorageKey) return;
  try {
    localStorage.setItem(legacyStorageKey, JSON.stringify(value));
  } catch {
    // Ignore quota/storage errors; server preference remains source of truth.
  }
}

export function useUserPreferenceState<T>(
  scope: string,
  fallback: T,
  legacyStorageKey?: string,
): [T, (next: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => readLegacyValue(legacyStorageKey, fallback));
  const fallbackRef = useRef(fallback);
  fallbackRef.current = fallback;

  useEffect(() => {
    let alive = true;
    auth.getPreference(scope)
      .then((res) => {
        if (!alive) return;
        if (!res.preference) {
          const local = readLegacyValue(legacyStorageKey, fallbackRef.current);
          const payload: Record<string, unknown> = { value: local as unknown };
          void auth.setPreference(scope, payload).catch(() => {
            // Keep local fallback if backend is unavailable.
          });
          return;
        }
        const wrapped = res.preference as unknown as WrappedPreference<T>;
        if (wrapped && typeof wrapped === 'object' && Object.prototype.hasOwnProperty.call(wrapped, 'value')) {
          setValue(wrapped.value);
          writeLegacyValue(legacyStorageKey, wrapped.value);
        }
      })
      .catch(() => {
        // Keep local fallback on network/auth errors.
      });
    return () => {
      alive = false;
    };
  }, [scope, legacyStorageKey]);

  const setAndPersist = useCallback((next: T | ((prev: T) => T)) => {
    setValue((prev) => {
      const resolved = typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
      writeLegacyValue(legacyStorageKey, resolved);
      const payload: Record<string, unknown> = { value: resolved as unknown };
      void auth.setPreference(scope, payload)
        .catch(() => {
          // Keep local fallback if backend is unavailable.
        });
      return resolved;
    });
  }, [scope, legacyStorageKey]);

  return [value, setAndPersist];
}

