/* SPDX-License-Identifier: AGPL-3.0-only */
import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { registerOp, uuidParam } from '../helpers';

export function registerNotificationPaths(registry: OpenAPIRegistry): void {
  registerOp(registry, 'get', '/notifications', 'Notifications', 'List recent notifications for the current user', {
    200: { description: 'Notification list (newest first, limit 50)' },
  });

  registerOp(registry, 'get', '/notifications/unread-count', 'Notifications', 'Unread notification count', {
    200: { description: '{ count }' },
  });

  registerOp(registry, 'post', '/notifications/read-all', 'Notifications', 'Mark all notifications as read', {
    200: { description: 'Success' },
  });

  registerOp(registry, 'post', '/notifications/delete-all', 'Notifications', 'Soft-delete all notifications for the current user', {
    200: { description: 'Success (deleted count when supported)' },
  });

  registerOp(registry, 'post', '/notifications/{id}/read', 'Notifications', 'Mark one notification as read', {
    200: { description: 'Success' },
    404: { description: 'Not found' },
  }, { params: uuidParam });
}
