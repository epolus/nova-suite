/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { approvals as approvalsApi, type PendingApproval } from '../../api/client';

const TYPE_LABEL: Record<string, string> = {
  change: 'Change',
  knowledge: 'Knowledge Article',
  request: 'Request',
};

const APPROVAL_TYPE_LABEL: Record<string, string> = {
  manager: 'Manager Approval',
  group: 'Group Approval',
  cab: 'CAB Approval',
  technical: 'Technical Approval',
  security: 'Security Approval',
  business: 'Business Approval',
  knowledge_review: 'Knowledge Review',
};

// ─── Confirm modal ────────────────────────────────────────────
function ConfirmModal({
  item,
  action,
  onConfirm,
  onCancel,
}: {
  item: PendingApproval;
  action: 'approved' | 'rejected';
  onConfirm: (notes: string) => void;
  onCancel: () => void;
}) {
  const [notes, setNotes] = useState('');
  const isReject = action === 'rejected';

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <h3 className="text-base font-semibold text-gray-900 mb-1">
          {isReject ? 'Reject' : 'Approve'} {TYPE_LABEL[item.type] ?? item.type}
        </h3>
        <p className="text-sm text-gray-500 mb-4">
          <span className="font-mono text-xs text-gray-400">{item.entity_number}</span>{' '}
          {item.entity_title}
        </p>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Notes {isReject && <span className="text-red-500">*</span>}
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder={isReject ? 'Reason for rejection...' : 'Optional notes...'}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none resize-none"
        />
        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(notes)}
            disabled={isReject && !notes.trim()}
            className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
              isReject
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-emerald-600 hover:bg-emerald-700'
            }`}
          >
            {isReject ? 'Reject' : 'Approve'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────
export default function ESSApprovalsPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<PendingApproval[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ item: PendingApproval; action: 'approved' | 'rejected' } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { approvals } = await approvalsApi.list();
      setItems(approvals);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDecision = async (notes: string) => {
    if (!modal) return;
    setSubmitting(true);
    setError('');
    try {
      const { item, action } = modal;
      const token = localStorage.getItem('nova_token');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      if (item.type === 'change') {
        const response = await fetch(`/api/changes/${item.entity_id}/approvals/${item.approval_id}/decision`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ decision: action === 'approved' ? 'approved' : 'rejected', notes }),
        });
        if (!response.ok) {
          throw new Error('Failed to save change approval decision');
        }
      } else if (item.type === 'knowledge') {
        const response = await fetch(`/api/knowledge/articles/${item.entity_id}/approvals/${item.approval_id}/decision`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ decision: action, notes }),
        });
        if (!response.ok) {
          throw new Error('Failed to save knowledge approval decision');
        }
      } else if (item.type === 'request') {
        const response = await fetch(`/api/requests/${item.entity_id}/tasks/${item.approval_id}/complete`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ outcome: action, notes }),
        });
        if (!response.ok) {
          throw new Error('Failed to save request approval decision');
        }
      }

      setModal(null);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save approval decision');
    } finally {
      setSubmitting(false);
    }
  };

  const typeIcon = (type: string) => {
    if (type === 'change') return (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
      </svg>
    );
    if (type === 'request') return (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6M7 4h10a2 2 0 012 2v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6a2 2 0 012-2z" />
      </svg>
    );
    return (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
      </svg>
    );
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Pending Approvals</h1>
        <p className="text-sm text-gray-500 mt-1">Items waiting for your review and decision.</p>
        {error && (
          <p className="text-sm text-red-600 mt-2">{error}</p>
        )}
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse">
              <div className="h-4 bg-gray-100 rounded w-1/4 mb-2" />
              <div className="h-5 bg-gray-100 rounded w-3/4" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 px-6 py-16 text-center">
          <svg className="w-10 h-10 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-base font-medium text-gray-900">All caught up</p>
          <p className="text-sm text-gray-400 mt-1">No pending approvals at this time.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div
              key={item.approval_id}
              className="bg-white rounded-xl border border-gray-200 p-5 flex items-start gap-4"
            >
              {/* Icon */}
              <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center text-gray-500 flex-shrink-0 mt-0.5">
                {typeIcon(item.type)}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                    {TYPE_LABEL[item.type] ?? item.type}
                  </span>
                  <span className="text-[10px] font-mono text-gray-400">{item.entity_number}</span>
                  <span className="text-[10px] text-gray-300">·</span>
                  <span className="text-[10px] text-gray-400">
                    {APPROVAL_TYPE_LABEL[item.approval_type] ?? item.approval_type}
                  </span>
                </div>
                <p className="text-sm font-semibold text-gray-900 truncate">{item.entity_title}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Requested {new Date(item.created_at).toLocaleDateString()}
                </p>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => {
                    const path = item.type === 'change'
                      ? `/changes/${item.entity_id}`
                      : item.type === 'request'
                        ? `/requests/${item.entity_id}`
                        : '/knowledge';
                    navigate(path);
                  }}
                  className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg border border-gray-200 transition-colors"
                >
                  View
                </button>
                <button
                  onClick={() => setModal({ item, action: 'rejected' })}
                  className="px-3 py-1.5 text-xs font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg border border-red-200 transition-colors"
                >
                  Reject
                </button>
                <button
                  onClick={() => setModal({ item, action: 'approved' })}
                  className="px-3 py-1.5 text-xs font-medium text-white rounded-lg transition-colors"
                  style={{ backgroundColor: 'var(--color-primary)' }}
                >
                  Approve
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {modal && !submitting && (
        <ConfirmModal
          item={modal.item}
          action={modal.action}
          onConfirm={handleDecision}
          onCancel={() => setModal(null)}
        />
      )}
      {submitting && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl px-8 py-6 shadow-xl text-sm text-gray-600">Saving...</div>
        </div>
      )}
    </div>
  );
}
