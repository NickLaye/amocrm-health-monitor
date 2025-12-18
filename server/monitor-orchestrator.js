const { createLogger } = require('./utils/logger');
const clientRegistry = require('./config/client-registry');
const TokenManager = require('./token-manager');
const { AmoCRMMonitor } = require('./monitor/index');

class MonitorOrchestrator {
  constructor() {
    this.logger = createLogger('MonitorOrchestrator');
    this.monitors = new Map();
    this.listeners = new Set();
  }

  ensureMonitor(clientId) {
    const fallbackId = clientRegistry.getClientIds()[0] || undefined;
    const targetId = clientId || fallbackId;
    if (!targetId) {
      this.logger.warn('Нет доступных клиентов для инициализации монитора');
      return null;
    }

    if (this.monitors.has(targetId)) {
      return this.monitors.get(targetId);
    }

    const clientConfig = clientRegistry.getClient(targetId);
    if (!clientConfig) {
      this.logger.warn(`Конфигурация клиента ${targetId} не найдена`);
      return null;
    }

    const tokenManager = new TokenManager({
      clientId: clientConfig.id,
      domain: clientConfig.amo?.domain,
      clientIdValue: clientConfig.amo?.clientId,
      clientSecret: clientConfig.amo?.clientSecret,
      redirectUri: clientConfig.amo?.redirectUri,
      tokens: clientConfig.tokens
    });

    const monitor = new AmoCRMMonitor({
      ...clientConfig,
      tokenManager
    });

    monitor.addListener((checkType, data) => {
      this.listeners.forEach((listener) => {
        try {
          listener(checkType, data, { clientId: clientConfig.id });
        } catch (error) {
          this.logger.error('Listener execution failed', { error: error.message });
        }
      });
    });

    this.monitors.set(clientConfig.id, monitor);
    return monitor;
  }

  getMonitor(clientId) {
    return this.ensureMonitor(clientId);
  }

  getAllMonitors() {
    const ids = clientRegistry.getClientIds();
    if (!ids.length) {
      return [];
    }
    return ids
      .map((id) => this.ensureMonitor(id))
      .filter(Boolean);
  }

  start() {
    this.logger.info('Запускаю мониторинг для всех клиентов');
    this.getAllMonitors().forEach((monitor) => monitor.start());
  }

  stop() {
    this.monitors.forEach((monitor) => monitor.stop());
    this.monitors.clear();
  }

  addListener(listener) {
    if (typeof listener !== 'function') {
      return () => { };
    }
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getStatus(clientId) {
    const monitor = this.getMonitor(clientId);
    return monitor ? monitor.getStatus() : null;
  }

  getLastCheckTime(clientId) {
    const monitor = this.getMonitor(clientId);
    return monitor ? monitor.getLastCheckTime() : null;
  }

  isHealthy(clientId) {
    const monitors = clientId ? [this.getMonitor(clientId)].filter(Boolean) : this.getAllMonitors();
    if (monitors.length === 0) {
      return false;
    }
    return monitors.every((monitor) => monitor.isHealthy());
  }

  handleWebhookEvent(payload, clientId) {
    const monitor = this.getMonitor(clientId);
    if (!monitor) {
      this.logger.warn(`Webhook для неизвестного клиента: ${clientId || 'n/a'}`);
      return false;
    }
    return monitor.handleWebhookEvent(payload);
  }
}

module.exports = new MonitorOrchestrator();
