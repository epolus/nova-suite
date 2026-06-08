/* SPDX-License-Identifier: AGPL-3.0-only */
import { createContext, useContext, useEffect, useRef } from 'react';
import type { AiConversationContext } from '../../api/client';

export interface AiAssistantContextValue {
  setPageContext: (ctx: AiConversationContext | undefined) => void;
  setApplyAutomation: (handler: ((config: Record<string, unknown>) => void) | undefined) => void;
}

export const AiAssistantContext = createContext<AiAssistantContextValue | null>(null);

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
