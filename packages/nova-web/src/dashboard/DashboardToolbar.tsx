/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { Button } from '@/components/ui/button';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { DashboardIcons } from './icons';

interface Props {
  editMode: boolean;
  onOpenSettings: () => void;
  onEditModeChange: (editMode: boolean) => void;
  onAddWidget: () => void;
  onResetLayout: () => void;
}

export default function DashboardToolbar({
  editMode,
  onOpenSettings,
  onEditModeChange,
  onAddWidget,
  onResetLayout,
}: Props) {
  const t = useTranslations('pages.dashboard.customize');
  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <>
      <div className="flex items-center gap-2">
        {editMode ? (
          <>
            <Button type="button" variant="outline" size="sm" onClick={onAddWidget}>
              {t('addWidget')}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setConfirmReset(true)}>
              {t('resetLayout')}
            </Button>
            <Button type="button" size="sm" onClick={() => onEditModeChange(false)}>
              {t('doneEditing')}
            </Button>
          </>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={onOpenSettings}
            title={t('settingsTitle')}
            aria-label={t('settingsTitle')}
          >
            {DashboardIcons.settings()}
          </Button>
        )}
      </div>

      <ConfirmDialog
        open={confirmReset}
        title={t('resetLayout')}
        message={t('resetLayoutConfirm')}
        confirmLabel={t('resetLayout')}
        variant="danger"
        onConfirm={() => {
          onResetLayout();
          setConfirmReset(false);
        }}
        onCancel={() => setConfirmReset(false)}
      />
    </>
  );
}
