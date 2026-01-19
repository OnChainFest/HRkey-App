/**
 * Notifications Controller
 *
 * Handles HTTP endpoints for notification operations:
 * - Get user notifications
 * - Mark notifications as read
 * - Get unread count
 * - Archive/delete notifications
 */

import { Request, Response } from 'express';
import { getNotificationManager } from '../services/notifications/notification-manager';

/**
 * GET /api/notifications
 * Get authenticated user's notifications with pagination
 */
export async function getNotifications(req: Request, res: Response): Promise<void> {
  try {
    // @ts-ignore - userId added by auth middleware
    const userId = req.userId;

    // Parse query parameters
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    const unreadOnly = req.query.unreadOnly === 'true';
    const includeArchived = req.query.includeArchived === 'true';

    // Validate pagination params
    if (limit < 1 || limit > 100) {
      res.status(400).json({
        success: false,
        error: 'Limit must be between 1 and 100',
      });
      return;
    }

    if (offset < 0) {
      res.status(400).json({
        success: false,
        error: 'Offset must be non-negative',
      });
      return;
    }

    const notificationManager = getNotificationManager();
    const notifications = await notificationManager.getUserNotifications(userId, {
      limit,
      offset,
      unreadOnly,
      includeArchived,
    });

    // Also get total unread count
    const unreadCount = await notificationManager.getUnreadCount(userId);

    res.status(200).json({
      success: true,
      data: {
        notifications,
        unreadCount,
        pagination: {
          limit,
          offset,
          count: notifications.length,
        },
      },
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get notifications',
    });
  }
}

/**
 * GET /api/notifications/unread-count
 * Get count of unread notifications
 */
export async function getUnreadCount(req: Request, res: Response): Promise<void> {
  try {
    // @ts-ignore
    const userId = req.userId;

    const notificationManager = getNotificationManager();
    const count = await notificationManager.getUnreadCount(userId);

    res.status(200).json({
      success: true,
      data: {
        unreadCount: count,
      },
    });
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get unread count',
    });
  }
}

/**
 * PATCH /api/notifications/:id/read
 * Mark a specific notification as read
 */
export async function markNotificationAsRead(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;

    if (!id) {
      res.status(400).json({
        success: false,
        error: 'Notification ID is required',
      });
      return;
    }

    const notificationManager = getNotificationManager();
    await notificationManager.markAsRead(id);

    res.status(200).json({
      success: true,
      message: 'Notification marked as read',
    });
  } catch (error) {
    console.error('Mark as read error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to mark as read',
    });
  }
}

/**
 * POST /api/notifications/mark-all-read
 * Mark all notifications as read for authenticated user
 */
export async function markAllAsRead(req: Request, res: Response): Promise<void> {
  try {
    // @ts-ignore
    const userId = req.userId;

    const notificationManager = getNotificationManager();
    const count = await notificationManager.markAllAsRead(userId);

    res.status(200).json({
      success: true,
      message: `${count} notifications marked as read`,
      data: {
        markedCount: count,
      },
    });
  } catch (error) {
    console.error('Mark all as read error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to mark all as read',
    });
  }
}

/**
 * PATCH /api/notifications/:id/archive
 * Archive a notification
 */
export async function archiveNotification(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;

    if (!id) {
      res.status(400).json({
        success: false,
        error: 'Notification ID is required',
      });
      return;
    }

    const notificationManager = getNotificationManager();
    await notificationManager.archiveNotification(id);

    res.status(200).json({
      success: true,
      message: 'Notification archived',
    });
  } catch (error) {
    console.error('Archive notification error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to archive notification',
    });
  }
}

/**
 * DELETE /api/notifications/:id
 * Delete a notification (hard delete)
 */
export async function deleteNotification(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;

    if (!id) {
      res.status(400).json({
        success: false,
        error: 'Notification ID is required',
      });
      return;
    }

    const notificationManager = getNotificationManager();
    await notificationManager.deleteNotification(id);

    res.status(200).json({
      success: true,
      message: 'Notification deleted',
    });
  } catch (error) {
    console.error('Delete notification error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete notification',
    });
  }
}

/**
 * POST /api/notifications/test
 * Create a test notification (development only)
 */
export async function createTestNotification(req: Request, res: Response): Promise<void> {
  try {
    // Only allow in development
    if (process.env.NODE_ENV === 'production') {
      res.status(403).json({
        success: false,
        error: 'Test notifications not allowed in production',
      });
      return;
    }

    // @ts-ignore
    const userId = req.userId;

    const { type, title, message, data, sendEmail } = req.body;

    if (!type || !title || !message) {
      res.status(400).json({
        success: false,
        error: 'type, title, and message are required',
      });
      return;
    }

    const notificationManager = getNotificationManager();
    const notification = await notificationManager.createNotification({
      userId,
      type,
      title,
      message,
      data: data || {},
      sendEmail: sendEmail || false,
    });

    res.status(201).json({
      success: true,
      data: {
        notification,
      },
    });
  } catch (error) {
    console.error('Create test notification error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create test notification',
    });
  }
}
