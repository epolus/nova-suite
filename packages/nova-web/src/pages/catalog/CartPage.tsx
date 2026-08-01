/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslations } from 'use-intl';
import { useCart } from '../../context/CartContext';
import { auth, requests as requestsApi } from '../../api/client';
import type { ServiceRequest } from '../../api/client';
import PageHeader from '../../components/PageHeader';
import { useTheme } from '../../context/ThemeContext';
import { ConfirmStep, DeliveryStep, ReviewStep, StepIndicator, SuccessView } from './cartSteps';

export default function CartPage() {
  const t = useTranslations('pages.catalog');
  const tActions = useTranslations('common.actions');
  const tValidation = useTranslations('common.validation');
  const { items, cartCount, cartTotal, removeItem, updateItem, clearCart } = useCart();
  const { theme } = useTheme();
  const [step, setStep] = useState(0);
  const [delivery, setDelivery] = useState({ location: '', date_needed: '', instructions: '' });
  const [orderForSelf, setOrderForSelf] = useState(true);
  const [selectedUser, setSelectedUser] = useState('');
  const [selectedUserName, setSelectedUserName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<{ batchId: string; requests: ServiceRequest[] } | null>(null);

  useEffect(() => {
    if (selectedUser) {
      auth.users().then((res) => {
        const user = res.users.find((u) => u.id === selectedUser);
        if (user) setSelectedUserName(user.display_name);
      });
    }
  }, [selectedUser]);

  if (success) {
    return (
      <>
        <PageHeader title={t('orderConfirmation')} />
        <SuccessView batchId={success.batchId} createdRequests={success.requests} />
      </>
    );
  }

  if (cartCount === 0) {
    return (
      <>
        <PageHeader title={t('cartTitle')} description={t('cartEmptyDescription')} />
        <div className="text-center py-16">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl text-gray-400">
            &#128722;
          </div>
          <p className="text-gray-500 mb-4">{t('cartEmptyMessage')}</p>
          <Link
            to="/catalog"
            className="inline-flex px-6 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            {t('browseCatalog')}
          </Link>
        </div>
      </>
    );
  }

  const handleSubmit = async () => {
    if (delivery.date_needed) {
      const now = new Date();
      const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      if (delivery.date_needed < todayIso) {
        setError(tValidation('dateNeededNotPast'));
        return;
      }
    }
    setSubmitting(true);
    setError('');
    try {
      const deliveryInfo = (delivery.location || delivery.date_needed || delivery.instructions)
        ? delivery
        : {};

      const result = await requestsApi.batch({
        items: items.map((i) => ({
          service_item_id: i.serviceItem.id,
          form_data: i.formData,
          priority: i.priority,
          notes: i.notes || undefined,
        })),
        requested_for: !orderForSelf && selectedUser ? selectedUser : undefined,
        delivery_info: deliveryInfo,
      });

      clearCart();
      setSuccess({ batchId: result.batch_id, requests: result.requests });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('submitOrderFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <PageHeader
        title={t('cartTitle')}
        description={t('cartItemCount', { count: cartCount })}
        action={
          <Link
            to="/catalog"
            className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
          >
            {t('continueShoppingLink')}
          </Link>
        }
      />

      <StepIndicator current={step} />

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}

      {step === 0 && (
        <ReviewStep items={items} onRemove={removeItem} onUpdate={updateItem} currencyCode={theme.catalog_currency} />
      )}

      {step === 1 && (
        <DeliveryStep
          delivery={delivery}
          setDelivery={setDelivery}
          orderForSelf={orderForSelf}
          setOrderForSelf={setOrderForSelf}
          selectedUser={selectedUser}
          setSelectedUser={setSelectedUser}
        />
      )}

      {step === 2 && (
        <ConfirmStep
          items={items}
          delivery={delivery}
          orderForSelf={orderForSelf}
          selectedUserName={selectedUserName}
          total={cartTotal}
          currencyCode={theme.catalog_currency}
        />
      )}

      <div className="flex justify-between items-center mt-8 pt-6 border-t border-gray-100">
        {step > 0 ? (
          <button
            onClick={() => setStep(step - 1)}
            className="px-6 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            {tActions('back')}
          </button>
        ) : (
          <div />
        )}

        {step < 2 ? (
          <button
            onClick={() => setStep(step + 1)}
            className="px-6 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            {tActions('next')}
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="px-8 py-2.5 bg-green-600 text-white rounded-lg text-sm font-bold hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            {submitting ? t('submitting') : t('submitOrder')}
          </button>
        )}
      </div>
    </>
  );
}
