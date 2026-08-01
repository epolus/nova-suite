/* SPDX-License-Identifier: AGPL-3.0-only */
import { useCallback } from 'react';
import { useMessages, useTranslations } from 'use-intl';
import { formatEnumFallback, snakeToCamel } from './labels';

function hasNestedKey(messages: unknown, path: string): boolean {
  const parts = path.split('.');
  let current: unknown = messages;
  for (const part of parts) {
    if (!current || typeof current !== 'object' || !(part in (current as object))) return false;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === 'string';
}

type FieldKey =
  | 'name'
  | 'title'
  | 'displayName'
  | 'description'
  | 'email'
  | 'phone'
  | 'location'
  | 'status'
  | 'priority'
  | 'impact'
  | 'urgency'
  | 'category'
  | 'service'
  | 'assignmentGroup'
  | 'assignedTo'
  | 'createdAt'
  | 'updatedAt'
  | 'search'
  | 'number'
  | 'code'
  | 'country'
  | 'city'
  | 'parent'
  | 'contact'
  | 'sla'
  | 'created'
  | 'updated'
  | 'serviceItem'
  | 'requester'
  | 'approvedBy'
  | 'approvedAt'
  | 'notes'
  | 'incidentCount'
  | 'openIncidentCount'
  | 'stage'
  | 'risk'
  | 'pendingApprovals'
  | 'conflicts'
  | 'scheduledStart'
  | 'declared'
  | 'participants'
  | 'managedBy'
  | 'supportedBy'
  | 'task'
  | 'request'
  | 'group'
  | 'completed'
  | 'caller'
  | 'subcategory'
  | 'department'
  | 'type'
  | 'class'
  | 'environment';

export function useFieldLabel() {
  const t = useTranslations('common.fields');
  return useCallback((key: FieldKey) => t(key), [t]);
}

export function useStatusLabel() {
  const messages = useMessages();
  const t = useTranslations('status');
  return useCallback(
    (value: string) => {
      if (!value) return '';
      const key = snakeToCamel(value);
      if (hasNestedKey(messages, `status.${key}`)) return t(key as never);
      return formatEnumFallback(value);
    },
    [messages, t],
  );
}

export function usePriorityLabel() {
  const messages = useMessages();
  const t = useTranslations('priority');
  return useCallback(
    (priority: number) => {
      const key = `p${priority}`;
      if (hasNestedKey(messages, `priority.${key}`)) return t(key as never);
      return `P${priority}`;
    },
    [messages, t],
  );
}

export function useImpactUrgencyLabel() {
  const messages = useMessages();
  const tImpact = useTranslations('impact');
  const tUrgency = useTranslations('urgency');
  const impact = useCallback(
    (value: string) => {
      if (!value) return '';
      if (hasNestedKey(messages, `impact.${value}`)) return tImpact(value as never);
      return formatEnumFallback(value);
    },
    [messages, tImpact],
  );
  const urgency = useCallback(
    (value: string) => {
      if (!value) return '';
      if (hasNestedKey(messages, `urgency.${value}`)) return tUrgency(value as never);
      return formatEnumFallback(value);
    },
    [messages, tUrgency],
  );
  return { impact, urgency };
}
