/* SPDX-License-Identifier: AGPL-3.0-only */
import { describe, expect, it } from 'vitest';
import {
  compileFulfillmentModelTasks,
  fulfillmentModelConfigErrors,
  fulfillmentTemplateError,
  parseFulfillmentModelConfig,
  renderFulfillmentTemplate,
  requestWorkflowAction,
  serviceItemFulfillmentIssue,
} from './fulfillment-model';

const GROUP = '11111111-1111-4111-8111-111111111111';
const CLASS = '22222222-2222-4222-8222-222222222222';

function config(overrides?: {
  task?: boolean;
  tasks?: Array<{ name: string; assigned_group_id: string }>;
  ci?: boolean;
  asset?: boolean;
  nameTemplate?: string;
}) {
  const tasks = overrides?.tasks
    ?? (overrides?.task === false ? [] : [{
      name: 'Deliver hardware',
      instructions: 'Hand the device to the user.',
      assigned_group_id: GROUP,
      sla_hours: 8,
    }]);
  const parsed = parseFulfillmentModelConfig({
    tasks,
    ci: {
      enabled: overrides?.ci ?? true,
      class_id: CLASS,
      name_template: overrides?.nameTemplate ?? '{{item.name}}-{{request.number}}',
      display_name_template: '{{item.name}} {{request.number}}',
      status: 'installed',
    },
    asset: {
      enabled: overrides?.asset ?? true,
      category: 'hardware',
      name_template: '{{form.asset_tag}}',
      asset_tag_template: '{{request.number}}',
    },
  });
  if (!parsed) throw new Error(fulfillmentModelConfigErrors({}).join('; '));
  return parsed;
}

describe('fulfillment model config', () => {
  it('requires at least one action and the fields that action needs', () => {
    expect(fulfillmentModelConfigErrors({
      tasks: [],
      ci: { enabled: false },
      asset: { enabled: false },
    })).toEqual(['tasks: Enable a group task, a configuration item, or an asset']);

    expect(fulfillmentModelConfigErrors({
      tasks: [{ name: 'Do it' }],
      ci: { enabled: false },
      asset: { enabled: false },
    }).some((error) => error.includes('Assignment group'))).toBe(true);

    expect(fulfillmentModelConfigErrors({
      tasks: [],
      ci: { enabled: true, name_template: '{{nope}}', display_name_template: '{{item.name}}' },
      asset: { enabled: false },
    }).join(' ')).toMatch(/CI class/);
  });

  it('rejects unsupported template tokens', () => {
    expect(fulfillmentTemplateError('{{env.SECRET}}')).toMatch(/Unsupported placeholder/);
    expect(fulfillmentTemplateError('{{request.number}}')).toBeNull();
    expect(fulfillmentTemplateError('HW-{{form.asset_tag}}')).toBeNull();
  });
});

describe('renderFulfillmentTemplate', () => {
  it('fills request, item, and form tokens', () => {
    const rendered = renderFulfillmentTemplate('{{item.name}} {{request.number}} {{form.os}}', {
      requestNumber: 'REQ0001001',
      itemName: 'Laptop',
      formData: { os: 'Windows 11', extra: { nested: true } },
    });
    expect(rendered).toBe('Laptop REQ0001001 Windows 11');
  });
});

describe('compileFulfillmentModelTasks', () => {
  it('injects manager approval, then the group task, then one provision step', () => {
    const tasks = compileFulfillmentModelTasks({ approvalRequired: true, config: config() });
    expect(tasks.map((task) => [task.taskType, task.taskOrder, task.name])).toEqual([
      ['approval', 0, 'Manager Approval'],
      ['manual', 1, 'Deliver hardware'],
      ['automated', 2, 'Create CI and asset'],
    ]);
    expect(tasks[0].id).toBeNull();
    expect(tasks[1].assignedGroupId).toBe(GROUP);
    expect(tasks[2].automationConfig).toEqual({ kind: 'fulfillment_model' });
    expect(tasks.every((task) => task.id === null)).toBe(true);
  });

  it('runs each group task in order, then the provision step', () => {
    const second = '33333333-3333-4333-8333-333333333333';
    const tasks = compileFulfillmentModelTasks({
      approvalRequired: true,
      config: config({
        tasks: [
          { name: 'Pick from stock', assigned_group_id: GROUP },
          { name: 'Deliver hardware', assigned_group_id: second },
        ],
      }),
    });
    expect(tasks.map((task) => [task.taskType, task.taskOrder, task.name, task.assignedGroupId])).toEqual([
      ['approval', 0, 'Manager Approval', null],
      ['manual', 1, 'Pick from stock', GROUP],
      ['manual', 2, 'Deliver hardware', second],
      ['automated', 3, 'Create CI and asset', null],
    ]);
  });

  it('omits approval and provision when they are not configured', () => {
    const tasks = compileFulfillmentModelTasks({
      approvalRequired: false,
      config: config({ ci: false, asset: false }),
    });
    expect(tasks).toHaveLength(1);
    expect(tasks[0].taskType).toBe('manual');
  });

  it('names a CI-only or asset-only provision step', () => {
    expect(compileFulfillmentModelTasks({
      approvalRequired: false,
      config: config({ task: false, asset: false }),
    })[0].name).toBe('Create configuration item');
    expect(compileFulfillmentModelTasks({
      approvalRequired: false,
      config: config({ task: false, ci: false }),
    })[0].name).toBe('Create asset');
  });
});

describe('service item fulfillment exclusivity', () => {
  it('rejects a model together with catalog tasks', () => {
    expect(serviceItemFulfillmentIssue({
      fulfillmentModelId: 'model',
      modelActive: true,
      catalogTaskCount: 2,
      activeCatalogTaskCount: 1,
      activating: true,
    })).toBe('model_and_tasks');
  });

  it('allows an active model with no catalog tasks', () => {
    expect(serviceItemFulfillmentIssue({
      fulfillmentModelId: 'model',
      modelActive: true,
      catalogTaskCount: 0,
      activeCatalogTaskCount: 0,
      activating: true,
    })).toBeNull();
  });

  it('still requires a catalog task when no model is selected', () => {
    expect(serviceItemFulfillmentIssue({
      fulfillmentModelId: null,
      modelActive: false,
      catalogTaskCount: 0,
      activeCatalogTaskCount: 0,
      activating: true,
    })).toBe('activate_requires_task');
  });

  it('starts workflow for a model and keeps the legacy path for items with neither', () => {
    expect(requestWorkflowAction({
      fulfillmentModelId: 'model',
      modelFound: true,
      modelActive: true,
      catalogTaskCount: 0,
      activeCatalogTaskCount: 0,
    })).toEqual({ action: 'start', issue: null });
    expect(requestWorkflowAction({
      fulfillmentModelId: null,
      modelFound: false,
      modelActive: false,
      catalogTaskCount: 0,
      activeCatalogTaskCount: 0,
    })).toEqual({ action: 'legacy', issue: null });
    expect(requestWorkflowAction({
      fulfillmentModelId: 'model',
      modelFound: true,
      modelActive: false,
      catalogTaskCount: 0,
      activeCatalogTaskCount: 0,
    }).issue).toBe('inactive_model');
    expect(requestWorkflowAction({
      fulfillmentModelId: 'model',
      modelFound: true,
      modelActive: true,
      catalogTaskCount: 1,
      activeCatalogTaskCount: 1,
    }).issue).toBe('model_and_tasks');
  });
});
