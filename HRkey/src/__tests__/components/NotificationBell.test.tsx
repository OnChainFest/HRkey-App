import { fireEvent, render, screen } from '@testing-library/react';
import NotificationBell from '../../components/notifications/NotificationBell';

describe('NotificationBell', () => {
  it('renders the bell button', () => {
    render(<NotificationBell unreadCount={0} />);

    expect(screen.getByLabelText('Notifications')).toBeInTheDocument();
  });

  it('shows unread badge when unreadCount is greater than zero', () => {
    render(<NotificationBell unreadCount={3} />);

    expect(screen.getByLabelText('unread-count')).toHaveTextContent('3');
  });

  it('toggles the notifications list on click', () => {
    render(
      <NotificationBell
        unreadCount={1}
        notifications={[{ id: '1', message: 'Hello', read: false }]}
      />
    );

    const button = screen.getByLabelText('Notifications');
    fireEvent.click(button);
    expect(screen.getByLabelText('notifications-list')).toBeInTheDocument();

    fireEvent.click(button);
    expect(screen.queryByLabelText('notifications-list')).not.toBeInTheDocument();
  });
});
