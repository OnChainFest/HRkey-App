/**
 * Notifications Controller
 * In-app notifications only (no email, no push, no cross-user access)
 */

import { createClient } from '@supabase/supabase-js';
import logger from '../logger.js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

let supabase;
const getSupabase = () => {
  if (!supabase) {
    supabase = createClient(supabaseUrl, supabaseServiceKey);
  }
  return supabase;
};

/**
 * GET /api/notifications
 * Get current user's notifications
 */
export async function getNotifications(req, res) {
  try {
    const userId = req.user.id;
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    const unreadOnly = req.query.unread_only === 'true';

    let query = getSupabase()
      .from('notifications')
      .select('id, type, title, body, is_read, created_at', { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (unreadOnly) {
      query = query.eq('is_read', false);
    }

    const { data: notifications, error, count } = await query;

    if (error) {
      throw error;
    }

    // Get unread count
    const { count: unreadCount, error: countError } = await getSupabase()
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_read', false);

    if (countError) {
      logger.warn('Failed to get unread count', {
        requestId: req.requestId,
        userId,
        error: countError.message
      });
    }

    return res.json({
      success: true,
      notifications: notifications || [],
      total: count || 0,
      unread_count: unreadCount || 0,
      limit,
      offset
    });
  } catch (error) {
    logger.error('Failed to get notifications', {
      requestId: req.requestId,
      userId: req.user?.id,
      error: error.message,
      stack: error.stack
    });
    return res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'Failed to retrieve notifications'
    });
  }
}

/**
 * POST /api/notifications/:id/read
 * Mark a notification as read
 */
export async function markAsRead(req, res) {
  try {
    const userId = req.user.id;
    const notificationId = req.params.id;

    // Verify the notification belongs to the user
    const { data: notification, error: fetchError } = await getSupabase()
      .from('notifications')
      .select('id, user_id, is_read')
      .eq('id', notificationId)
      .single();

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          error: 'NOT_FOUND',
          message: 'Notification not found'
        });
      }
      throw fetchError;
    }

    // Security: Ensure user owns this notification
    if (notification.user_id !== userId) {
      logger.warn('Unauthorized notification access attempt', {
        requestId: req.requestId,
        userId,
        notificationId,
        ownerId: notification.user_id
      });
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: 'You can only access your own notifications'
      });
    }

    // Already read
    if (notification.is_read) {
      return res.json({
        success: true,
        message: 'Notification already marked as read'
      });
    }

    // Mark as read
    const { error: updateError } = await getSupabase()
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId);

    if (updateError) {
      throw updateError;
    }

    return res.json({
      success: true,
      message: 'Notification marked as read'
    });
  } catch (error) {
    logger.error('Failed to mark notification as read', {
      requestId: req.requestId,
      userId: req.user?.id,
      notificationId: req.params.id,
      error: error.message,
      stack: error.stack
    });
    return res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'Failed to update notification'
    });
  }
}

/**
 * Create a notification (internal service function)
 * @param {Object} params - Notification params
 * @param {string} params.userId - User ID
 * @param {string} params.type - Notification type
 * @param {string} params.title - Notification title
 * @param {string} [params.body] - Notification body
 * @returns {Promise<Object>} Created notification
 */
export async function createNotification({ userId, type, title, body }) {
  const { data, error } = await getSupabase()
    .from('notifications')
    .insert([{
      user_id: userId,
      type,
      title,
      body,
      is_read: false,
      created_at: new Date().toISOString()
    }])
    .select()
    .single();

  if (error) {
    logger.error('Failed to create notification', {
      userId,
      type,
      error: error.message
    });
    throw error;
  }

  return data;
}

export default {
  getNotifications,
  markAsRead,
  createNotification
};
