/* SPDX-License-Identifier: AGPL-3.0-only */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, type NavigateOptions, type To } from 'react-router';

type PendingNavigation =
  | { kind: 'to'; to: To; options?: NavigateOptions }
  | { kind: 'delta'; delta: number };

type UseUnsavedChangesGuardOptions = {
  isDirty: boolean;
  enabled?: boolean;
  onSave?: () => Promise<boolean>;
};

function resolveInternalHref(href: string): string | null {
  if (
    !href ||
    href.startsWith('#') ||
    href.startsWith('mailto:') ||
    href.startsWith('tel:') ||
    href.startsWith('javascript:')
  ) {
    return null;
  }

  try {
    const url = new URL(href, window.location.href);
    if (url.origin !== window.location.origin) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

/**
 * Guards programmatic navigation (guardNavigate), in-app Link/NavLink clicks,
 * and browser refresh/close.
 */
export function useUnsavedChangesGuard({
  isDirty,
  enabled = true,
  onSave,
}: UseUnsavedChangesGuardOptions) {
  const navigate = useNavigate();
  const location = useLocation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const pendingNavigation = useRef<PendingNavigation | null>(null);
  const skipGuardRef = useRef(false);
  const shouldGuardRef = useRef(false);

  const shouldGuard = enabled && isDirty;
  shouldGuardRef.current = shouldGuard;

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

  // Intercept in-app <a>/NavLink clicks (capture) so sidebar/menu navigation
  // hits the same dialog as guardNavigate. With BrowserRouter, useBlocker is
  // unavailable; capture + preventDefault keeps history in sync.
  useEffect(() => {
    const onDocumentClick = (event: MouseEvent) => {
      if (!shouldGuardRef.current || skipGuardRef.current) return;
      if (event.defaultPrevented) return;
      if (event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const target = event.target;
      if (!(target instanceof Element)) return;

      const anchor = target.closest('a[href]');
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target === '_blank' || anchor.hasAttribute('download')) return;

      const nextPath = resolveInternalHref(anchor.getAttribute('href') ?? '');
      if (!nextPath) return;

      const currentPath = `${location.pathname}${location.search}${location.hash}`;
      if (nextPath === currentPath) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      queueNavigation({ kind: 'to', to: nextPath });
    };

    document.addEventListener('click', onDocumentClick, true);
    return () => document.removeEventListener('click', onDocumentClick, true);
  }, [location.hash, location.pathname, location.search, queueNavigation]);

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
