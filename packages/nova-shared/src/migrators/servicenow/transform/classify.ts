/* SPDX-License-Identifier: AGPL-3.0-only */
import type { SnActionType, SnLogicDefinition } from '../raw-schemas';
import { normalizeKey } from './text';
import { pick } from './step-values';

export type StepClass =
  | 'if' | 'elseif' | 'else' | 'foreach' | 'parallel' | 'container' | 'end' | 'setvars' | 'wait'
  | 'subflow_outputs' | 'unsupported_logic'
  | 'approval' | 'catalog_task' | 'create_record' | 'update_record' | 'lookup' | 'email' | 'notification'
  | 'log' | 'worknote' | 'rest' | 'script' | 'wait_condition' | 'delete_record' | 'custom'
  | 'subflow' | 'inline_subflow';

export function classifyLogic(def: SnLogicDefinition | undefined): StepClass {
  const keys = [normalizeKey(def?.type ?? ''), normalizeKey(def?.name ?? '')].filter(Boolean);
  const test = (re: RegExp) => keys.some((k) => re.test(k));
  if (test(/^else_?if$/)) return 'elseif';
  if (test(/^if$/)) return 'if';
  if (test(/^else$/)) return 'else';
  if (test(/for_?each/)) return 'foreach';
  if (test(/parallel/)) return 'parallel';
  if (test(/^(do_the_following|do_following|try|catch|try_catch)$/)) return 'container';
  if (test(/^end(_flow)?$/)) return 'end';
  if (test(/set_?flow_?variables/)) return 'setvars';
  if (test(/wait_for_a?_?duration|^wait$/)) return 'wait';
  if (test(/assign_?subflow_?outputs/)) return 'subflow_outputs';
  return 'unsupported_logic';
}

export function classifyAction(def: SnActionType | undefined, values: Record<string, unknown>): StepClass {
  const keys = [normalizeKey(def?.internal_name ?? ''), normalizeKey(def?.name ?? '')].filter(Boolean);
  const test = (re: RegExp) => keys.some((k) => re.test(k));
  const table = pick(values, 'table_name', 'table').toLowerCase();
  if (test(/ask_for_approval|^approval$|request_approval/)) return 'approval';
  if (test(/create_catalog_task/) || (test(/create_(record|task)/) && table === 'sc_task')) return 'catalog_task';
  if (test(/create_or_update_record|create_record/)) return 'create_record';
  if (test(/update_(multiple_)?records?/)) return 'update_record';
  if (test(/look_?up_records?/)) return 'lookup';
  if (test(/delete_record/)) return 'delete_record';
  if (test(/send_email/)) return 'email';
  if (test(/send_(notification|sms)/)) return 'notification';
  if (test(/^log$|log_message/)) return 'log';
  if (test(/add_work_?note|add_comment|add_worknote/)) return 'worknote';
  if (test(/wait_for_condition/)) return 'wait_condition';
  if (test(/script/) || typeof values.script === 'string') return 'script';
  if (test(/rest|http/) || ['rest_endpoint', 'base_url', 'resource_path', 'endpoint'].some((k) => k in values)) return 'rest';
  return 'custom';
}
