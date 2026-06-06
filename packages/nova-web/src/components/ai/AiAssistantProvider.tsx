/* SPDX-License-Identifier: AGPL-3.0-only */
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AiConversationContext, AiPersona } from '../../api/client';
import AiAssistantWidget from './AiAssistantWidget';

interface AiAssistantContextValue {
  setPageContext: (ctx: AiConversationContext | undefined) => void;
  setApplyAutomation: (handler: ((config: Record<string, unknown>) => void) | undefined) => void;
}

const AiAssistantContext = createContext<AiAssistantContextValue | null>(null);

export function AiAssistantProvider({
  persona,
  children,
}: {
  persona: AiPersona;
  children: ReactNode;
}) {
  const [pageContext, setPageContext] = useState<AiConversationContext | undefined>();
  const [applyAutomation, setApplyAutomation] = useState<
    ((config: Record<string, unknown>) => void) | undefined
  >();

  const value = useMemo(
    () => ({
      setPageContext,
      setApplyAutomation,
    }),
    [],
  );

  return (
    <AiAssistantContext.Provider value={value}>
      {children}
      <AiAssistantWidget
        persona={persona}
        context={pageContext}
        onApplyAutomation={applyAutomation}
      />
    </AiAssistantContext.Provider>
  );
}

export function useRegisterAiAutomationApply(
  handler: ((config: Record<string, unknown>) => void) | undefined,
) {
  const ctx = useContext(AiAssistantContext);
  useEffect(() => {
    if (!ctx) return;
    ctx.setApplyAutomation(handler);
    return () => ctx.setApplyAutomation(undefined);
  }, [ctx, handler]);
}

export function useSetAiContext(context: AiConversationContext | undefined) {
  const ctx = useContext(AiAssistantContext);
  const contextKey = context
    ? `${context.incidentId ?? ''}:${context.catalogTaskId ?? ''}:${context.serviceItemId ?? ''}`
    : '';
  const contextRef = useRef(context);
  contextRef.current = context;

  useEffect(() => {
    if (!ctx) return;
    ctx.setPageContext(contextRef.current);
    return () => ctx.setPageContext(undefined);
  }, [ctx, contextKey]);
}
