import { useState } from 'react';

type Notification = {
  id: string;
  message: string;
  read: boolean;
};

type NotificationBellProps = {
  unreadCount: number;
  notifications?: Notification[];
};

const NotificationBell = ({ unreadCount, notifications = [] }: NotificationBellProps) => {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button aria-label="Notifications" type="button" onClick={() => setOpen((prev) => !prev)}>
        🔔
        {unreadCount > 0 && <span aria-label="unread-count">{unreadCount}</span>}
      </button>
      {open && (
        <ul aria-label="notifications-list">
          {notifications.length === 0 && <li>No notifications</li>}
          {notifications.map((notification) => (
            <li key={notification.id}>{notification.message}</li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default NotificationBell;
