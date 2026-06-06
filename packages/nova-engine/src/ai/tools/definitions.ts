/* SPDX-License-Identifier: AGPL-3.0-only */
import type { AiPersona, AiToolDefinition } from '../types';

const searchKnowledge: AiToolDefinition = {
  name: 'search_knowledge',
  description: 'Search published knowledge base articles by keywords or problem description.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search text (symptoms, error, topic)' },
      category: { type: 'string', description: 'Optional category hint' },
    },
    required: ['query'],
  },
};

const getArticleSummary: AiToolDefinition = {
  name: 'get_article_summary',
  description: 'Fetch a published knowledge article body by id for detailed answers.',
  parameters: {
    type: 'object',
    properties: {
      article_id: { type: 'string', description: 'Knowledge article UUID' },
    },
    required: ['article_id'],
  },
};

const searchMyIncidents: AiToolDefinition = {
  name: 'search_my_incidents',
  description: 'List the current user open or recent incidents.',
  parameters: {
    type: 'object',
    properties: {
      status: { type: 'string', enum: ['open', 'all'], description: 'Filter by open or all' },
      limit: { type: 'number', description: 'Max results (default 5)' },
    },
  },
};

const listCatalogCategories: AiToolDefinition = {
  name: 'list_catalog_categories',
  description: 'List service catalog categories (Hardware, Software, etc.) available to the user.',
  parameters: { type: 'object', properties: {} },
};

const searchCatalog: AiToolDefinition = {
  name: 'search_catalog',
  description:
    'Search active service catalog items the user can request (e.g. laptop, software, account). Returns names, descriptions, and links to open each item.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'What the user is looking for (e.g. "laptop", "new computer")' },
      category: { type: 'string', description: 'Optional category name filter (e.g. "Hardware")' },
      limit: { type: 'number', description: 'Max results (default 8)' },
    },
    required: ['query'],
  },
};

const getCatalogItem: AiToolDefinition = {
  name: 'get_catalog_item',
  description:
    'Get details for one catalog item including form fields the user must fill when ordering. Use after search_catalog to answer specifics.',
  parameters: {
    type: 'object',
    properties: {
      item_id: { type: 'string', description: 'Service catalog item id from search_catalog' },
    },
    required: ['item_id'],
  },
};

const proposeCreateIncident: AiToolDefinition = {
  name: 'propose_create_incident',
  description: 'Propose a new incident for user confirmation (does not create until confirmed).',
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string' },
      description: { type: 'string' },
      impact: { type: 'string', enum: ['low', 'medium', 'high'] },
      urgency: { type: 'string', enum: ['low', 'medium', 'high'] },
    },
    required: ['title', 'description'],
  },
};

const getIncidentContext: AiToolDefinition = {
  name: 'get_incident_context',
  description: 'Load incident details and recent journal entries.',
  parameters: {
    type: 'object',
    properties: {
      incident_id: { type: 'string', description: 'Incident UUID (defaults to conversation context)' },
    },
  },
};

const suggestKbForIncident: AiToolDefinition = {
  name: 'suggest_kb_for_incident',
  description: 'Rank knowledge articles relevant to an incident.',
  parameters: {
    type: 'object',
    properties: {
      incident_id: { type: 'string' },
    },
  },
};

const proposeWorkNote: AiToolDefinition = {
  name: 'propose_work_note',
  description: 'Propose an internal or customer-visible work note for user confirmation.',
  parameters: {
    type: 'object',
    properties: {
      incident_id: { type: 'string' },
      content: { type: 'string' },
      entry_type: { type: 'string', enum: ['comment', 'work_note'] },
      is_customer_visible: { type: 'boolean' },
    },
    required: ['incident_id', 'content'],
  },
};

const proposeAutomationConfig: AiToolDefinition = {
  name: 'propose_automation_config',
  description: 'Propose catalog task automation_config JSON (state_machine) for user review.',
  parameters: {
    type: 'object',
    properties: {
      automation_config: { type: 'object', description: 'Full automation_config object' },
      summary: { type: 'string', description: 'Short explanation of the workflow' },
    },
    required: ['automation_config'],
  },
};

const ESS_TOOLS: AiToolDefinition[] = [
  searchKnowledge,
  getArticleSummary,
  listCatalogCategories,
  searchCatalog,
  getCatalogItem,
  searchMyIncidents,
  proposeCreateIncident,
];

const AGENT_TOOLS: AiToolDefinition[] = [
  searchKnowledge,
  getArticleSummary,
  getIncidentContext,
  suggestKbForIncident,
  proposeWorkNote,
  proposeAutomationConfig,
];

export function getToolsForPersona(persona: AiPersona): AiToolDefinition[] {
  return persona === 'ess' ? ESS_TOOLS : AGENT_TOOLS;
}

export const PROPOSE_TOOL_NAMES = new Set([
  'propose_create_incident',
  'propose_work_note',
  'propose_automation_config',
  'propose_catalog_task_patch',
]);
