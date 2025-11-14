const axios = require('axios');
const { CHECK_TYPE_LABELS } = require('./config/constants');
const { createLogger } = require('./utils/logger');

const logger = createLogger('Notifications');

class NotificationService {
  constructor() {
    this.webhookUrl = process.env.MATTERMOST_WEBHOOK_URL;
    this.lastNotification = {};
    
    if (!this.webhookUrl) {
      logger.warn('MATTERMOST_WEBHOOK_URL not set - notifications disabled');
    } else {
      logger.info('Notification service initialized');
    }
  }

  /**
   * Send notification when service goes down
   * @param {string} checkType - Type of check that failed
   * @param {string} errorMessage - Error message
   */
  async sendDownNotification(checkType, errorMessage) {
    if (!this.webhookUrl) {
      logger.debug('Webhook URL not configured, skipping notification');
      return;
    }
    
    // Debounce: don't send if we sent a notification for this type in the last 5 minutes
    const now = Date.now();
    const lastSent = this.lastNotification[`${checkType}_down`] || 0;
    
    if (now - lastSent < 5 * 60 * 1000) {
      logger.debug(`Skipping duplicate down notification for ${checkType}`);
      return;
    }

    const serviceLabel = CHECK_TYPE_LABELS[checkType] || checkType;
    const time = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
    const errorMsg = errorMessage ? ` (${errorMessage})` : '';
    
    const message = {
      channel: "skypro-crm-alerts",
      username: `🔴 amoCRM ${serviceLabel}`,
      text: `🔴 amoCRM ${serviceLabel} не отвечает${errorMsg} - ${time}\n@n.rakcheev @fotin.a`
    };

    try {
      await axios.post(this.webhookUrl, message);
      this.lastNotification[`${checkType}_down`] = now;
      logger.info(`Sent DOWN notification for ${checkType}`);
    } catch (error) {
      logger.error('Error sending down notification', error);
    }
  }

  /**
   * Send notification when service comes back up
   * @param {string} checkType - Type of check that recovered
   * @param {number} downSince - Timestamp when service went down
   */
  async sendUpNotification(checkType, downSince) {
    if (!this.webhookUrl) {
      logger.debug('Webhook URL not configured, skipping notification');
      return;
    }
    
    const now = Date.now();
    const downtime = now - downSince;
    const downtimeMinutes = Math.floor(downtime / 60000);
    const downtimeSeconds = Math.floor((downtime % 60000) / 1000);
    
    const serviceLabel = CHECK_TYPE_LABELS[checkType] || checkType;
    const time = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
    const downtimeStr = downtimeMinutes > 0 
      ? `${downtimeMinutes} мин ${downtimeSeconds} сек` 
      : `${downtimeSeconds} сек`;

    const message = {
      channel: "skypro-crm-alerts",
      username: `✅ amoCRM ${serviceLabel}`,
      text: `✅ amoCRM ${serviceLabel} восстановлен (простой: ${downtimeStr}) - ${time}\n@n.rakcheev @fotin.a`
    };

    try {
      await axios.post(this.webhookUrl, message);
      this.lastNotification[`${checkType}_up`] = now;
      logger.info(`Sent UP notification for ${checkType} (downtime: ${downtimeStr})`);
    } catch (error) {
      logger.error('Error sending up notification', error);
    }
  }

  /**
   * Send summary notification (optional - can be used for daily summaries)
   * @param {Object} stats - Statistics for all check types
   */
  async sendSummaryNotification(stats) {
    if (!this.webhookUrl) {
      logger.debug('Webhook URL not configured, skipping summary');
      return;
    }
    
    const time = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
    const statsText = Object.keys(stats)
      .map(checkType => {
        const label = CHECK_TYPE_LABELS[checkType] || checkType;
        const uptime = stats[checkType].uptime;
        const avgTime = stats[checkType].avgTime;
        return `${label}: Uptime ${uptime}%, Avg ${avgTime}ms`;
      })
      .join('\n');

    const message = {
      channel: "skypro-crm-alerts",
      username: `📊 Ежедневная сводка amoCRM - ${time}`,
      text: `\n@n.rakcheev @fotin.a\n\n${statsText}`
    };

    try {
      await axios.post(this.webhookUrl, message);
      logger.info('Sent summary notification');
    } catch (error) {
      logger.error('Error sending summary notification', error);
    }
  }
}

module.exports = new NotificationService();

