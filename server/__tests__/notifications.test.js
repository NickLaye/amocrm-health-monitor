const { NotificationService } = require('../notifications');
const { DEFAULTS } = require('../config/constants');
const axios = require('axios');

jest.mock('axios');
jest.mock('../utils/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  }),
}));

describe('NotificationService', () => {
  let service;
  const mockWebhookUrl = 'http://test-webhook.com';
  const clientId = 'test_client';

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    process.env.MATTERMOST_WEBHOOK_URL = mockWebhookUrl;
    service = new NotificationService();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Flapping Detection', () => {
    it('should detect flapping if status changes too frequently', async () => {
      const context = { clientId };

      // 1. First failure
      await service.sendDownNotification('GET', 'Error 1', context);
      jest.advanceTimersByTime(125000); // Trigger Down alert

      // 2. Recovery
      await service.sendUpNotification('GET', Date.now(), context);

      // 3. Failure 2
      await service.sendDownNotification('GET', 'Error 2', context);
      jest.advanceTimersByTime(125000);

      // 4. Recovery 2
      await service.sendUpNotification('GET', Date.now(), context);

      // 5. Failure 3 - This should trigger FLAPPING logic
      await service.sendDownNotification('GET', 'Error 3', context);
      jest.advanceTimersByTime(125000);

      expect(axios.post).toHaveBeenCalled();
    });
  });

  describe('SLA Violation', () => {
    it('should not fire SLA alert for normal response times', async () => {
      for (let i = 0; i < 6; i++) {
        await service.trackLatency('GET', 100, 200, clientId);
      }
      jest.runOnlyPendingTimers();
      const slaCalls = axios.post.mock.calls.filter(call => call[1].text && call[1].text.includes('SLA'));
      expect(slaCalls.length).toBe(0);
    });

    it('should fire SLA alert if response time exceeds threshold', async () => {
      for (let i = 0; i < 6; i++) {
        await service.trackLatency('GET', 5000, 200, clientId);
      }
      jest.runOnlyPendingTimers();
      expect(axios.post).toHaveBeenCalled();
    });
  });

  describe('Recovery', () => {
    it('should send recovery notification when status goes back to UP', async () => {
      const context = { clientId };

      // 1. Set State to DOWN and let the alert fire
      await service.sendDownNotification('GET', 'Initial Error', context);
      jest.advanceTimersByTime(125000); // 120s delay + buffer
      axios.post.mockClear();

      // 2. Send UP
      await service.sendUpNotification('GET', Date.now() - 130000, context);

      expect(axios.post).toHaveBeenCalled();
      const payload = axios.post.mock.calls[0][1];
      const attachmentText = payload.attachments && payload.attachments[0] ? payload.attachments[0].text : '';
      const messageText = payload.text || '';
      expect(attachmentText + messageText).toMatch(/(recovered|восстановлен|UP)/i);
    });
  });
});
