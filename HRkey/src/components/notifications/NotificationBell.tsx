'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { apiGet, apiPost } from '@/lib/apiClient';

type Notification = {
  id: string;
  type: string;
  title: string;
  body?: string;
  is_read: boolean;
  created_at: string;
};

type NotificationsResponse = {
  success: boolean;
  notifications: Notification[];
  total: number;
  unread_count: number;
};

type NotificationBellProps = {
  pollInterval?: number; // Polling interval in ms, default 30000
};

const NotificationBell = ({ pollInterval = 30000 }: NotificationBellProps) => {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const response = await apiGet<NotificationsResponse>('/api/notifications', {
        query: { limit: 10 }
      });

      if (response.success) {
        setNotifications(response.notifications);
        setUnreadCount(response.unread_count);
        setError(null);
      }
    } catch (err: any) {
      // Don't show error for 401 (not logged in)
      if (err.status !== 401) {
        setError('Failed to load notifications');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const markAsRead = useCallback(async (notificationId: string) => {
    try {
      await apiPost(`/api/notifications/${notificationId}/read`);

      // Update local state
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === notificationId ? { ...n, is_read: true } : n
        )
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Failed to mark notification as read', err);
    }
  }, []);

  const markAllAsRead = useCallback(async () => {
    try {
      await apiPost('/api/notifications/read-all');

      // Update local state
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, is_read: true }))
      );
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to mark all notifications as read', err);
    }
  }, []);

  // Initial fetch and polling
  useEffect(() => {
    fetchNotifications();

    if (pollInterval > 0) {
      const interval = setInterval(fetchNotifications, pollInterval);
      return () => clearInterval(interval);
    }
  }, [fetchNotifications, pollInterval]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [open]);

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="notification-bell" ref={dropdownRef}>
      <button
        aria-label="Notifications"
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="notification-btn"
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="notification-badge" aria-label="unread-count">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="notification-dropdown" role="menu">
          <div className="notification-header">
            <h4>Notifications</h4>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllAsRead}
                className="mark-all-read"
              >
                Mark all read
              </button>
            )}
          </div>

          <ul className="notification-list" aria-label="notifications-list">
            {loading && <li className="notification-loading">Loading...</li>}
            {error && <li className="notification-error">{error}</li>}
            {!loading && !error && notifications.length === 0 && (
              <li className="notification-empty">No notifications</li>
            )}
            {notifications.map((notification) => (
              <li
                key={notification.id}
                className={`notification-item ${!notification.is_read ? 'unread' : ''}`}
                onClick={() => !notification.is_read && markAsRead(notification.id)}
                role="menuitem"
              >
                <div className="notification-content">
                  <span className="notification-title">{notification.title}</span>
                  {notification.body && (
                    <span className="notification-body">{notification.body}</span>
                  )}
                  <span className="notification-time">
                    {formatTime(notification.created_at)}
                  </span>
                </div>
                {!notification.is_read && (
                  <span className="notification-dot" aria-hidden="true" />
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
