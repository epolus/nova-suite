/* SPDX-License-Identifier: AGPL-3.0-only */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, type NavigateOptions, type To } from 'react-router-dom';

type PendingNavigation =
  | { kind: 'to'; to: To; options?: NavigateOptions }
  | { kind: 'delta'; delta: number };

type UseUnsavedChangesGuardOptions = {
  isDirty: boolean;
  enabled?: boolean;
  onSave?: () => Promise<boolean>;
};

/**
 * Guards programmatic navigation (guardNavigate) and browser refresh/close.
 * Does not intercept Link/NavLink clicks — that caused URL/router desync.
 */
export function useUnsavedChangesGuard({
  isDirty,
  enabled = true,
  onSave,
}: UseUnsavedChangesGuardOptions) {
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const pendingNavigation = useRef<PendingNavigation | null>(null);
  const skipGuardRef = useRef(false);

  const shouldGuard = enabled && isDirty;

  const completeNavigation = useCallback(() => {
    const pending = pendingNavigation.current;
    pendingNavigation.current = null;
    setDialogOpen(false);
    if (!pending) return;

    skipGuardRef.current = true;
    if (pending.kind === 'delta') {
      navigate(pending.delta);
    } else {
      navigate(pending.to, pending.options);
    }
  }, [navigate]);

  const queueNavigation = useCallback((pending: PendingNavigation) => {
    pendingNavigation.current = pending;
    setDialogOpen(true);
  }, []);

  const guardNavigate = useCallback(
    (to: To | number, options?: NavigateOptions) => {
      if (skipGuardRef.current) {
        skipGuardRef.current = false;
        if (typeof to === 'number') navigate(to);
        else navigate(to, options);
        return;
      }
      if (!shouldGuard) {
        if (typeof to === 'number') navigate(to);
        else navigate(to, options);
        return;
      }
      if (typeof to === 'number') {
        queueNavigation({ kind: 'delta', delta: to });
        return;
      }
      queueNavigation({ kind: 'to', to, options });
    },
    [navigate, queueNavigation, shouldGuard],
  );

  const stayOnPage = useCallback(() => {
    pendingNavigation.current = null;
    setDialogOpen(false);
  }, []);

  const leaveWithoutSaving = useCallback(() => {
    completeNavigation();
  }, [completeNavigation]);

  const saveAndLeave = useCallback(async () => {
    if (!onSave) return;
    setSaving(true);
    try {
      const saved = await onSave();
      if (saved) completeNavigation();
    } finally {
      setSaving(false);
    }
  }, [completeNavigation, onSave]);

  useEffect(() => {
    if (!shouldGuard) return undefined;

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [shouldGuard]);

  const allowNextNavigation = useCallback(() => {
    skipGuardRef.current = true;
  }, []);

  return {
    dialogOpen,
    saving,
    guardNavigate,
    allowNextNavigation,
    stayOnPage,
    leaveWithoutSaving,
    saveAndLeave: onSave ? saveAndLeave : undefined,
  };
}
