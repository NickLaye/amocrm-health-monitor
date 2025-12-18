const { DEFAULT_CLIENT_ID, CLIENT_ID_PATTERN, TEST_ENTITY } = require('./constants');
const { createLogger } = require('../utils/logger');

const DEFAULT_MM_CHANNEL = process.env.MATTERMOST_CHANNEL || 'skypro-crm-alerts';

/**
 * ClientRegistry — единая точка доступа к конфигурациям клиентов amoCRM.
 * Поддерживает два режима:
 * 1) Modern: AMOCRM_CLIENTS=clientA,clientB + CLIENT_clientA_* переменные
 * 2) Legacy: одиночный клиент через AMOCRM_CLIENT_ID/DOMAIN/etc.
 */
class ClientRegistry {
  constructor() {
    this.logger = createLogger('ClientRegistry');
    this.clients = [];
    this.clientMap = new Map();
    this.load();
  }

  /**
   * Перечитывает конфигурацию клиентов из переменных окружения.
   */
  load() {
    this.clients = [];
    this.clientMap = new Map();

    const list = this.parseClientList();
    if (list.length === 0) {
      const legacyClient = this.buildLegacyClientConfig();
      if (legacyClient) {
        this.registerClient(legacyClient);
      }
      this.logSummary();
      return;
    }

    list.forEach((clientId) => {
      const config = this.buildEnvClientConfig(clientId);
      if (config) {
        this.registerClient(config);
      }
    });

    if (this.clients.length === 0) {
      // Если ни одного валидного клиента не зарегистрировано — падаем в legacy.
      const fallbackClient = this.buildLegacyClientConfig();
      if (fallbackClient) {
        this.registerClient(fallbackClient);
      }
    }

    this.logSummary();
  }

  /**
   * Возвращает все зарегистрированные конфигурации клиентов.
   */
  getClients() {
    return [...this.clients];
  }

  /**
   * Возвращает список clientId.
   */
  getClientIds() {
    return this.clients.map((client) => client.id);
  }

  /**
   * Проверяет, что клиент существует.
   * @param {string} clientId
   * @returns {boolean}
   */
  hasClient(clientId) {
    return this.clientMap.has(clientId);
  }

  /**
   * Возвращает true, если настроено больше одного клиента.
   */
  isMultiTenant() {
    return this.getClientIds().length > 1;
  }

  /**
   * Возвращает конфигурацию по clientId.
   * Если клиент не найден, возвращает конфиг по умолчанию.
   * @param {string} clientId
   * @returns {object|null}
   */
  getClient(clientId = DEFAULT_CLIENT_ID) {
    if (clientId && this.clientMap.has(clientId)) {
      return this.clientMap.get(clientId);
    }
    return this.clientMap.get(DEFAULT_CLIENT_ID) || this.clients[0] || null;
  }

  /**
   * Парсит AMOCRM_CLIENTS.
   * @returns {string[]}
   */
  parseClientList() {
    const rawList = process.env.AMOCRM_CLIENTS;
    if (!rawList) {
      return [];
    }

    return rawList
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
      .filter((value) => {
        if (!CLIENT_ID_PATTERN.test(value)) {
          this.logger.warn(`Пропускаю clientId "${value}" — не соответствует CLIENT_ID_PATTERN`);
          return false;
        }
        return true;
      });
  }

  /**
   * Регистрирует конфиг клиента во внутреннем сторе.
   * @param {object} config
   */
  registerClient(config) {
    if (!config || !config.id) {
      return;
    }
    this.clients.push(config);
    this.clientMap.set(config.id, config);
  }

  /**
   * Собирает конфиг для modern-режима (CLIENT_<slug>_*).
   * @param {string} clientId
   */
  buildEnvClientConfig(clientId) {
    const env = (suffix, { required = false, fallback = undefined } = {}) => {
      const variants = [
        `CLIENT_${clientId}_${suffix}`,
        `CLIENT_${clientId.toUpperCase()}_${suffix}`,
      ];
      for (const key of variants) {
        if (process.env[key]) {
          return process.env[key];
        }
      }
      if (required && fallback === undefined) {
        this.logger.warn(`CLIENT_${clientId}_${suffix} не задан, пропускаю клиента`);
        return null;
      }
      return fallback;
    };

    const domain = env('DOMAIN', { required: true });
    if (!domain) {
      return null;
    }

    const config = {
      id: clientId,
      label: env('LABEL', { fallback: clientId }),
      environment: env('ENV', { fallback: 'production' }),
      tags: (env('TAGS') || '')
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
      amo: {
        domain,
        clientId: env('CLIENT_ID', { fallback: process.env.AMOCRM_CLIENT_ID }),
        clientSecret: env('CLIENT_SECRET', { fallback: process.env.AMOCRM_CLIENT_SECRET }),
        redirectUri: env('REDIRECT_URI', { fallback: process.env.AMOCRM_REDIRECT_URI }),
      },
      tokens: {
        accessToken: env('ACCESS_TOKEN', { fallback: process.env.AMOCRM_ACCESS_TOKEN }),
        refreshToken: env('REFRESH_TOKEN', { fallback: process.env.AMOCRM_REFRESH_TOKEN }),
      },
      dp: {
        contactName: env('DP_CONTACT_NAME', { fallback: process.env.AMOCRM_DP_CONTACT_NAME }),
        contactFieldId: env('DP_CONTACT_FIELD_ID', { fallback: process.env.AMOCRM_DP_CONTACT_FIELD_ID }),
        contactResponsibleId: env('DP_CONTACT_RESPONSIBLE_ID', { fallback: process.env.AMOCRM_DP_CONTACT_RESPONSIBLE_ID }),
        checkIntervalMs: this.parseNumber(env('DP_CHECK_INTERVAL_MS'), null),
        requestTimeoutMs: this.parseNumber(env('DP_REQUEST_TIMEOUT_MS'), null),
        webhookTimeoutMs: this.parseNumber(env('DP_WEBHOOK_TIMEOUT_MS'), null),
        workerTimeoutMs: this.parseNumber(env('DP_WORKER_TIMEOUT_MS'), null)
      },
      contacts: {
        responsibleEmail: env('RESPONSIBLE_EMAIL', { fallback: process.env.RESPONSIBLE_EMAIL || null })
      },
      notifications: {
        mattermost: {
          webhookUrl: env('MATTERMOST_WEBHOOK_URL', { fallback: process.env.MATTERMOST_WEBHOOK_URL }),
          channel: env('MATTERMOST_CHANNEL', { fallback: process.env.MATTERMOST_CHANNEL || DEFAULT_MM_CHANNEL })
        },
        email: {
          recipients: this.parseList(env('EMAILS') || process.env.EMAIL_TO || '')
        }
      },
      metadata: {
        notes: env('NOTES', { fallback: '' })
      },
      testEntity: {
        dealId: this.parseNumber(
          env('TEST_DEAL_ID', { fallback: process.env.AMOCRM_TEST_DEAL_ID }),
          TEST_ENTITY.DEAL_ID
        ),
        fieldId: this.parseNumber(
          env('TEST_FIELD_ID', { fallback: process.env.AMOCRM_TEST_FIELD_ID }),
          TEST_ENTITY.FIELD_ID
        )
      }
    };

    return config;
  }

  /**
   * Собирает legacy-конфиг (single tenant).
   */
  buildLegacyClientConfig() {
    if (!process.env.AMOCRM_DOMAIN) {
      this.logger.warn('AMOCRM_DOMAIN не задан — невозможно построить legacy конфиг.');
      return null;
    }

    return {
      id: DEFAULT_CLIENT_ID,
      label: process.env.AMOCRM_DOMAIN,
      environment: process.env.NODE_ENV || 'development',
      tags: [],
      amo: {
        domain: process.env.AMOCRM_DOMAIN,
        clientId: process.env.AMOCRM_CLIENT_ID,
        clientSecret: process.env.AMOCRM_CLIENT_SECRET,
        redirectUri: process.env.AMOCRM_REDIRECT_URI,
      },
      tokens: {
        accessToken: process.env.AMOCRM_ACCESS_TOKEN,
        refreshToken: process.env.AMOCRM_REFRESH_TOKEN,
      },
      dp: {
        contactName: process.env.AMOCRM_DP_CONTACT_NAME,
        contactFieldId: process.env.AMOCRM_DP_CONTACT_FIELD_ID,
        contactResponsibleId: process.env.AMOCRM_DP_CONTACT_RESPONSIBLE_ID,
        checkIntervalMs: this.parseNumber(process.env.DP_CHECK_INTERVAL_MS, null),
        requestTimeoutMs: this.parseNumber(process.env.DP_REQUEST_TIMEOUT_MS, null),
        webhookTimeoutMs: this.parseNumber(process.env.DP_WEBHOOK_TIMEOUT_MS, null),
        workerTimeoutMs: this.parseNumber(process.env.DP_WORKER_TIMEOUT_MS, null)
      },
      contacts: {
        responsibleEmail: process.env.RESPONSIBLE_EMAIL || null
      },
      notifications: {
        mattermost: {
          webhookUrl: process.env.MATTERMOST_WEBHOOK_URL,
          channel: process.env.MATTERMOST_CHANNEL || DEFAULT_MM_CHANNEL
        },
        email: {
          recipients: this.parseList(process.env.EMAIL_TO || '')
        }
      },
      metadata: {
        notes: ''
      },
      testEntity: {
        dealId: this.parseNumber(process.env.AMOCRM_TEST_DEAL_ID, TEST_ENTITY.DEAL_ID),
        fieldId: this.parseNumber(process.env.AMOCRM_TEST_FIELD_ID, TEST_ENTITY.FIELD_ID)
      }
    };
  }

  parseNumber(value, fallback) {
    if (value === undefined || value === null || value === '') {
      return fallback;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  parseList(raw) {
    return (raw || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  logSummary() {
    const ids = this.getClientIds();
    if (ids.length === 0) {
      this.logger.warn('ClientRegistry: ни одного клиента не настроено');
    } else {
      this.logger.info(`ClientRegistry: зарегистрировано клиентов — [${ids.join(', ')}]`);
    }
  }
}

module.exports = new ClientRegistry();

