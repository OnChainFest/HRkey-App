/**
 * Unit Tests: Notification Manager Service
 *
 * Coverage:
 * - In-app notification creation
 * - Email sending (mocked)
 * - Mark as read/unread
 * - Unread count
 * - Notification archiving
 * - Bulk operations
 */

import { mockUsers, mockNotifications, createMockNotification } from '../utils/mock-data';

// Mock Supabase
const mockFrom = jest.fn();
const mockSupabaseClient = {
  from: mockFrom,
};

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabaseClient),
}));

// Mock Resend
const mockEmailSend = jest.fn();
const mockResend = {
  emails: {
    send: mockEmailSend,
  },
};

jest.mock('resend', () => ({
  Resend: jest.fn(() => mockResend),
}));

// Import after mocks
import { NotificationManager } from '../../services/notifications/notification-manager';

describe('NotificationManager Service', () => {
  let notificationManager: NotificationManager;

  // Mock chain builder for Supabase queries
  const mockChain = {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    range: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    single: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockFrom.mockReturnValue(mockChain);
    mockEmailSend.mockResolvedValue({ id: 'email-123' });

    notificationManager = new NotificationManager();
  });

  describe('createNotification', () => {
    test('should create in-app notification successfully', async () => {
      const mockNotif = createMockNotification(mockUsers.provider.id, 'paymentReceived');

      mockChain.single.mockResolvedValue({
        data: mockNotif,
        error: null,
      });

      const result = await notificationManager.createNotification({
        userId: mockUsers.provider.id,
        type: 'payment_received',
        title: '💰 Payment Received!',
        message: 'You received 60 RLUSD',
        data: { amount: 60 },
      });

      expect(result).toBeDefined();
      expect(result.type).toBe('payment_received');
      expect(result.read).toBe(false);
      expect(mockFrom).toHaveBeenCalledWith('notifications');
    });

    test('should send email when sendEmail is true', async () => {
      mockChain.single.mockResolvedValue({
        data: createMockNotification(mockUsers.provider.id),
        error: null,
      });

      await notificationManager.createNotification({
        userId: mockUsers.provider.id,
        type: 'payment_received',
        title: 'Payment Received',
        message: 'You received 60 RLUSD',
        sendEmail: true,
        recipientEmail: 'test@example.com',
      });

      expect(mockEmailSend).toHaveBeenCalled();
      const emailCall = mockEmailSend.mock.calls[0][0];
      expect(emailCall).toHaveProperty('to', 'test@example.com');
      expect(emailCall).toHaveProperty('subject');
      expect(emailCall).toHaveProperty('html');
      expect(emailCall.html).toContain('Payment Received');
    });

    test('should not send email when sendEmail is false', async () => {
      mockChain.single.mockResolvedValue({
        data: createMockNotification(mockUsers.provider.id),
        error: null,
      });

      await notificationManager.createNotification({
        userId: mockUsers.provider.id,
        type: 'payment_received',
        title: 'Payment Received',
        message: 'You received 60 RLUSD',
        sendEmail: false,
      });

      expect(mockEmailSend).not.toHaveBeenCalled();
    });

    test('should continue if email fails but notification succeeds', async () => {
      mockChain.single.mockResolvedValue({
        data: createMockNotification(mockUsers.provider.id),
        error: null,
      });

      mockEmailSend.mockRejectedValueOnce(new Error('Email service unavailable'));

      // Should NOT throw - graceful degradation
      const result = await notificationManager.createNotification({
        userId: mockUsers.provider.id,
        type: 'payment_received',
        title: 'Payment Received',
        message: 'You received 60 RLUSD',
        sendEmail: true,
        recipientEmail: 'test@example.com',
      });

      expect(result).toBeDefined();
    });

    test('should include custom data in notification', async () => {
      const insertMock = jest.fn().mockReturnValue(mockChain);
      mockFrom.mockReturnValue({
        ...mockChain,
        insert: insertMock,
      });

      const customData = {
        amount: 100,
        txHash: '0xabc123',
        referenceId: 'ref-123',
      };

      mockChain.single.mockResolvedValue({
        data: { id: 'notif-123', data: customData },
        error: null,
      });

      await notificationManager.createNotification({
        userId: mockUsers.provider.id,
        type: 'payment_received',
        title: 'Payment Received',
        message: 'You received payment',
        data: customData,
      });

      const insertCall = insertMock.mock.calls[0][0];
      expect(insertCall.data).toEqual(customData);
    });
  });

  describe('markAsRead', () => {
    test('should mark notification as read and set timestamp', async () => {
      const now = new Date();
      mockChain.single.mockResolvedValue({
        data: {
          id: 'notif-123',
          read: true,
          read_at: now.toISOString(),
        },
        error: null,
      });

      const result = await notificationManager.markAsRead('notif-123');

      expect(result.read).toBe(true);
      expect(result.read_at).toBeDefined();
      expect(mockFrom).toHaveBeenCalledWith('notifications');
    });

    test('should throw error if notification not found', async () => {
      mockChain.single.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'Not found' },
      });

      await expect(
        notificationManager.markAsRead('nonexistent-id')
      ).rejects.toThrow();
    });
  });

  describe('markAllAsRead', () => {
    test('should mark all user notifications as read', async () => {
      const updateMock = jest.fn().mockReturnValue(mockChain);
      mockFrom.mockReturnValue({
        ...mockChain,
        update: updateMock,
      });

      mockChain.eq.mockReturnValue({
        data: { count: 5 },
        error: null,
      });

      await notificationManager.markAllAsRead(mockUsers.provider.id);

      expect(updateMock).toHaveBeenCalledWith({
        read: true,
        read_at: expect.any(String),
      });
    });

    test('should only update unread notifications', async () => {
      const updateMock = jest.fn().mockReturnValue(mockChain);
      const eqMock = jest.fn().mockReturnThis();

      mockFrom.mockReturnValue({
        ...mockChain,
        update: updateMock,
        eq: eqMock,
      });

      mockChain.eq.mockReturnValue({
        data: { count: 3 },
        error: null,
      });

      await notificationManager.markAllAsRead(mockUsers.provider.id);

      // Should filter by user_id and read=false
      expect(eqMock).toHaveBeenCalledWith('user_id', mockUsers.provider.id);
      expect(eqMock).toHaveBeenCalledWith('read', false);
    });
  });

  describe('getUnreadCount', () => {
    test('should return correct unread count', async () => {
      mockChain.single.mockResolvedValue({
        data: { count: 5 },
        error: null,
      });

      const count = await notificationManager.getUnreadCount(mockUsers.provider.id);

      expect(count).toBe(5);
    });

    test('should return 0 if no unread notifications', async () => {
      mockChain.single.mockResolvedValue({
        data: { count: 0 },
        error: null,
      });

      const count = await notificationManager.getUnreadCount(mockUsers.provider.id);

      expect(count).toBe(0);
    });

    test('should handle database errors gracefully', async () => {
      mockChain.single.mockResolvedValue({
        data: null,
        error: { message: 'Database error' },
      });

      await expect(
        notificationManager.getUnreadCount(mockUsers.provider.id)
      ).rejects.toThrow('Database error');
    });
  });

  describe('getUserNotifications', () => {
    test('should return paginated notifications', async () => {
      const mockNotifications = [
        createMockNotification(mockUsers.provider.id, 'paymentReceived'),
        createMockNotification(mockUsers.provider.id, 'walletCreated'),
      ];

      mockChain.range.mockReturnValue({
        data: mockNotifications,
        error: null,
      });

      const result = await notificationManager.getUserNotifications(mockUsers.provider.id, {
        limit: 10,
        offset: 0,
      });

      expect(result.length).toBe(2);
      expect(result[0].type).toBe('payment_received');
    });

    test('should filter by unread only when requested', async () => {
      const eqMock = jest.fn().mockReturnThis();
      mockFrom.mockReturnValue({
        ...mockChain,
        eq: eqMock,
      });

      mockChain.range.mockReturnValue({
        data: [],
        error: null,
      });

      await notificationManager.getUserNotifications(mockUsers.provider.id, {
        limit: 10,
        offset: 0,
        unreadOnly: true,
      });

      expect(eqMock).toHaveBeenCalledWith('read', false);
    });

    test('should order notifications by created_at desc', async () => {
      const orderMock = jest.fn().mockReturnThis();
      mockFrom.mockReturnValue({
        ...mockChain,
        order: orderMock,
      });

      mockChain.range.mockReturnValue({
        data: [],
        error: null,
      });

      await notificationManager.getUserNotifications(mockUsers.provider.id);

      expect(orderMock).toHaveBeenCalledWith('created_at', { ascending: false });
    });

    test('should apply pagination correctly', async () => {
      const rangeMock = jest.fn().mockReturnValue({ data: [], error: null });
      mockFrom.mockReturnValue({
        ...mockChain,
        range: rangeMock,
      });

      await notificationManager.getUserNotifications(mockUsers.provider.id, {
        limit: 20,
        offset: 40,
      });

      expect(rangeMock).toHaveBeenCalledWith(40, 59); // offset to offset+limit-1
    });
  });

  describe('archiveNotification', () => {
    test('should archive notification', async () => {
      const updateMock = jest.fn().mockReturnValue(mockChain);
      mockFrom.mockReturnValue({
        ...mockChain,
        update: updateMock,
      });

      mockChain.single.mockResolvedValue({
        data: { id: 'notif-123', archived: true },
        error: null,
      });

      await notificationManager.archiveNotification('notif-123');

      expect(updateMock).toHaveBeenCalledWith({ archived: true });
    });
  });

  describe('deleteNotification', () => {
    test('should delete notification', async () => {
      const deleteMock = jest.fn().mockReturnValue(mockChain);
      mockFrom.mockReturnValue({
        ...mockChain,
        delete: deleteMock,
      });

      mockChain.eq.mockReturnValue({
        data: null,
        error: null,
      });

      await notificationManager.deleteNotification('notif-123');

      expect(deleteMock).toHaveBeenCalled();
    });

    test('should throw error if deletion fails', async () => {
      const deleteMock = jest.fn().mockReturnValue(mockChain);
      mockFrom.mockReturnValue({
        ...mockChain,
        delete: deleteMock,
      });

      mockChain.eq.mockReturnValue({
        data: null,
        error: { message: 'Deletion failed' },
      });

      await expect(
        notificationManager.deleteNotification('notif-123')
      ).rejects.toThrow('Deletion failed');
    });
  });

  describe('Email template generation', () => {
    test('should generate payment received email with correct content', async () => {
      mockChain.single.mockResolvedValue({
        data: createMockNotification(mockUsers.provider.id),
        error: null,
      });

      await notificationManager.createNotification({
        userId: mockUsers.provider.id,
        type: 'payment_received',
        title: 'Payment Received',
        message: 'You received 60 RLUSD',
        data: {
          amount: 60,
          txHash: '0xabc123',
        },
        sendEmail: true,
        recipientEmail: 'test@example.com',
      });

      const emailCall = mockEmailSend.mock.calls[0][0];
      expect(emailCall.subject).toContain('Payment');
      expect(emailCall.html).toContain('60');
      expect(emailCall.html).toContain('RLUSD');
    });

    test('should generate wallet created email', async () => {
      mockChain.single.mockResolvedValue({
        data: createMockNotification(mockUsers.provider.id, 'walletCreated'),
        error: null,
      });

      await notificationManager.createNotification({
        userId: mockUsers.provider.id,
        type: 'wallet_created',
        title: 'Wallet Created',
        message: 'Your wallet is ready',
        data: {
          walletAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb6',
        },
        sendEmail: true,
        recipientEmail: 'test@example.com',
      });

      const emailCall = mockEmailSend.mock.calls[0][0];
      expect(emailCall.subject).toContain('Wallet');
      expect(emailCall.html).toContain('0x742d35');
    });
  });
});
