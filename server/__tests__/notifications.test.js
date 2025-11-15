/**
 * Unit tests for Notifications Service
 */

const axios = require('axios');
const { CHECK_TYPES } = require('../config/constants');

// Mock axios
jest.mock('axios');

// Mock logger
jest.mock('../utils/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  })
}));

describe('NotificationService', () => {
  let notifications;
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset modules
    jest.resetModules();
    jest.clearAllMocks();
    
    // Setup environment variables
    process.env = {
      ...originalEnv,
      MATTERMOST_WEBHOOK_URL: 'https://test.mattermost.com/hooks/test123',
      MATTERMOST_MENTIONS: '@user1 @user2'
    };
    
    // Require notifications after env is set
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
      axios.post.mockResolvedValue({ status: 200 });

      await notifications.sendDownNotification(CHECK_TYPES.GET, 'Connection timeout');

      expect(axios.post).toHaveBeenCalledWith(
        'https://test.mattermost.com/hooks/test123',
        expect.objectContaining({
          channel: 'skypro-crm-alerts',
          username: expect.stringContaining('API (GET)'),
          text: expect.stringContaining('не отвечает')
        })
      );
    });

    test('should include error message in notification', async () => {
      axios.post.mockResolvedValue({ status: 200 });

      await notifications.sendDownNotification(CHECK_TYPES.WEB, 'Server error 500');

      expect(axios.post).toHaveBeenCalledWith(
        'https://test.mattermost.com/hooks/test123',
        expect.objectContaining({
          text: expect.stringContaining('Server error 500')
        })
      );
    });

    test('should include mentions in notification', async () => {
      axios.post.mockResolvedValue({ status: 200 });

      await notifications.sendDownNotification(CHECK_TYPES.POST, 'API error');

      expect(axios.post).toHaveBeenCalledWith(
        'https://test.mattermost.com/hooks/test123',
        expect.objectContaining({
          text: expect.stringContaining('@user1 @user2')
        })
      );
    });

    test('should debounce duplicate notifications within 5 minutes', async () => {
      axios.post.mockResolvedValue({ status: 200 });

      // First notification
      await notifications.sendDownNotification(CHECK_TYPES.GET, 'Error 1');
      expect(axios.post).toHaveBeenCalledTimes(1);

      // Second notification within 5 minutes should be skipped
      await notifications.sendDownNotification(CHECK_TYPES.GET, 'Error 2');
      expect(axios.post).toHaveBeenCalledTimes(1);
    });

    test('should not send notification if webhook URL is not configured', async () => {
      jest.resetModules();
      delete process.env.MATTERMOST_WEBHOOK_URL;
      const notificationsNoWebhook = require('../notifications');

      await notificationsNoWebhook.sendDownNotification(CHECK_TYPES.GET, 'Error');

      expect(axios.post).not.toHaveBeenCalled();
    });

    test('should handle axios errors gracefully', async () => {
      axios.post.mockRejectedValue(new Error('Network error'));

      await expect(
        notifications.sendDownNotification(CHECK_TYPES.GET, 'Error')
      ).resolves.not.toThrow();
    });
  });

  describe('sendUpNotification', () => {
    test('should send up notification with correct payload', async () => {
      axios.post.mockResolvedValue({ status: 200 });

      const downSince = Date.now() - 5 * 60 * 1000; // 5 minutes ago
      await notifications.sendUpNotification(CHECK_TYPES.GET, downSince);

      expect(axios.post).toHaveBeenCalledWith(
        'https://test.mattermost.com/hooks/test123',
        expect.objectContaining({
          channel: 'skypro-crm-alerts',
          username: expect.stringContaining('API (GET)'),
          text: expect.stringContaining('восстановлен')
        })
      );
    });

    test('should include downtime duration in notification', async () => {
      axios.post.mockResolvedValue({ status: 200 });

      const downSince = Date.now() - 3 * 60 * 1000; // 3 minutes ago
      await notifications.sendUpNotification(CHECK_TYPES.WEB, downSince);

      expect(axios.post).toHaveBeenCalledWith(
        'https://test.mattermost.com/hooks/test123',
        expect.objectContaining({
          text: expect.stringContaining('3 мин')
        })
      );
    });

    test('should format downtime in seconds if less than 1 minute', async () => {
      axios.post.mockResolvedValue({ status: 200 });

      const downSince = Date.now() - 45 * 1000; // 45 seconds ago
      await notifications.sendUpNotification(CHECK_TYPES.POST, downSince);

      expect(axios.post).toHaveBeenCalledWith(
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

      expect(axios.post).not.toHaveBeenCalled();
    });

    test('should handle axios errors gracefully', async () => {
      axios.post.mockRejectedValue(new Error('Network error'));

      await expect(
        notifications.sendUpNotification(CHECK_TYPES.GET, Date.now())
      ).resolves.not.toThrow();
    });
  });

  describe('sendSummaryNotification', () => {
    test('should send summary notification with stats', async () => {
      axios.post.mockResolvedValue({ status: 200 });

      const stats = {
        [CHECK_TYPES.GET]: { uptime: 99.5, avgTime: 450 },
        [CHECK_TYPES.POST]: { uptime: 98.0, avgTime: 520 },
        [CHECK_TYPES.WEB]: { uptime: 100, avgTime: 300 }
      };

      await notifications.sendSummaryNotification(stats);

      expect(axios.post).toHaveBeenCalledWith(
        'https://test.mattermost.com/hooks/test123',
        expect.objectContaining({
          channel: 'skypro-crm-alerts',
          username: expect.stringContaining('Ежедневная сводка'),
          text: expect.stringContaining('Uptime')
        })
      );
    });

    test('should include all check types in summary', async () => {
      axios.post.mockResolvedValue({ status: 200 });

      const stats = {
        [CHECK_TYPES.GET]: { uptime: 99.5, avgTime: 450 },
        [CHECK_TYPES.POST]: { uptime: 98.0, avgTime: 520 }
      };

      await notifications.sendSummaryNotification(stats);

      const call = axios.post.mock.calls[0][1];
      expect(call.text).toContain('API (GET)');
      expect(call.text).toContain('API (POST)');
    });

    test('should not send summary if webhook URL is not configured', async () => {
      jest.resetModules();
      delete process.env.MATTERMOST_WEBHOOK_URL;
      const notificationsNoWebhook = require('../notifications');

      await notificationsNoWebhook.sendSummaryNotification({});

      expect(axios.post).not.toHaveBeenCalled();
    });

    test('should handle axios errors gracefully', async () => {
      axios.post.mockRejectedValue(new Error('Network error'));

      await expect(
        notifications.sendSummaryNotification({})
      ).resolves.not.toThrow();
    });
  });

  describe('Check Type Labels', () => {
    test('should use correct label for each check type', async () => {
      axios.post.mockResolvedValue({ status: 200 });

      await notifications.sendDownNotification(CHECK_TYPES.GET, 'Error');
      expect(axios.post.mock.calls[0][1].username).toContain('API (GET)');

      await notifications.sendDownNotification(CHECK_TYPES.POST, 'Error');
      expect(axios.post.mock.calls[1][1].username).toContain('API (POST)');

      await notifications.sendDownNotification(CHECK_TYPES.WEB, 'Error');
      expect(axios.post.mock.calls[2][1].username).toContain('Веб-интерфейс');

      await notifications.sendDownNotification(CHECK_TYPES.HOOK, 'Error');
      expect(axios.post.mock.calls[3][1].username).toContain('Вебхуки');

      await notifications.sendDownNotification(CHECK_TYPES.DP, 'Error');
      expect(axios.post.mock.calls[4][1].username).toContain('Digital Pipeline');
    });
  });
});

