const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { createLogger } = require('./utils/logger');

const logger = createLogger('TokenManager');

class TokenManager {
  constructor() {
    this.tokensFile = path.join(__dirname, '../data/tokens.json');
    this.domain = process.env.AMOCRM_DOMAIN;
    this.clientId = process.env.AMOCRM_CLIENT_ID;
    this.clientSecret = process.env.AMOCRM_CLIENT_SECRET;
    this.redirectUri = process.env.AMOCRM_REDIRECT_URI;
    this.currentTokens = null;
    
    // Создаем директорию для токенов если её нет
    const dataDir = path.join(__dirname, '../data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
  }

  /**
   * Загрузка токенов из файла
   */
  loadTokens() {
    try {
      if (fs.existsSync(this.tokensFile)) {
        const data = fs.readFileSync(this.tokensFile, 'utf8');
        this.currentTokens = JSON.parse(data);
        return this.currentTokens;
      }
    } catch (error) {
      logger.error('Error loading tokens', error);
    }
    return null;
  }

  /**
   * Сохранение токенов в файл
   */
  saveTokens(tokens) {
    try {
      fs.writeFileSync(this.tokensFile, JSON.stringify(tokens, null, 2));
      this.currentTokens = tokens;
      logger.info('Tokens saved successfully');
    } catch (error) {
      logger.error('Error saving tokens', error);
      throw error;
    }
  }

  /**
   * Проверка истечения токена
   */
  isTokenExpired() {
    if (!this.currentTokens || !this.currentTokens.expires_at) {
      return true;
    }
    
    // Считаем токен истекшим если осталось меньше 5 минут
    const expiresAt = this.currentTokens.expires_at * 1000; // в миллисекунды
    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000;
    
    return (expiresAt - now) < fiveMinutes;
  }

  /**
   * Обновление access token используя refresh token
   */
  async refreshToken() {
    if (!this.currentTokens || !this.currentTokens.refresh_token) {
      throw new Error('No refresh token available');
    }

    logger.info('Refreshing access token...');

    try {
      const response = await axios.post(
        `https://${this.domain}/oauth2/access_token`,
        {
          client_id: this.clientId,
          client_secret: this.clientSecret,
          grant_type: 'refresh_token',
          refresh_token: this.currentTokens.refresh_token,
          redirect_uri: this.redirectUri
        },
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      const newTokens = response.data;
      
      // Добавляем время истечения
      newTokens.expires_at = Math.floor(Date.now() / 1000) + newTokens.expires_in;
      
      // Сохраняем новые токены
      this.saveTokens(newTokens);
      
      logger.info('Access token refreshed successfully');
      logger.info(`New token expires at: ${new Date(newTokens.expires_at * 1000).toISOString()}`);
      
      return newTokens.access_token;
    } catch (error) {
      logger.error('Error refreshing token', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Получение актуального access token
   */
  async getAccessToken() {
    // Загружаем токены из файла если еще не загружены
    if (!this.currentTokens) {
      this.loadTokens();
    }

    // Если токенов нет совсем
    if (!this.currentTokens) {
      throw new Error('No tokens available. Please initialize tokens first.');
    }

    // Если токен истек или скоро истечет - обновляем
    if (this.isTokenExpired()) {
      logger.info('Token expired or expiring soon, refreshing...');
      await this.refreshToken();
    }

    return this.currentTokens.access_token;
  }

  /**
   * Инициализация токенов из переменных окружения
   */
  initializeFromEnv() {
    const accessToken = process.env.AMOCRM_ACCESS_TOKEN;
    const refreshToken = process.env.AMOCRM_REFRESH_TOKEN;
    
    if (!accessToken || !refreshToken) {
      logger.warn('AMOCRM_ACCESS_TOKEN or AMOCRM_REFRESH_TOKEN not found in environment');
      return false;
    }

    const tokens = {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: Math.floor(Date.now() / 1000) + 86400, // 24 часа
      token_type: 'Bearer',
      expires_in: 86400
    };

    this.saveTokens(tokens);
    logger.info('Tokens initialized from environment variables');
    return true;
  }

  /**
   * Запуск автоматического обновления токена
   */
  startAutoRefresh() {
    // Проверяем токен каждый час
    setInterval(async () => {
      try {
        if (this.isTokenExpired()) {
          logger.info('Auto-refreshing token...');
          await this.refreshToken();
        }
      } catch (error) {
        logger.error('Error in auto-refresh', error);
      }
    }, 60 * 60 * 1000); // каждый час

    logger.info('Token auto-refresh started (checking every hour)');
  }
}

module.exports = new TokenManager();

