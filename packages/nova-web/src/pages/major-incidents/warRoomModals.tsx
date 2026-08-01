/* SPDX-License-Identifier: AGPL-3.0-only */
import { useTranslations } from 'use-intl';
import { Button } from '../../components/ui/button';

export function StakeholderUpdateModal({
  body,
  onChange,
  onClose,
  onSend,
  saving,
}: {
  body: string;
  onChange: (value: string) => void;
  onClose: () => void;
  onSend: () => void;
  saving: boolean;
}) {
  const t = useTranslations('pages.majorIncidents.warRoom');
  const tActions = useTranslations('common.actions');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6">
        <h4 className="font-semibold text-lg mb-2">{t('stakeholderUpdateTitle')}</h4>
        <textarea
          className="w-full border rounded-md p-2 text-sm min-h-[140px]"
          value={body}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t('stakeholderUpdatePlaceholder')}
        />
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" type="button" onClick={onClose}>{tActions('cancel')}</Button>
          <Button type="button" onClick={onSend} disabled={saving || !body.trim()}>
            {saving ? t('sending') : t('send')}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function RejectPromotionModal({
  reason,
  onChange,
  onClose,
  onConfirm,
  rejecting,
}: {
  reason: string;
  onChange: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
  rejecting: boolean;
}) {
  const t = useTranslations('pages.majorIncidents.warRoom');
  const tActions = useTranslations('common.actions');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6">
        <h4 className="font-semibold text-lg mb-2">{t('rejectPromotionTitle')}</h4>
        <p className="text-sm text-gray-600 mb-3">
          {t('rejectPromotionDescription')}
        </p>
        <label className="block text-xs font-medium text-gray-600 mb-1">{t('rejectReasonLabel')}</label>
        <textarea
          className="w-full border rounded-md p-2 text-sm min-h-[100px]"
          value={reason}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t('rejectReasonPlaceholder')}
          maxLength={2000}
        />
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" type="button" onClick={onClose} disabled={rejecting}>
            {tActions('cancel')}
          </Button>
          <Button
            type="button"
            className="bg-rose-600 hover:bg-rose-500 text-white border-0"
            onClick={onConfirm}
            disabled={rejecting}
          >
            {rejecting ? t('rejecting') : t('rejectPromotion')}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function ResolveModal({
  solution,
  onChange,
  onClose,
  onConfirm,
  saving,
}: {
  solution: string;
  onChange: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
  saving: boolean;
}) {
  const t = useTranslations('pages.majorIncidents.warRoom');
  const tActions = useTranslations('common.actions');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6">
        <h4 className="font-semibold text-lg mb-2">{t('declareResolvedTitle')}</h4>
        <p className="text-sm text-gray-600 mb-3">
          {t('declareResolvedDescription')}
        </p>
        <label className="block text-xs font-medium text-gray-600 mb-1">{t('resolutionSummaryLabel')}</label>
        <textarea
          className="w-full border rounded-md p-2 text-sm min-h-[120px]"
          value={solution}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t('resolutionSummaryPlaceholder')}
        />
        <div className="flex justify-end gap-2 mt-4">
          <Button
            variant="outline"
            type="button"
            onClick={onClose}
            disabled={saving}
          >
            {tActions('cancel')}
          </Button>
          <Button
            type="button"
            className="bg-red-600 hover:bg-red-500 text-white border-0"
            onClick={onConfirm}
            disabled={saving || !solution.trim()}
          >
            {saving ? t('submitting') : t('declareResolved')}
          </Button>
        </div>
      </div>
    </div>
  );
}
