/* SPDX-License-Identifier: AGPL-3.0-only */
import { useTranslations } from 'use-intl';
import { Button } from '@/components/ui/button';

interface UnsavedChangesDialogProps {
  open: boolean;
  saving?: boolean;
  onStay: () => void;
  onLeave: () => void;
  onSaveAndLeave?: () => void;
}

export default function UnsavedChangesDialog({
  open,
  saving = false,
  onStay,
  onLeave,
  onSaveAndLeave,
}: UnsavedChangesDialogProps) {
  const tActions = useTranslations('common.actions');
  const tMessages = useTranslations('common.messages');
  const tDialog = useTranslations('components.unsavedChangesDialog');

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="unsaved-changes-dialog-title"
        className="w-full max-w-md rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-xl p-6"
      >
        <h2 id="unsaved-changes-dialog-title" className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          {tDialog('title')}
        </h2>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          {tMessages('unsavedChanges')}
        </p>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={onStay} disabled={saving}>
            {tActions('cancel')}
          </Button>
          <Button type="button" variant="outline" onClick={onLeave} disabled={saving}>
            {tDialog('leaveWithoutSaving')}
          </Button>
          {onSaveAndLeave && (
            <Button type="button" onClick={onSaveAndLeave} disabled={saving}>
              {saving ? tActions('saving') : tDialog('saveAndLeave')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
