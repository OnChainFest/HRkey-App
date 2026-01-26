/**
 * Notifications Validation Schemas
 * In-app notifications only (no email, no push)
 */

import { z } from 'zod';

/**
 * Schema for GET /api/notifications query params
 */
export const getNotificationsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  unread_only: z.enum(['true', 'false']).optional().transform(val => val === 'true')
});

/**
 * Schema for notification ID param
 */
export const notificationIdParamSchema = z.object({
  id: z.string().uuid('Invalid notification ID')
});

/**
 * Schema for creating a notification (internal use)
 */
export const createNotificationSchema = z.object({
  user_id: z.string().uuid('Invalid user ID'),
  type: z.string().min(1).max(50),
  title: z.string().min(1).max(200),
  body: z.string().max(1000).optional()
});

export default {
  getNotificationsQuerySchema,
  notificationIdParamSchema,
  createNotificationSchema
};
