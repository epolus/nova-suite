/* SPDX-License-Identifier: AGPL-3.0-only */
import { UNIFIED_BUILDER_DEFAULT_AUTOMATION_CONFIG } from '@nova-suite/shared';

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

export function defaultAutomationConfigJson(): string {
  return JSON.stringify(UNIFIED_BUILDER_DEFAULT_AUTOMATION_CONFIG, null, 2);
}

/** True when config is a non-empty state machine we can safely persist. */
export function isPersistableAutomationConfig(cfg: Record<string, unknown> | null | undefined): cfg is Record<string, unknown> {
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) return false;
  if (cfg.kind !== 'state_machine') return false;
  if (!Array.isArray(cfg.states) || cfg.states.length === 0) return false;
  return typeof cfg.startAt === 'string' && cfg.startAt.trim().length > 0;
}

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
    return { workflowType, automationConfigJson: defaultAutomationConfigJson() };
  }
  const kind = (draft as { kind?: unknown }).kind;
  const automationConfig = (draft as { automationConfig?: unknown }).automationConfig;
  if (kind === 'unified_automation_designer_v1' && automationConfig && typeof automationConfig === 'object' && !Array.isArray(automationConfig)) {
    // Legacy bad saves stored `{}`; treat as default so canvas and JSON agree.
    if (!isPersistableAutomationConfig(automationConfig as Record<string, unknown>)) {
      return { workflowType, automationConfigJson: defaultAutomationConfigJson() };
    }
    return { workflowType, automationConfigJson: JSON.stringify(automationConfig, null, 2) };
  }
  return { workflowType, automationConfigJson: defaultAutomationConfigJson() };
}
