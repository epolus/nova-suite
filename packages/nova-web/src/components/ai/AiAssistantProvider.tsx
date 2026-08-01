/* SPDX-License-Identifier: AGPL-3.0-only */
import { useMemo, useState, type ReactNode } from 'react';
import type { AiConversationContext, AiPersona } from '../../api/client';
import AiAssistantWidget from './AiAssistantWidget';
import { AiAssistantContext } from './aiAssistantContext';

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
