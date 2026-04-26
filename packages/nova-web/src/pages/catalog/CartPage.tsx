/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCart, type CartItem } from '../../context/CartContext';
import { auth, requests as requestsApi, catalog } from '../../api/client';
import type { UserListItem, ServiceRequest } from '../../api/client';
import PageHeader from '../../components/PageHeader';
import Card from '../../components/Card';
import UserDateInput from '../../components/UserDateInput';
import { catalogPictureFrameBaseClass } from './catalogPictureFrame';
import { useTheme } from '../../context/ThemeContext';
import { formatCurrency } from '../../utils/currency';

const STEPS = ['Review Cart', 'Delivery & Recipient', 'Confirm Order'] as const;

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-2 mb-8">
      {STEPS.map((label, i) => (
        <div key={label} className="flex items-center gap-2">
          <div
            className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-semibold transition-colors ${
              i < current
                ? 'bg-green-500 text-white'
                : i === current
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-200 text-gray-500'
            }`}
          >
            {i < current ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              i + 1
            )}
          </div>
          <span className={`text-sm font-medium ${i === current ? 'text-indigo-600' : 'text-gray-500'}`}>
            {label}
          </span>
          {i < STEPS.length - 1 && <div className="w-8 h-px bg-gray-300" />}
        </div>
      ))}
    </div>
  );
}

function CartItemImage({ itemId, hasPicture }: { itemId: string; hasPicture: boolean }) {
  const [src, setSrc] = useState<string>('');
  useEffect(() => {
    if (!hasPicture) return;
    const token = localStorage.getItem('nova_token');
    fetch(`/api/catalog/items/${itemId}/picture`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => { if (res.ok) return res.blob(); throw new Error(); })
      .then((blob) => setSrc(URL.createObjectURL(blob)))
      .catch(() => {});
    return () => { if (src) URL.revokeObjectURL(src); };
  }, [itemId, hasPicture]);
  if (!src) return <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center text-gray-400 text-xl flex-shrink-0">&#128722;</div>;
  return (
    <div className={`w-16 h-16 rounded-lg flex-shrink-0 ${catalogPictureFrameBaseClass}`}>
      <img src={src} className="max-w-full max-h-full object-contain" alt="" />
    </div>
  );
}

const PRIORITY_COLORS: Record<string, string> = {
  low: 'bg-gray-100 text-gray-700',
  medium: 'bg-blue-100 text-blue-700',
  high: 'bg-orange-100 text-orange-700',
  critical: 'bg-red-100 text-red-700',
};

function ReviewStep({ items, onRemove, onUpdate, currencyCode }: {
  items: CartItem[];
  onRemove: (id: string) => void;
  onUpdate: (id: string, updates: Partial<Pick<CartItem, 'priority' | 'notes'>>) => void;
  currencyCode: string;
}) {
  const total = items.reduce((sum, i) => sum + (Number(i.serviceItem.price) || 0), 0);

  return (
    <div className="space-y-4">
      {items.map((item) => (
        <Card key={item.id} className="flex gap-4 items-start">
          <CartItemImage itemId={item.serviceItem.id} hasPicture={!!item.serviceItem.picture_storage_key} />
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold text-gray-900">{item.serviceItem.name}</h3>
                <p className="text-xs text-gray-500 mt-0.5">{item.serviceItem.category_name}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {item.serviceItem.price != null && (
                  <span className="text-sm font-semibold text-green-700">
                    {formatCurrency(Number(item.serviceItem.price), currencyCode)}
                  </span>
                )}
                <button
                  onClick={() => onRemove(item.id)}
                  className="text-gray-400 hover:text-red-500 transition-colors p-1"
                  title="Remove"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {Object.keys(item.formData).length > 0 && (
              <div className="mt-2 text-xs text-gray-500">
                {Object.entries(item.formData).map(([k, v]) => (
                  <span key={k} className="inline-block mr-3">
                    <span className="font-medium">{k}:</span> {String(v)}
                  </span>
                ))}
              </div>
            )}

            <div className="mt-2 flex items-center gap-3">
              <select
                value={item.priority}
                onChange={(e) => onUpdate(item.id, { priority: e.target.value as CartItem['priority'] })}
                className="text-xs border border-gray-200 rounded-md px-2 py-1 focus:ring-1 focus:ring-indigo-500 outline-none"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
              <span className={`text-xs px-2 py-0.5 rounded-full ${PRIORITY_COLORS[item.priority]}`}>
                {item.priority}
              </span>
            </div>

            {item.notes && (
              <p className="mt-1 text-xs text-gray-400 italic">{item.notes}</p>
            )}
          </div>
        </Card>
      ))}

      {total > 0 && (
        <div className="flex justify-end items-center gap-2 pt-4 border-t border-gray-100">
          <span className="text-sm text-gray-500">Estimated total:</span>
          <span className="text-lg font-bold text-green-700">{formatCurrency(total, currencyCode)}</span>
        </div>
      )}
    </div>
  );
}

function DeliveryStep({ delivery, setDelivery, orderForSelf, setOrderForSelf, selectedUser, setSelectedUser }: {
  delivery: { location: string; date_needed: string; instructions: string };
  setDelivery: (d: { location: string; date_needed: string; instructions: string }) => void;
  orderForSelf: boolean;
  setOrderForSelf: (v: boolean) => void;
  selectedUser: string;
  setSelectedUser: (v: string) => void;
}) {
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [userSearch, setUserSearch] = useState('');

  useEffect(() => {
    auth.users().then((res) => setUsers(res.users));
  }, []);

  const filteredUsers = userSearch
    ? users.filter(
        (u) =>
          u.display_name.toLowerCase().includes(userSearch.toLowerCase()) ||
          u.email.toLowerCase().includes(userSearch.toLowerCase()),
      )
    : users;

  return (
    <div className="space-y-6">
      <Card>
        <h3 className="font-semibold text-gray-900 mb-4">Recipient</h3>
        <div className="flex items-center gap-4 mb-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              checked={orderForSelf}
              onChange={() => { setOrderForSelf(true); setSelectedUser(''); }}
              className="text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-sm text-gray-700">Order for myself</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              checked={!orderForSelf}
              onChange={() => setOrderForSelf(false)}
              className="text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-sm text-gray-700">Order for someone else</span>
          </label>
        </div>

        {!orderForSelf && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Select recipient</label>
            <input
              type="text"
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              placeholder="Search users..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none mb-2"
            />
            <div className="max-h-48 overflow-auto border border-gray-200 rounded-lg">
              {filteredUsers.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => { setSelectedUser(u.id); setUserSearch(u.display_name); }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 transition-colors ${
                    selectedUser === u.id ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-700'
                  }`}
                >
                  {u.display_name} <span className="text-gray-400">({u.email})</span>
                </button>
              ))}
              {filteredUsers.length === 0 && (
                <div className="px-3 py-2 text-sm text-gray-400">No users found</div>
              )}
            </div>
          </div>
        )}
      </Card>

      <Card>
        <h3 className="font-semibold text-gray-900 mb-4">Delivery Information</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Delivery Location</label>
            <input
              type="text"
              value={delivery.location}
              onChange={(e) => setDelivery({ ...delivery, location: e.target.value })}
              placeholder="Building, floor, room, desk..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date Needed</label>
            <UserDateInput
              value={delivery.date_needed}
              onChange={(next) => setDelivery({ ...delivery, date_needed: next })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              disallowPast
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Special Instructions</label>
            <textarea
              value={delivery.instructions}
              onChange={(e) => setDelivery({ ...delivery, instructions: e.target.value })}
              rows={3}
              placeholder="Any special delivery or setup instructions..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none"
            />
          </div>
        </div>
      </Card>
    </div>
  );
}

function ConfirmStep({ items, delivery, orderForSelf, selectedUserName, total, currencyCode }: {
  items: CartItem[];
  delivery: { location: string; date_needed: string; instructions: string };
  orderForSelf: boolean;
  selectedUserName: string;
  total: number;
  currencyCode: string;
}) {
  return (
    <div className="space-y-6">
      <Card>
        <h3 className="font-semibold text-gray-900 mb-3">Order Summary</h3>
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
              <div>
                <p className="text-sm font-medium text-gray-900">{item.serviceItem.name}</p>
                <p className="text-xs text-gray-500">Priority: {item.priority}</p>
              </div>
              {item.serviceItem.price != null && (
                <span className="text-sm font-semibold text-green-700">
                  {formatCurrency(Number(item.serviceItem.price), currencyCode)}
                </span>
              )}
            </div>
          ))}
          {total > 0 && (
            <div className="flex items-center justify-between pt-3 border-t border-gray-200">
              <span className="font-semibold text-gray-900">Total</span>
              <span className="text-lg font-bold text-green-700">{formatCurrency(total, currencyCode)}</span>
            </div>
          )}
        </div>
      </Card>

      <Card>
        <h3 className="font-semibold text-gray-900 mb-3">Recipient</h3>
        <p className="text-sm text-gray-700">
          {orderForSelf ? 'Ordering for myself' : `Ordering for: ${selectedUserName}`}
        </p>
      </Card>

      {(delivery.location || delivery.date_needed || delivery.instructions) && (
        <Card>
          <h3 className="font-semibold text-gray-900 mb-3">Delivery Details</h3>
          <div className="space-y-1 text-sm text-gray-700">
            {delivery.location && <p><span className="font-medium">Location:</span> {delivery.location}</p>}
            {delivery.date_needed && <p><span className="font-medium">Needed by:</span> {delivery.date_needed}</p>}
            {delivery.instructions && <p><span className="font-medium">Instructions:</span> {delivery.instructions}</p>}
          </div>
        </Card>
      )}
    </div>
  );
}

function SuccessView({ batchId, createdRequests }: { batchId: string; createdRequests: ServiceRequest[] }) {
  return (
    <div className="max-w-2xl mx-auto text-center py-12">
      <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <h2 className="text-2xl font-bold text-gray-900 mb-2">Order Submitted!</h2>
      <p className="text-gray-500 mb-8">
        Your order containing {createdRequests.length} item{createdRequests.length > 1 ? 's' : ''} has been submitted successfully.
      </p>

      <Card className="text-left">
        <h3 className="font-semibold text-gray-900 mb-3">Request Numbers</h3>
        <div className="space-y-2">
          {createdRequests.map((req) => (
            <Link
              key={req.id}
              to={`/requests/${req.id}`}
              className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <span className="text-sm font-medium text-indigo-600">{req.number}</span>
              <span className="text-xs text-gray-500">{req.service_item_name}</span>
            </Link>
          ))}
        </div>
      </Card>

      <div className="mt-8 flex gap-3 justify-center">
        <Link
          to="/catalog"
          className="px-6 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Back to Catalog
        </Link>
        <Link
          to="/requests"
          className="px-6 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
        >
          View My Requests
        </Link>
      </div>
    </div>
  );
}

export default function CartPage() {
  const navigate = useNavigate();
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
        <PageHeader title="Order Confirmation" />
        <SuccessView batchId={success.batchId} createdRequests={success.requests} />
      </>
    );
  }

  if (cartCount === 0) {
    return (
      <>
        <PageHeader title="Your Cart" description="Your cart is empty." />
        <div className="text-center py-16">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl text-gray-400">
            &#128722;
          </div>
          <p className="text-gray-500 mb-4">No items in your cart yet.</p>
          <Link
            to="/catalog"
            className="inline-flex px-6 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            Browse Catalog
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
        setError('Date needed cannot be in the past');
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
    } catch (err: any) {
      setError(err.message || 'Failed to submit order');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Your Cart"
        description={`${cartCount} item${cartCount !== 1 ? 's' : ''} in your cart`}
        action={
          <Link
            to="/catalog"
            className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
          >
            &larr; Continue Shopping
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
            Back
          </button>
        ) : (
          <div />
        )}

        {step < 2 ? (
          <button
            onClick={() => setStep(step + 1)}
            className="px-6 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            Continue
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="px-8 py-2.5 bg-green-600 text-white rounded-lg text-sm font-bold hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            {submitting ? 'Submitting...' : 'Submit Order'}
          </button>
        )}
      </div>
    </>
  );
}
