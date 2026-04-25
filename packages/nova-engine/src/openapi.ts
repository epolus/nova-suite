/* SPDX-License-Identifier: AGPL-3.0-only */
// ─── Nova Suite – OpenAPI Specification ───

export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Nova Suite API',
    version: '1.0.0',
    description:
      'Open-source ITSM Suite – Service catalog, incident management and CMDB.',
    license: { name: 'AGPL-3.0', url: 'https://www.gnu.org/licenses/agpl-3.0.html' },
  },
  servers: [{ url: '/api', description: 'API base' }],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http' as const,
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
  },
  security: [{ bearerAuth: [] }],
  tags: [
    { name: 'Auth', description: 'Authentication & user management' },
    { name: 'Catalog', description: 'Service catalog – categories & items' },
    { name: 'Requests', description: 'User portal – service requests' },
    { name: 'Incidents', description: 'Fulfiller backend – incident lifecycle' },
    { name: 'CMDB', description: 'Configuration management database' },
  ],
  paths: {
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Login',
        description: 'Authenticate with email and password, receive a JWT.',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'JWT token + user info' },
          401: { description: 'Invalid credentials' },
        },
      },
    },
    '/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Register user (admin only)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password', 'display_name'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string', minLength: 8 },
                  display_name: { type: 'string' },
                  time_format: { type: 'string', enum: ['12h', '24h'], default: '24h' },
                  date_format: { type: 'string', enum: ['DD.MM.YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'], default: 'YYYY-MM-DD' },
                  user_id: { type: 'string', description: 'Employee identifier' },
                  manager_id: { type: 'string', format: 'uuid' },
                  department_id: { type: 'string', format: 'uuid' },
                  cost_center_id: { type: 'string', format: 'uuid' },
                  role_ids: { type: 'array', items: { type: 'string', format: 'uuid' } },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'User created' },
          409: { description: 'Email already exists' },
        },
      },
    },
    '/auth/me': {
      get: {
        tags: ['Auth'],
        summary: 'Get current user',
        responses: { 200: { description: 'Current user info' } },
      },
    },
    '/catalog/categories': {
      get: {
        tags: ['Catalog'],
        summary: 'List service categories',
        responses: { 200: { description: 'Array of categories' } },
      },
      post: {
        tags: ['Catalog'],
        summary: 'Create category (admin)',
        responses: { 201: { description: 'Category created' } },
      },
    },
    '/catalog/items': {
      get: {
        tags: ['Catalog'],
        summary: 'List service items',
        parameters: [
          { name: 'category_id', in: 'query', schema: { type: 'string', format: 'uuid' } },
        ],
        responses: { 200: { description: 'Array of service items' } },
      },
      post: {
        tags: ['Catalog'],
        summary: 'Create service item (admin)',
        responses: { 201: { description: 'Item created' } },
      },
    },
    '/requests': {
      get: {
        tags: ['Requests'],
        summary: 'List requests',
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
        ],
        responses: { 200: { description: 'Paginated requests' } },
      },
      post: {
        tags: ['Requests'],
        summary: 'Submit a service request',
        responses: { 201: { description: 'Request created' } },
      },
    },
    '/requests/{id}': {
      get: {
        tags: ['Requests'],
        summary: 'Get request details',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'Request details' } },
      },
    },
    '/requests/{id}/approve': {
      post: {
        tags: ['Requests'],
        summary: 'Approve or reject a request',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'Request approved/rejected' } },
      },
    },
    '/incidents': {
      get: {
        tags: ['Incidents'],
        summary: 'List incidents',
        parameters: [
          { name: 'status', in: 'query', schema: { type: 'string' } },
          { name: 'assigned_to', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'priority', in: 'query', schema: { type: 'integer' } },
          { name: 'sla_breached', in: 'query', schema: { type: 'string', enum: ['true', 'false'] } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
        ],
        responses: { 200: { description: 'Paginated incidents' } },
      },
      post: {
        tags: ['Incidents'],
        summary: 'Create an incident',
        responses: { 201: { description: 'Incident created' } },
      },
    },
    '/incidents/{id}': {
      get: {
        tags: ['Incidents'],
        summary: 'Get incident details',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'Incident details' } },
      },
      patch: {
        tags: ['Incidents'],
        summary: 'Update an incident',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'Incident updated' } },
      },
    },
    '/incidents/{id}/journal': {
      get: {
        tags: ['Incidents'],
        summary: 'Get incident journal entries',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'Journal entries' } },
      },
      post: {
        tags: ['Incidents'],
        summary: 'Add a journal entry',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 201: { description: 'Entry added' } },
      },
    },
    '/cmdb/classes': {
      get: {
        tags: ['CMDB'],
        summary: 'List CI classes',
        responses: { 200: { description: 'Array of CI classes' } },
      },
      post: {
        tags: ['CMDB'],
        summary: 'Create a CI class (admin)',
        responses: { 201: { description: 'Class created' } },
      },
    },
    '/cmdb/items': {
      get: {
        tags: ['CMDB'],
        summary: 'List configuration items',
        parameters: [
          { name: 'class_id', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'status', in: 'query', schema: { type: 'string' } },
          { name: 'environment', in: 'query', schema: { type: 'string' } },
          { name: 'search', in: 'query', schema: { type: 'string' } },
        ],
        responses: { 200: { description: 'Paginated CIs' } },
      },
      post: {
        tags: ['CMDB'],
        summary: 'Create a configuration item',
        responses: { 201: { description: 'CI created' } },
      },
    },
    '/cmdb/items/{id}': {
      get: {
        tags: ['CMDB'],
        summary: 'Get CI details with relationships',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'CI details' } },
      },
      patch: {
        tags: ['CMDB'],
        summary: 'Update a configuration item',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'CI updated' } },
      },
    },
    '/cmdb/items/{id}/history': {
      get: {
        tags: ['CMDB'],
        summary: 'Get CI audit history',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'Audit trail' } },
      },
    },
    '/cmdb/items/{id}/impact': {
      get: {
        tags: ['CMDB'],
        summary: 'Impact analysis (blast radius)',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'depth', in: 'query', schema: { type: 'integer', default: 5 } },
        ],
        responses: { 200: { description: 'Impacted CIs' } },
      },
    },
    '/cmdb/relationships': {
      get: {
        tags: ['CMDB'],
        summary: 'List all CI relationships',
        responses: { 200: { description: 'Array of relationships' } },
      },
      post: {
        tags: ['CMDB'],
        summary: 'Create a CI relationship',
        responses: { 201: { description: 'Relationship created' } },
      },
    },
    '/cmdb/relationships/{id}': {
      delete: {
        tags: ['CMDB'],
        summary: 'Delete a CI relationship',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'Relationship deleted' } },
      },
    },
  },
};
