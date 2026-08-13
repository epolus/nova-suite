/* SPDX-License-Identifier: AGPL-3.0-only */
export type EditorSnapshot = {
  definitionId: string | null;
  definitionName: string;
  workflowType: string;
  config: string;
};

export type PersistedUnifiedDefinition = {
  kind: 'unified_automation_designer_v1';
  workflowType: string;
  automationConfig: Record<string, unknown>;
};

export function stableConfigJson(raw: string): string {
  try {
    const parsed = JSON.parse(raw || '{}') as unknown;
    if (!parsed || typeof parsed !== 'object') return raw.trim();
    return JSON.stringify(parsed);
  } catch {
    return raw;
  }
}

export function normalizeLoadedDefinition(
  draft: Record<string, unknown> | null | undefined,
  workflowTypeFallback: string,
): { workflowType: string; automationConfigJson: string } {
  const workflowType = typeof draft?.workflowType === 'string' && draft.workflowType.trim()
    ? draft.workflowType
    : workflowTypeFallback;
  if (!draft || typeof draft !== 'object' || Array.isArray(draft)) {
    return { workflowType, automationConfigJson: '{\n  \n}' };
  }
  const kind = (draft as { kind?: unknown }).kind;
  const automationConfig = (draft as { automationConfig?: unknown }).automationConfig;
  if (kind === 'unified_automation_designer_v1' && automationConfig && typeof automationConfig === 'object' && !Array.isArray(automationConfig)) {
    return { workflowType, automationConfigJson: JSON.stringify(automationConfig, null, 2) };
  }
  return { workflowType, automationConfigJson: '{\n  \n}' };
}
