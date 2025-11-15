/**
 * Unit tests for Notifications Service
 */

const { CHECK_TYPES } = require('../config/constants');

// Mock logger
jest.mock('../utils/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  })
}));

// Mock axios
const mockAxiosPost = jest.fn();
jest.mock('axios', () => ({
  post: mockAxiosPost
}));

describe('NotificationService', () => {
  let notifications;
  const originalEnv = process.env;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();
    
    // Setup mock axios response
    mockAxiosPost.mockResolvedValue({ status: 200 });
    
    // Setup environment variables
    process.env = {
      ...originalEnv,
      MATTERMOST_WEBHOOK_URL: 'https://test.mattermost.com/hooks/test123',
      MATTERMOST_MENTIONS: '@user1 @user2'
    };
    
    // Reset modules and require notifications after env is set
    jest.resetModules();
    notifications = require('../notifications');
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Initialization', () => {
    test('should initialize with correct webhook URL and mentions', () => {
      expect(notifications.webhookUrl).toBe('https://test.mattermost.com/hooks/test123');
      expect(notifications.mentions).toBe('@user1 @user2');
    });

    test('should handle missing webhook URL gracefully', () => {
      jest.resetModules();
      delete process.env.MATTERMOST_WEBHOOK_URL;
      
      const notificationsNoWebhook = require('../notifications');
      expect(notificationsNoWebhook.webhookUrl).toBeUndefined();
    });

    test('should use empty mentions if not provided', () => {
      jest.resetModules();
      delete process.env.MATTERMOST_MENTIONS;
      process.env.MATTERMOST_WEBHOOK_URL = 'https://test.mattermost.com/hooks/test123';
      
      const notificationsNoMentions = require('../notifications');
      expect(notificationsNoMentions.mentions).toBe('');
    });
  });

  describe('sendDownNotification', () => {
    test('should send down notification with correct payload', async () => {
      await notifications.sendDownNotification(CHECK_TYPES.GET, 'Connection timeout');

      expect(mockAxiosPost).toHaveBeenCalledWith(
        'https://test.mattermost.com/hooks/test123',
        expect.objectContaining({
          channel: 'skypro-crm-alerts',
          username: expect.stringContaining('API (GET)'),
          text: expect.stringContaining('не отвечает')
        })
      );
    });

    test('should include error message in notification', async () => {
      await notifications.sendDownNotification(CHECK_TYPES.WEB, 'Server error 500');

      expect(mockAxiosPost).toHaveBeenCalledWith(
        'https://test.mattermost.com/hooks/test123',
        expect.objectContaining({
          text: expect.stringContaining('Server error 500')
        })
      );
    });

    test('should include mentions in notification', async () => {
      await notifications.sendDownNotification(CHECK_TYPES.POST, 'API error');

      expect(mockAxiosPost).toHaveBeenCalledWith(
        'https://test.mattermost.com/hooks/test123',
        expect.objectContaining({
          text: expect.stringContaining('@user1 @user2')
        })
      );
    });

    test('should debounce duplicate notifications within 5 minutes', async () => {
      // First notification
      await notifications.sendDownNotification(CHECK_TYPES.GET, 'Error 1');
      expect(mockAxiosPost).toHaveBeenCalledTimes(1);

      // Second notification within 5 minutes should be skipped
      await notifications.sendDownNotification(CHECK_TYPES.GET, 'Error 2');
      expect(mockAxiosPost).toHaveBeenCalledTimes(1);
    });

    test('should not send notification if webhook URL is not configured', async () => {
      jest.resetModules();
      delete process.env.MATTERMOST_WEBHOOK_URL;
      const notificationsNoWebhook = require('../notifications');

      await notificationsNoWebhook.sendDownNotification(CHECK_TYPES.GET, 'Error');

      expect(mockAxiosPost).not.toHaveBeenCalled();
    });

    test('should handle axios errors gracefully', async () => {
      mockAxiosPost.mockRejectedValue(new Error('Network error'));

      await expect(
        notifications.sendDownNotification(CHECK_TYPES.GET, 'Error')
      ).resolves.not.toThrow();
    });
  });

  describe('sendUpNotification', () => {
    test('should send up notification with correct payload', async () => {
      const downSince = Date.now() - 5 * 60 * 1000; // 5 minutes ago
      await notifications.sendUpNotification(CHECK_TYPES.GET, downSince);

      expect(mockAxiosPost).toHaveBeenCalledWith(
        'https://test.mattermost.com/hooks/test123',
        expect.objectContaining({
          channel: 'skypro-crm-alerts',
          username: expect.stringContaining('API (GET)'),
          text: expect.stringContaining('восстановлен')
        })
      );
    });

    test('should include downtime duration in notification', async () => {
      const downSince = Date.now() - 3 * 60 * 1000; // 3 minutes ago
      await notifications.sendUpNotification(CHECK_TYPES.WEB, downSince);

      expect(mockAxiosPost).toHaveBeenCalledWith(
        'https://test.mattermost.com/hooks/test123',
        expect.objectContaining({
          text: expect.stringContaining('3 мин')
        })
      );
    });

    test('should format downtime in seconds if less than 1 minute', async () => {
      const downSince = Date.now() - 45 * 1000; // 45 seconds ago
      await notifications.sendUpNotification(CHECK_TYPES.POST, downSince);

      expect(mockAxiosPost).toHaveBeenCalledWith(
        'https://test.mattermost.com/hooks/test123',
        expect.objectContaining({
          text: expect.stringContaining('45 сек')
        })
      );
    });

    test('should not send notification if webhook URL is not configured', async () => {
      jest.resetModules();
      delete process.env.MATTERMOST_WEBHOOK_URL;
      const notificationsNoWebhook = require('../notifications');

      await notificationsNoWebhook.sendUpNotification(CHECK_TYPES.GET, Date.now());

      expect(mockAxiosPost).not.toHaveBeenCalled();
    });

    test('should handle axios errors gracefully', async () => {
      mockAxiosPost.mockRejectedValue(new Error('Network error'));

      await expect(
        notifications.sendUpNotification(CHECK_TYPES.GET, Date.now())
      ).resolves.not.toThrow();
    });
  });

  describe('sendSummaryNotification', () => {
    test('should send summary notification with stats', async () => {
      const stats = {
        [CHECK_TYPES.GET]: { uptime: 99.5, avgTime: 450 },
        [CHECK_TYPES.POST]: { uptime: 98.0, avgTime: 520 },
        [CHECK_TYPES.WEB]: { uptime: 100, avgTime: 300 }
      };

      await notifications.sendSummaryNotification(stats);

      expect(mockAxiosPost).toHaveBeenCalledWith(
        'https://test.mattermost.com/hooks/test123',
        expect.objectContaining({
          channel: 'skypro-crm-alerts',
          username: expect.stringContaining('Ежедневная сводка'),
          text: expect.stringContaining('Uptime')
        })
      );
    });

    test('should include all check types in summary', async () => {
      const stats = {
        [CHECK_TYPES.GET]: { uptime: 99.5, avgTime: 450 },
        [CHECK_TYPES.POST]: { uptime: 98.0, avgTime: 520 }
      };

      await notifications.sendSummaryNotification(stats);

      const call = mockAxiosPost.mock.calls[0][1];
      expect(call.text).toContain('API (GET)');
      expect(call.text).toContain('API (POST)');
    });

    test('should not send summary if webhook URL is not configured', async () => {
      jest.resetModules();
      delete process.env.MATTERMOST_WEBHOOK_URL;
      const notificationsNoWebhook = require('../notifications');

      await notificationsNoWebhook.sendSummaryNotification({});

      expect(mockAxiosPost).not.toHaveBeenCalled();
    });

    test('should handle axios errors gracefully', async () => {
      mockAxiosPost.mockRejectedValue(new Error('Network error'));

      await expect(
        notifications.sendSummaryNotification({})
      ).resolves.not.toThrow();
    });
  });

  describe('Check Type Labels', () => {
    test('should use correct label for each check type', async () => {
      await notifications.sendDownNotification(CHECK_TYPES.GET, 'Error');
      expect(mockAxiosPost.mock.calls[0][1].username).toContain('API (GET)');

      await notifications.sendDownNotification(CHECK_TYPES.POST, 'Error');
      expect(mockAxiosPost.mock.calls[1][1].username).toContain('API (POST)');

      await notifications.sendDownNotification(CHECK_TYPES.WEB, 'Error');
      expect(mockAxiosPost.mock.calls[2][1].username).toContain('Веб-интерфейс');

      await notifications.sendDownNotification(CHECK_TYPES.HOOK, 'Error');
      expect(mockAxiosPost.mock.calls[3][1].username).toContain('Вебхуки');

      await notifications.sendDownNotification(CHECK_TYPES.DP, 'Error');
      expect(mockAxiosPost.mock.calls[4][1].username).toContain('Digital Pipeline');
    });
  });
});

