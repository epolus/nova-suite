/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState } from 'react';
import type { AiPendingAction } from '../../api/client';

interface ActionConfirmCardProps {
  action: AiPendingAction;
  confirming?: boolean;
  onConfirm: (payload: Record<string, unknown>) => void;
  onDismiss: () => void;
  onApplyAutomation?: (automationConfig: Record<string, unknown>) => void;
}

export default function ActionConfirmCard({
  action,
  confirming = false,
  onConfirm,
  onDismiss,
  onApplyAutomation,
}: ActionConfirmCardProps) {
  const [draft, setDraft] = useState<Record<string, unknown>>(action.payload);

  if (action.action_type === 'propose_create_incident') {
    return (
      <div className="rounded-lg border border-indigo-200 bg-indigo-50/80 p-3 text-sm space-y-2">
        <p className="font-medium text-indigo-900">Confirm incident creation</p>
        <label className="block">
          <span className="text-xs text-gray-600">Title</span>
          <input
            className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 text-sm"
            value={String(draft.title ?? '')}
            onChange={(e) => setDraft((p) => ({ ...p, title: e.target.value }))}
          />
        </label>
        <label className="block">
          <span className="text-xs text-gray-600">Description</span>
          <textarea
            rows={3}
            className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 text-sm"
            value={String(draft.description ?? '')}
            onChange={(e) => setDraft((p) => ({ ...p, description: e.target.value }))}
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="text-xs text-gray-600">Impact</span>
            <select
              className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 text-sm"
              value={String(draft.impact ?? 'medium')}
              onChange={(e) => setDraft((p) => ({ ...p, impact: e.target.value }))}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-gray-600">Urgency</span>
            <select
              className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 text-sm"
              value={String(draft.urgency ?? 'medium')}
              onChange={(e) => setDraft((p) => ({ ...p, urgency: e.target.value }))}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </label>
        </div>
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            disabled={confirming}
            onClick={() => onConfirm(draft)}
            className="px-3 py-1.5 rounded-md bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            {confirming ? 'Creating…' : 'Create incident'}
          </button>
          <button type="button" onClick={onDismiss} className="px-3 py-1.5 rounded-md text-xs text-gray-600 hover:bg-gray-100">
            Dismiss
          </button>
        </div>
      </div>
    );
  }

  if (action.action_type === 'propose_work_note') {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-3 text-sm space-y-2">
        <p className="font-medium text-amber-900">Confirm work note</p>
        <textarea
          rows={4}
          className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
          value={String(draft.content ?? '')}
          onChange={(e) => setDraft((p) => ({ ...p, content: e.target.value }))}
        />
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={draft.is_customer_visible !== false}
            onChange={(e) => setDraft((p) => ({ ...p, is_customer_visible: e.target.checked }))}
          />
          Visible to customer
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={confirming}
            onClick={() => onConfirm(draft)}
            className="px-3 py-1.5 rounded-md bg-amber-600 text-white text-xs font-medium hover:bg-amber-700 disabled:opacity-50"
          >
            {confirming ? 'Saving…' : 'Add note'}
          </button>
          <button type="button" onClick={onDismiss} className="px-3 py-1.5 rounded-md text-xs text-gray-600 hover:bg-gray-100">
            Dismiss
          </button>
        </div>
      </div>
    );
  }

  if (action.action_type === 'propose_automation_config') {
    const automation = (draft.automation_config ?? {}) as Record<string, unknown>;
    const errors = action.validation_errors ?? [];
    return (
      <div className="rounded-lg border border-violet-200 bg-violet-50/80 p-3 text-sm space-y-2">
        <p className="font-medium text-violet-900">Proposed automation config</p>
        {draft.summary ? <p className="text-xs text-gray-600">{String(draft.summary)}</p> : null}
        {errors.length > 0 && (
          <ul className="text-xs text-red-700 list-disc pl-4">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
        <pre className="max-h-40 overflow-auto rounded bg-white border border-gray-200 p-2 text-[10px] font-mono">
          {JSON.stringify(automation, null, 2)}
        </pre>
        <div className="flex flex-wrap gap-2">
          {onApplyAutomation && errors.length === 0 && (
            <button
              type="button"
              onClick={() => onApplyAutomation(automation)}
              className="px-3 py-1.5 rounded-md bg-violet-600 text-white text-xs font-medium hover:bg-violet-700"
            >
              Apply to editor
            </button>
          )}
          <button type="button" onClick={onDismiss} className="px-3 py-1.5 rounded-md text-xs text-gray-600 hover:bg-gray-100">
            Dismiss
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
      <p className="font-medium">Pending action: {action.action_type}</p>
      <div className="flex gap-2 mt-2">
        <button
          type="button"
          disabled={confirming}
          onClick={() => onConfirm(draft)}
          className="px-3 py-1.5 rounded-md bg-gray-800 text-white text-xs disabled:opacity-50"
        >
          Confirm
        </button>
        <button type="button" onClick={onDismiss} className="px-3 py-1.5 rounded-md text-xs text-gray-600 hover:bg-gray-100">
          Dismiss
        </button>
      </div>
    </div>
  );
}
