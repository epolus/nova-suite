/* SPDX-License-Identifier: AGPL-3.0-only */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ai,
  type AiConversationContext,
  type AiPendingAction,
  type AiPersona,
} from '../../api/client';
import { useLocaleContext } from '../../context/LocaleContext';
import { useTranslations } from 'use-intl';
import { normalizeCatalogLinksInText } from '@nova-suite/shared';
import ActionConfirmCard from './ActionConfirmCard';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface ChatPanelProps {
  persona: AiPersona;
  context?: AiConversationContext;
  onClose: () => void;
  onApplyAutomation?: (config: Record<string, unknown>) => void;
}

const CATALOG_SEGMENT_RE = /(\/catalog\/[a-zA-Z0-9-]+(?:\s*\([^)]+\))?)/g;

function ChatMessageContent({
  content,
  linkClassName,
  catalogLinkLabel,
}: {
  content: string;
  linkClassName: string;
  catalogLinkLabel: string;
}) {
  const normalized = normalizeCatalogLinksInText(content);
  const parts = normalized.split(CATALOG_SEGMENT_RE);
  return (
    <>
      {parts.map((part, i) => {
        const named = part.match(/^(\/catalog\/[a-zA-Z0-9-]+)\s*\(([^)]+)\)$/);
        if (named?.[1] && named[2]) {
          return (
            <Link key={i} to={named[1]} className={linkClassName} onClick={(e) => e.stopPropagation()}>
              {named[2]}
            </Link>
          );
        }
        if (part.startsWith('/catalog/')) {
          return (
            <Link key={i} to={part} className={linkClassName} onClick={(e) => e.stopPropagation()}>
              {catalogLinkLabel}
            </Link>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

export default function ChatPanel({ persona, context, onClose, onApplyAutomation }: ChatPanelProps) {
  const t = useTranslations('common.ai');
  const { locale } = useLocaleContext();
  const navigate = useNavigate();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pendingActions, setPendingActions] = useState<AiPendingAction[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [initError, setInitError] = useState('');
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const contextRef = useRef(context);
  contextRef.current = context;

  const greetingForPersona = useCallback(
    () => (persona === 'ess' ? t('greetingEss') : t('greetingAgent')),
    [persona, t],
  );

  // One conversation per panel open — do not recreate when page context object identity changes.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { conversation } = await ai.createConversation({
          persona,
          context: contextRef.current,
        });
        if (cancelled) return;
        setConversationId(conversation.id);
        setMessages([{ id: 'greeting', role: 'assistant', content: greetingForPersona() }]);
      } catch (err: unknown) {
        if (!cancelled) {
          setInitError(err instanceof Error ? err.message : t('initFailed'));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // Create one conversation per persona; greeting text is refreshed separately on locale change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persona]);

  // Refresh welcome text when the user changes UI language (profile / language switcher).
  useEffect(() => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === 'greeting' ? { ...m, content: greetingForPersona() } : m,
      ),
    );
  }, [locale, greetingForPersona]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, pendingActions]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || !conversationId || loading) return;
    setInput('');
    setLoading(true);
    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);
    const assistantId = `a-${Date.now()}`;
    setMessages((prev) => [...prev, { id: assistantId, role: 'assistant', content: '' }]);

    try {
      await ai.sendMessageStream(conversationId, text, {
        context: contextRef.current,
        onToken: (chunk) => {
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, content: m.content + chunk } : m)),
          );
        },
        onDone: ({ content, pending_actions }) => {
          setPendingActions(pending_actions);
          if (content) {
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, content } : m)),
            );
          }
        },
        onError: (message) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: m.content || message } : m,
            ),
          );
        },
      });
    } finally {
      setLoading(false);
    }
  }, [conversationId, input, loading]);

  const handleConfirm = async (action: AiPendingAction, payload: Record<string, unknown>) => {
    if (!conversationId) return;
    setConfirmingId(action.id);
    try {
      const updated = { ...action, payload };
      const { result } = await ai.confirmAction(conversationId, action.id);
      setPendingActions((prev) => prev.filter((a) => a.id !== action.id));
      if (action.action_type === 'propose_create_incident' && result.path) {
        navigate(String(result.path));
        onClose();
      }
      if (action.action_type === 'propose_work_note') {
        setMessages((prev) => [
          ...prev,
          { id: `sys-${Date.now()}`, role: 'assistant', content: t('workNoteAdded') },
        ]);
      }
      void updated;
    } catch (err: unknown) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: err instanceof Error ? err.message : t('actionFailed'),
        },
      ]);
    } finally {
      setConfirmingId(null);
    }
  };

  const handleDismiss = async (action: AiPendingAction) => {
    if (!conversationId) return;
    try {
      await ai.cancelAction(conversationId, action.id);
    } catch {
      // ignore
    }
    setPendingActions((prev) => prev.filter((a) => a.id !== action.id));
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
        <h2 className="text-sm font-semibold text-gray-900">{t('title')}</h2>
        <button type="button" onClick={onClose} className="p-1 text-gray-400 hover:text-gray-700 rounded" aria-label={t('closeAriaLabel')}>
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
        {initError && <p className="text-sm text-red-600">{initError}</p>}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`text-sm rounded-lg px-3 py-2 max-w-[90%] whitespace-pre-wrap ${
              m.role === 'user'
                ? 'ml-auto bg-indigo-600 text-white'
                : 'mr-auto bg-gray-100 text-gray-800'
            }`}
          >
            {m.content ? (
              m.role === 'assistant' && persona === 'ess' ? (
                <ChatMessageContent
                  content={m.content}
                  linkClassName="text-indigo-600 underline font-medium hover:text-indigo-800"
                  catalogLinkLabel={t('catalogOpenLink')}
                />
              ) : (
                m.content
              )
            ) : (
              loading && m.role === 'assistant' ? '…' : ''
            )}
          </div>
        ))}
        {pendingActions.map((action) => (
          <ActionConfirmCard
            key={action.id}
            action={action}
            confirming={confirmingId === action.id}
            onConfirm={(payload) => handleConfirm(action, payload)}
            onDismiss={() => handleDismiss(action)}
            onApplyAutomation={
              onApplyAutomation
                ? (cfg) => {
                    onApplyAutomation(cfg);
                    handleDismiss(action);
                  }
                : undefined
            }
          />
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="p-3 border-t border-gray-100 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          disabled={!conversationId || !!initError}
          placeholder={t('placeholder')}
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={!conversationId || loading || !!initError}
          className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
          style={{ backgroundColor: 'var(--color-primary)' }}
        >
          {t('send')}
        </button>
      </div>
    </div>
  );
}
