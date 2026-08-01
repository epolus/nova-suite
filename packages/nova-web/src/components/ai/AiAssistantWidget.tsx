/* SPDX-License-Identifier: AGPL-3.0-only */
import { useEffect, useState } from 'react';
import { useTranslations } from 'use-intl';
import { ai, type AiConversationContext, type AiPersona } from '../../api/client';
import ChatPanel from './ChatPanel';

interface AiAssistantWidgetProps {
  persona: AiPersona;
  context?: AiConversationContext;
  onApplyAutomation?: (config: Record<string, unknown>) => void;
}

export default function AiAssistantWidget({ persona, context, onApplyAutomation }: AiAssistantWidgetProps) {
  const t = useTranslations('common.ai');
  const [available, setAvailable] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    ai.status()
      .then((s) => {
        const personaOk = persona === 'ess' ? s.ess_enabled : s.agent_enabled;
        setAvailable(s.enabled && s.provider_configured && personaOk);
      })
      .catch(() => setAvailable(false));
  }, [persona]);

  if (!available) return null;

  return (
    <>
      {open && (
        <div className="fixed bottom-20 right-4 z-50 w-[min(100vw-2rem,24rem)] h-[min(70vh,32rem)] flex flex-col">
          <ChatPanel
            persona={persona}
            context={context}
            onClose={() => setOpen(false)}
            onApplyAutomation={onApplyAutomation}
          />
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-4 right-4 z-50 w-14 h-14 rounded-full shadow-lg text-white flex items-center justify-center hover:opacity-90 transition-opacity"
        style={{ backgroundColor: 'var(--color-primary)' }}
        title={t('title')}
        aria-label={t('openAriaLabel')}
      >
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      </button>
    </>
  );
}
