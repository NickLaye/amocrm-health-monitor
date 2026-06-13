const axios = require('axios');
const { CHECK_TYPE_LABELS, STATUS, LATENCY_THRESHOLDS } = require('./config/constants');
const { createLogger } = require('./utils/logger');
const emailNotifier = require('./notifications/email-notifier');
const { getIntEnvOrDefault } = require('./config/env-validator');
const clientRegistry = require('./config/client-registry');
const metrics = require('./metrics');

const logger = createLogger('Notifications');
const MATTERMOST_CHANNEL = process.env.MATTERMOST_CHANNEL || 'skypro-crm-alerts';

class NotificationService {
  constructor() {
    // Discord/Mattermost webhook (existing)
    this.webhookUrl = process.env.MATTERMOST_WEBHOOK_URL;
    this.mentions = process.env.MATTERMOST_MENTIONS || '';
    this.alertState = {};
    this.flapThreshold = 3;
    this.flapWindowMs = 5 * 60 * 1000;
    this.shortDowntimeMs = getIntEnvOrDefault('ALERT_SHORT_DOWNTIME_MS', 120000);
    this.longDowntimeMs = getIntEnvOrDefault('ALERT_LONG_DOWNTIME_MS', 600000);
    this.longDowntimeReminderMs = getIntEnvOrDefault('ALERT_LONG_DOWNTIME_REMINDER_MS', 600000);
    this.slaWindowSize = getIntEnvOrDefault('SLA_WINDOW_SIZE', 5);
    this.slaCooldownMs = getIntEnvOrDefault('SLA_ALERT_COOLDOWN_MS', 900000);
    this.slaEnabledChecks = new Set(['GET', 'POST', 'DP']);

    this.warningState = new Map();
    this.warningAlertCooldownMs = getIntEnvOrDefault('WARNING_ALERT_COOLDOWN_MS', 5 * 60 * 1000);

    const enabledChannels = [];
    if (this.webhookUrl) {
      enabledChannels.push('mattermost');
    }
    if (emailNotifier.getDefaultRecipients().length > 0) {
      enabledChannels.push('email');
    }

    if (enabledChannels.length === 0) {
      logger.warn('No notification channels configured');
    } else {
      logger.info(`Notification service initialized with channels: ${enabledChannels.join(', ')}`);
    }
  }

  async sendDownNotification(checkType, errorMessage, context = {}) {
    const clientId = context.clientId || 'default';
    const evaluation = this._evaluateState(checkType, STATUS.DOWN, clientId);
    if (evaluation.action === 'skip') {
      logger.debug(`Skipping DOWN notification for ${checkType} (reason: ${evaluation.reason})`);
      return;
    }

    if (evaluation.action === 'flapping') {
      await this._sendFlappingNotification(checkType, clientId);
      return;
    }

    const state = this._ensureState(checkType, clientId);
    state.downSince = context.downSince || Date.now();
    state.pendingError = errorMessage;

    if (this.shortDowntimeMs <= 0) {
      await this._dispatchDownAlert(checkType, clientId);
    } else if (!state.pendingDownTimer) {
      const elapsed = Date.now() - state.downSince;
      const delay = Math.max(0, this.shortDowntimeMs - elapsed);
      state.pendingDownTimer = setTimeout(() => {
        this._dispatchDownAlert(checkType, clientId).catch(err => {
          logger.error('Failed to dispatch down alert', err);
        });
      }, delay);
      if (typeof state.pendingDownTimer.unref === 'function') {
        state.pendingDownTimer.unref();
      }
    }

    this._scheduleLongDowntime(checkType, clientId);
  }

  /**
   * Send notification when service comes back up
   * @param {string} checkType - Type of check that recovered
   * @param {number} downSince - Timestamp when service went down
   */
  async sendUpNotification(checkType, downSince, context = {}) {
    const clientId = context.clientId || 'default';
    const evaluation = this._evaluateState(checkType, STATUS.UP, clientId);
    if (evaluation.action === 'skip') {
      logger.debug(`Skipping UP notification for ${checkType} (reason: ${evaluation.reason})`);
      return;
    }

    if (evaluation.action === 'flapping') {
      await this._sendFlappingNotification(checkType, clientId);
      return;
    }

    const state = this._ensureState(checkType, clientId);
    const downtime = Date.now() - downSince;

    if (state.pendingDownTimer) {
      clearTimeout(state.pendingDownTimer);
      state.pendingDownTimer = null;
      this._clearLongDowntimeTimers(state);
      state.downSince = null;
      state.pendingError = null;
      logger.info(`Short downtime resolved for ${checkType} (${this._formatDowntime(downtime)}), notifications suppressed`);
      return;
    }

    this._clearLongDowntimeTimers(state);
    state.downSince = null;
    state.pendingError = null;

    const notificationConfig = this._resolveNotificationConfig(clientId);
    const deliveries = [];

    if (notificationConfig.mattermost.webhookUrl) {
      deliveries.push({
        channel: 'mattermost',
        promise: this._sendRichMattermostUp(checkType, downtime, clientId, { notificationConfig })
      });
    }

    if (notificationConfig.email.recipients.length > 0) {
      deliveries.push({
        channel: 'email',
        promise: emailNotifier.sendUpNotification(checkType, downtime, {
          recipients: notificationConfig.email.recipients,
          clientLabel: notificationConfig.label
        })
      });
    }

    const results = await Promise.allSettled(deliveries.map((entry) => entry.promise));
    this._logDeliveryResults('UP', checkType, clientId, deliveries, results);
  }

  async sendWarningNotification(checkType, context = {}) {
    const clientId = context.clientId || 'default';
    const state = this._ensureWarningState(checkType, clientId);
    const now = Date.now();

    if (state.active && (now - state.lastTriggered) < this.warningAlertCooldownMs) {
      return;
    }

    state.active = true;
    state.lastTriggered = now;

    const notificationConfig = this._resolveNotificationConfig(clientId);
    if (notificationConfig.mattermost.webhookUrl) {
      await this._sendRichMattermostWarning(checkType, {
        ...context,
        notificationConfig
      });
    }
  }

  async sendWarningResolved(checkType, context = {}) {
    const clientId = context.clientId || 'default';
    const state = this._ensureWarningState(checkType, clientId);
    if (!state.active) {
      return;
    }

    state.active = false;
    state.lastTriggered = Date.now();

    const notificationConfig = this._resolveNotificationConfig(clientId);
    if (notificationConfig.mattermost.webhookUrl) {
      await this._sendRichMattermostWarningResolved(checkType, {
        ...context,
        notificationConfig
      });
    }
  }

  dismissWarning(checkType, context = {}) {
    const clientId = context.clientId || 'default';
    const state = this._ensureWarningState(checkType, clientId);
    state.active = false;
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

    const mentionsText = this.mentions ? `\n${this.mentions}` : '';
    const message = {
      channel: "skypro-crm-alerts",
      username: `📊 Ежедневная сводка amoCRM - ${time}`,
      text: `${mentionsText}\n\n${statsText}`
    };

    try {
      await axios.post(this.webhookUrl, message);
      logger.info('Sent summary notification');
    } catch (error) {
      logger.error('Error sending summary notification', error);
    }
  }

  async sendExternalIncident(payload = {}) {
    const clientId = payload.clientId || 'default';
    const status = (payload.status || 'down').toLowerCase();
    const checkType = payload.checkType || 'CUSTOM';
    const notificationConfig = this._resolveNotificationConfig(clientId);
    const message = payload.message || payload.errorMessage || 'Внешний инцидент';

    if (status === 'down') {
      const deliveries = [];
      if (notificationConfig.mattermost.webhookUrl) {
        deliveries.push({
          channel: 'mattermost',
          promise: this._sendRichMattermostDown(checkType, message, clientId, {
            notificationConfig,
            titleOverride: payload.title || '🚨 Внешний инцидент',
            textOverride: payload.textOverride,
            extraFields: payload.fields
          })
        });
      }
      if (notificationConfig.email.recipients.length > 0) {
        deliveries.push({
          channel: 'email',
          promise: emailNotifier.sendDownNotification(checkType, message, {
            recipients: notificationConfig.email.recipients,
            clientLabel: notificationConfig.label,
            subject: payload.emailSubject
          })
        });
      }
      const results = await Promise.allSettled(deliveries.map((entry) => entry.promise));
      this._logDeliveryResults('EXTERNAL_DOWN', checkType, clientId, deliveries, results);
      return;
    }

    if (status === 'up') {
      const deliveries = [];
      if (notificationConfig.mattermost.webhookUrl) {
        deliveries.push({
          channel: 'mattermost',
          promise: this._sendRichMattermostUp(checkType, payload.downtimeMs || 0, clientId, {
            notificationConfig,
            titleOverride: payload.title || '✅ Инцидент закрыт',
            textOverride: payload.textOverride,
            extraFields: payload.fields
          })
        });
      }
      if (notificationConfig.email.recipients.length > 0) {
        deliveries.push({
          channel: 'email',
          promise: emailNotifier.sendUpNotification(checkType, payload.downtimeMs || 0, {
            recipients: notificationConfig.email.recipients,
            clientLabel: notificationConfig.label,
            subject: payload.emailSubject
          })
        });
      }
      const results = await Promise.allSettled(deliveries.map((entry) => entry.promise));
      this._logDeliveryResults('EXTERNAL_UP', checkType, clientId, deliveries, results);
      return;
    }

    const deliveries = [];
    if (notificationConfig.mattermost.webhookUrl) {
      deliveries.push({
        channel: 'mattermost',
        promise: this._sendRichMattermostWarning(checkType, {
          clientId,
          notificationConfig,
          reason: payload.reason || 'external_warning',
          responseTime: payload.responseTime,
          titleOverride: payload.title || '⚠️ Внешнее предупреждение',
          customMessage: payload.textOverride || message,
          extraFields: payload.fields
        })
      });
    }
    // Email уведомления для warning статуса не реализованы в emailNotifier
    // Можно добавить в будущем, если потребуется
    const results = await Promise.allSettled(deliveries.map((entry) => entry.promise));
    this._logDeliveryResults('EXTERNAL_WARNING', checkType, clientId, deliveries, results);
  }

  _logDeliveryResults(eventType, checkType, clientId, deliveries, results) {
    if (!Array.isArray(deliveries) || deliveries.length === 0) {
      logger.debug(`No channels configured for ${eventType} notification`, { checkType, clientId });
      return;
    }

    const failures = [];
    results.forEach((result, index) => {
      if (result.status !== 'rejected') return;
      const channel = deliveries[index]?.channel || 'unknown';
      const reason = result.reason || {};
      failures.push({
        channel,
        status: reason?.response?.status || null,
        message: reason?.response?.data?.message || reason?.message || 'Unknown delivery error'
      });
    });

    if (failures.length > 0) {
      logger.error(`Failed to deliver ${eventType} notification`, {
        checkType,
        clientId,
        failures
      });
      return;
    }

    logger.info(`Sent ${eventType} notification for ${checkType} to ${deliveries.length} channel(s)`, { clientId });
  }

  _getServiceLabel(checkType) {
    return CHECK_TYPE_LABELS[checkType] || checkType;
  }

  _formatTimestamp() {
    return new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
  }

  _mentionsText(additional = '') {
    const parts = [];
    if (this.mentions) {
      parts.push(this.mentions);
    }
    if (additional) {
      parts.push(additional);
    }
    return parts.length ? parts.join('\n') : undefined;
  }

  _stateKey(checkType, clientId = 'default') {
    return `${clientId || 'default'}::${checkType}`;
  }

  _warningStateKey(checkType, clientId = 'default') {
    return `${clientId || 'default'}::${checkType}`;
  }

  _ensureState(checkType, clientId = 'default') {
    const key = this._stateKey(checkType, clientId);
    if (!this.alertState[key]) {
      this.alertState[key] = {
        clientId,
        currentStatus: null,
        transitions: [],
        isFlapping: false,
        flappingUntil: 0,
        downSince: null,
        pendingDownTimer: null,
        pendingError: null,
        longDowntimeTimer: null,
        longReminderTimer: null,
        lastDownAlertAt: 0,
        lastSlaAlertAt: 0,
        slaSamples: []
      };
    }
    return this.alertState[key];
  }

  _ensureWarningState(checkType, clientId = 'default') {
    const key = this._warningStateKey(checkType, clientId);
    if (!this.warningState.has(key)) {
      this.warningState.set(key, {
        clientId,
        active: false,
        lastTriggered: 0
      });
    }
    return this.warningState.get(key);
  }

  _evaluateState(checkType, newStatus, clientId = 'default') {
    const now = Date.now();
    const state = this._ensureState(checkType, clientId);

    if (state.isFlapping && now >= state.flappingUntil) {
      state.isFlapping = false;
      state.transitions = [];
    }

    if (state.isFlapping) {
      return { action: 'skip', reason: 'flapping' };
    }

    if (state.currentStatus === newStatus) {
      return { action: 'skip', reason: 'no-change' };
    }

    state.currentStatus = newStatus;
    state.transitions = state.transitions.filter(ts => now - ts <= this.flapWindowMs);
    state.transitions.push(now);

    if (state.transitions.length > this.flapThreshold) {
      state.isFlapping = true;
      state.flappingUntil = now + this.flapWindowMs;
      return { action: 'flapping' };
    }

    return { action: 'send' };
  }

  _clearLongDowntimeTimers(state) {
    if (state.longDowntimeTimer) {
      clearTimeout(state.longDowntimeTimer);
      state.longDowntimeTimer = null;
    }
    if (state.longReminderTimer) {
      clearInterval(state.longReminderTimer);
      state.longReminderTimer = null;
    }
  }

  _scheduleLongDowntime(checkType, clientId = 'default') {
    if (this.longDowntimeMs <= 0) {
      return;
    }

    const state = this._ensureState(checkType, clientId);
    if (state.longDowntimeTimer) {
      return;
    }

    const now = Date.now();
    const downSince = state.downSince || now;
    const delay = Math.max(0, this.longDowntimeMs - (now - downSince));

    state.longDowntimeTimer = setTimeout(() => {
      this._sendLongDowntimeAlert(checkType, { clientId }).catch(err => logger.error('Failed to send long downtime alert', err));
      this._scheduleLongDowntimeReminder(checkType, clientId);
    }, delay);
    if (typeof state.longDowntimeTimer.unref === 'function') {
      state.longDowntimeTimer.unref();
    }
  }

  _scheduleLongDowntimeReminder(checkType, clientId = 'default') {
    if (this.longDowntimeReminderMs <= 0) {
      return;
    }
    const state = this._ensureState(checkType, clientId);
    if (state.longReminderTimer) {
      return;
    }
    state.longReminderTimer = setInterval(() => {
      this._sendLongDowntimeAlert(checkType, { reminder: true, clientId }).catch(err => logger.error('Failed to send long downtime reminder', err));
    }, this.longDowntimeReminderMs);
    if (typeof state.longReminderTimer.unref === 'function') {
      state.longReminderTimer.unref();
    }
  }

  async _dispatchDownAlert(checkType, clientId = 'default') {
    const state = this._ensureState(checkType, clientId);
    state.pendingDownTimer = null;
    const errorMessage = state.pendingError;
    state.pendingError = null;

    const notificationConfig = this._resolveNotificationConfig(clientId);
    const deliveries = [];

    if (notificationConfig.mattermost.webhookUrl) {
      deliveries.push({
        channel: 'mattermost',
        promise: this._sendRichMattermostDown(checkType, errorMessage, clientId, { notificationConfig })
      });
    }

    if (notificationConfig.email.recipients.length > 0) {
      deliveries.push({
        channel: 'email',
        promise: emailNotifier.sendDownNotification(checkType, errorMessage, {
          recipients: notificationConfig.email.recipients,
          clientLabel: notificationConfig.label
        })
      });
    }

    const results = await Promise.allSettled(deliveries.map((entry) => entry.promise));
    state.lastDownAlertAt = Date.now();
    this._logDeliveryResults('DOWN', checkType, clientId, deliveries, results);
  }

  async _sendLongDowntimeAlert(checkType, { reminder = false, clientId = 'default' } = {}) {
    const notificationConfig = this._resolveNotificationConfig(clientId);
    const webhookUrl = notificationConfig.mattermost.webhookUrl;
    if (!webhookUrl) {
      return;
    }
    const state = this._ensureState(checkType, clientId);
    const serviceLabel = this._getServiceLabel(checkType);
    const downSince = state.downSince || Date.now();
    const duration = this._formatDowntime(Date.now() - downSince);
    const time = this._formatTimestamp();
    const clientFields = clientId && clientId !== 'default'
      ? [{ short: true, title: 'Client', value: clientId }]
      : [];

    const clientTag = this._formatClientTag(clientId);

    const message = {
      channel: notificationConfig.mattermost.channel,
      username: reminder ? `⏰ ${clientTag}amoCRM ${serviceLabel}` : `⏰ ${clientTag}amoCRM ${serviceLabel}`,
      text: this._mentionsText(),
      attachments: [
        {
          color: '#FF8C00',
          title: reminder ? '⏰ Простой продолжается' : '⏰ Длительный простой',
          text: `amoCRM ${serviceLabel} недоступен ${duration}`,
          fields: [
            { short: true, title: 'Время (MSK)', value: time },
            { short: true, title: 'Длительность', value: duration },
            ...clientFields
          ]
        }
      ]
    };

    await axios.post(webhookUrl, message);
  }

  trackLatency(checkType, responseTime, status, clientId = 'default') {
    if (!this.slaEnabledChecks.has(checkType)) {
      return;
    }
    if (!responseTime || responseTime <= 0) {
      return;
    }
    const threshold = LATENCY_THRESHOLDS[checkType]?.warningMs;
    if (!threshold) {
      return;
    }

    const state = this._ensureState(checkType, clientId);
    state.slaSamples.push(responseTime);
    if (state.slaSamples.length > this.slaWindowSize) {
      state.slaSamples.shift();
    }

    const avg = state.slaSamples.reduce((sum, value) => sum + value, 0) / state.slaSamples.length;
    if (avg >= threshold) {
      const now = Date.now();
      if (!state.lastSlaAlertAt || now - state.lastSlaAlertAt >= this.slaCooldownMs) {
        this._sendSlaAlert(checkType, avg, threshold, clientId).catch(err => logger.error('Failed to send SLA alert', err));
        try {
          metrics.updateSlaViolation(checkType, clientId, true);
        } catch (metricError) {
          logger.debug('Failed to update SLA metric', { error: metricError.message });
        }
        state.lastSlaAlertAt = now;
      }
    } else if (state.lastSlaAlertAt) {
      try {
        metrics.updateSlaViolation(checkType, clientId, false);
      } catch (metricError) {
        logger.debug('Failed to reset SLA metric', { error: metricError.message });
      }
      state.lastSlaAlertAt = null;
    }
  }

  _formatClientTag(clientId) {
    if (!clientId || clientId === 'default') {
      return '';
    }
    const client = clientRegistry.getClient(clientId);
    const tag = client?.amo?.domain || client?.label || clientId;
    return `[${tag}] `;
  }

  _resolveNotificationConfig(clientId = 'default') {
    const client = clientRegistry.getClient(clientId) || null;
    const mattermostConfig = client?.notifications?.mattermost || {};
    const emailConfig = client?.notifications?.email || {};
    const defaultRecipients = emailNotifier.getDefaultRecipients();
    const recipients = Array.isArray(emailConfig.recipients) && emailConfig.recipients.length
      ? emailConfig.recipients.filter(Boolean)
      : defaultRecipients;

    return {
      mattermost: {
        webhookUrl: mattermostConfig.webhookUrl || this.webhookUrl,
        channel: mattermostConfig.channel || MATTERMOST_CHANNEL
      },
      email: {
        recipients
      },
      label: client?.label || clientId
    };
  }

  async _sendRichMattermostDown(checkType, errorMessage, clientId = 'default', options = {}) {
    const notificationConfig = options.notificationConfig || this._resolveNotificationConfig(clientId);
    const webhookUrl = options.webhookUrl || notificationConfig.mattermost.webhookUrl;
    if (!webhookUrl) return;

    const serviceLabel = this._getServiceLabel(checkType);
    const clientTag = this._formatClientTag(clientId);
    const time = this._formatTimestamp();
    const errorText = errorMessage || options.fallbackMessage || 'Service is not responding';

    const fields = [
      { short: true, title: 'Статус', value: options.status || 'DOWN' },
      { short: true, title: 'Время (MSK)', value: time },
      ...(clientId && clientId !== 'default'
        ? [{ short: true, title: 'Client', value: clientId }]
        : []),
      { short: false, title: 'Подробности', value: errorText }
    ];

    if (Array.isArray(options.extraFields)) {
      fields.push(...options.extraFields);
    }

    const message = {
      channel: options.channel || notificationConfig.mattermost.channel,
      username: options.username || `🔴 ${clientTag}amoCRM ${serviceLabel}`,
      text: this._mentionsText(),
      attachments: [
        {
          color: options.color || '#FF0000',
          title: options.titleOverride || '🚨 Incident Detected',
          text: options.textOverride || `amoCRM ${serviceLabel} не отвечает`,
          fields
        }
      ]
    };

    await axios.post(webhookUrl, message);
  }

  async _sendRichMattermostUp(checkType, downtime, clientId = 'default', options = {}) {
    const notificationConfig = options.notificationConfig || this._resolveNotificationConfig(clientId);
    const webhookUrl = options.webhookUrl || notificationConfig.mattermost.webhookUrl;
    if (!webhookUrl) return;

    const serviceLabel = this._getServiceLabel(checkType);
    const time = this._formatTimestamp();
    const downtimeStr = this._formatDowntime(downtime);
    const clientTag = this._formatClientTag(clientId);

    const message = {
      channel: options.channel || notificationConfig.mattermost.channel,
      username: options.username || `🟢 ${clientTag}amoCRM ${serviceLabel}`,
      text: this._mentionsText(),
      attachments: [
        {
          color: options.color || '#00FF00',
          title: options.titleOverride || '✅ Service Recovered',
          text: options.textOverride || `amoCRM ${serviceLabel} восстановлен`,
          fields: [
            { short: true, title: 'Статус', value: 'UP' },
            { short: true, title: 'Время (MSK)', value: time },
            ...(clientId && clientId !== 'default'
              ? [{ short: true, title: 'Client', value: clientId }]
              : []),
            { short: false, title: 'Время простоя', value: downtimeStr }
          ]
        }
      ]
    };

    await axios.post(webhookUrl, message);
  }

  async _sendRichMattermostWarning(checkType, context = {}) {
    const clientId = context.clientId || 'default';
    const notificationConfig = context.notificationConfig || this._resolveNotificationConfig(clientId);
    const webhookUrl = context.webhookUrl || notificationConfig.mattermost.webhookUrl;
    if (!webhookUrl) return;

    const serviceLabel = this._getServiceLabel(checkType);
    const time = this._formatTimestamp();
    const clientTag = this._formatClientTag(clientId);
    const fields = [
      { short: true, title: 'Время (MSK)', value: time }
    ];

    if (context.reason) {
      fields.push({ short: true, title: 'Причина', value: this._describeReason(context.reason) });
    }
    if (context.httpStatus) {
      fields.push({ short: true, title: 'HTTP', value: String(context.httpStatus) });
    }
    if (context.responseTime) {
      fields.push({ short: true, title: 'Latency', value: `${Math.round(context.responseTime)} мс` });
    }
    if (clientId && clientId !== 'default') {
      fields.push({ short: true, title: 'Client', value: clientId });
    }
    if (Array.isArray(context.extraFields)) {
      fields.push(...context.extraFields);
    }

    const message = {
      channel: context.channel || notificationConfig.mattermost.channel,
      username: context.username || `⚠️ ${clientTag}amoCRM ${serviceLabel}`,
      text: this._mentionsText(context.mentions),
      attachments: [
        {
          color: context.color || '#F59E0B',
          title: context.titleOverride || '⚠️ Деградация сервиса',
          text: context.customMessage || `amoCRM ${serviceLabel} работает с повышенной задержкой`,
          fields
        }
      ]
    };

    await axios.post(webhookUrl, message);
  }

  async _sendRichMattermostWarningResolved(checkType, context = {}) {
    const clientId = context.clientId || 'default';
    const notificationConfig = context.notificationConfig || this._resolveNotificationConfig(clientId);
    const webhookUrl = context.webhookUrl || notificationConfig.mattermost.webhookUrl;
    if (!webhookUrl) return;

    const serviceLabel = this._getServiceLabel(checkType);
    const time = this._formatTimestamp();
    const clientTag = this._formatClientTag(clientId);

    const message = {
      channel: context.channel || notificationConfig.mattermost.channel,
      username: context.username || `🟡 ${clientTag}amoCRM ${serviceLabel}`,
      text: this._mentionsText(context.mentions),
      attachments: [
        {
          color: context.color || '#34D399',
          title: context.titleOverride || '⚡️ Производительность восстановлена',
          text: context.textOverride || `amoCRM ${serviceLabel} вернулся в норму`,
          fields: [
            { short: true, title: 'Время (MSK)', value: time },
            ...(clientId && clientId !== 'default'
              ? [{ short: true, title: 'Client', value: clientId }]
              : []),
            ...(Array.isArray(context.extraFields) ? context.extraFields : [])
          ]
        }
      ]
    };

    await axios.post(webhookUrl, message);
  }

  async _sendSlaAlert(checkType, averageMs, thresholdMs, clientId = 'default') {
    const notificationConfig = this._resolveNotificationConfig(clientId);
    const webhookUrl = notificationConfig.mattermost.webhookUrl;
    if (!webhookUrl) return;

    const serviceLabel = this._getServiceLabel(checkType);
    const time = this._formatTimestamp();
    const clientTag = this._formatClientTag(clientId);

    const message = {
      channel: notificationConfig.mattermost.channel,
      username: `⚡️ ${clientTag}amoCRM ${serviceLabel}`,
      text: this._mentionsText(),
      attachments: [
        {
          color: '#FFD700',
          title: '⚡️ SLA предупреждение по времени ответа',
          text: `Среднее время ответа превышает порог`,
          fields: [
            { short: true, title: 'Среднее', value: `${Math.round(averageMs)} мс` },
            { short: true, title: 'Порог', value: `${thresholdMs} мс` },
            { short: true, title: 'Время (MSK)', value: time },
            ...(clientId && clientId !== 'default'
              ? [{ short: true, title: 'Client', value: clientId }]
              : [])
          ]
        }
      ]
    };

    await axios.post(webhookUrl, message);
  }

  async _sendFlappingNotification(checkType, clientId = 'default') {
    const notificationConfig = this._resolveNotificationConfig(clientId);
    const webhookUrl = notificationConfig.mattermost.webhookUrl;
    if (!webhookUrl) return;

    const serviceLabel = this._getServiceLabel(checkType);
    const time = this._formatTimestamp();
    const clientTag = this._formatClientTag(clientId);

    const message = {
      channel: notificationConfig.mattermost.channel,
      username: `⚠️ ${clientTag}amoCRM ${serviceLabel}`,
      text: this._mentionsText(),
      attachments: [
        {
          color: '#FFA500',
          title: '⚠️ Service is flapping / Unstable',
          text: `amoCRM ${serviceLabel} слишком часто меняет статус.\nУведомления временно приостановлены.`,
          fields: [
            { short: true, title: 'Порог', value: `> ${this.flapThreshold} переходов / ${Math.round(this.flapWindowMs / 60000)} мин` },
            { short: true, title: 'Время (MSK)', value: time },
            ...(clientId && clientId !== 'default'
              ? [{ short: true, title: 'Client', value: clientId }]
              : [])
          ]
        }
      ]
    };

    await axios.post(webhookUrl, message);
  }

  _formatDowntime(downtimeMs) {
    if (downtimeMs <= 0) {
      return 'менее 1 сек';
    }

    const minutes = Math.floor(downtimeMs / 60000);
    const seconds = Math.floor((downtimeMs % 60000) / 1000);

    if (minutes > 0) {
      return `${minutes} мин ${seconds} сек`;
    }

    return `${seconds} сек`;
  }

  _describeReason(reason) {
    const map = {
      http_4xx: 'HTTP 4xx',
      http_5xx: 'HTTP 5xx',
      latency_warning: 'Высокая задержка',
      latency_down: 'Критическая задержка',
      runtime_error: 'Ошибка проверки',
      auth_error: 'Ошибка аутентификации',
      recovery_warning: 'Частичное восстановление',
      ok: 'Норма'
    };
    return map[reason] || reason || 'Неизвестно';
  }
}

const service = new NotificationService();
service.NotificationService = NotificationService;
module.exports = service;
