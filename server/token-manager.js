const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { createLogger } = require('./utils/logger');

class TokenManager {
  constructor(options = {}) {
    this.clientId = options.clientId || 'default';
    this.logger = createLogger(`TokenManager:${this.clientId}`);

    this.domain = options.domain || process.env.AMOCRM_DOMAIN;
    this.clientIdValue = options.clientIdValue || process.env.AMOCRM_CLIENT_ID;
    this.clientSecret = options.clientSecret || process.env.AMOCRM_CLIENT_SECRET;
    this.redirectUri = options.redirectUri || process.env.AMOCRM_REDIRECT_URI;
    this.initialTokens = options.tokens || {
      access_token: process.env.AMOCRM_ACCESS_TOKEN,
      refresh_token: process.env.AMOCRM_REFRESH_TOKEN,
    };

    const dataDir = path.join(__dirname, '../data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    this.tokensFile = options.tokensFile || path.join(dataDir, `${this.clientId}.tokens.json`);
    this.currentTokens = null;
  }

  loadTokens() {
    try {
      if (fs.existsSync(this.tokensFile)) {
        const data = fs.readFileSync(this.tokensFile, 'utf8');
        this.currentTokens = JSON.parse(data);
        return this.currentTokens;
      }
    } catch (error) {
      this.logger.error('Error loading tokens', error);
    }
    return null;
  }

  saveTokens(tokens) {
    try {
      fs.writeFileSync(this.tokensFile, JSON.stringify(tokens, null, 2));
      this.currentTokens = tokens;
      this.logger.info('Tokens saved successfully');
    } catch (error) {
      this.logger.error('Error saving tokens', error);
      throw error;
    }
  }

  isTokenExpired() {
    if (!this.currentTokens || !this.currentTokens.expires_at) {
      return true;
    }

    const expiresAt = this.currentTokens.expires_at * 1000;
    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000;

    return expiresAt - now < fiveMinutes;
  }

  async refreshToken() {
    if (!this.currentTokens || !this.currentTokens.refresh_token) {
      throw new Error('No refresh token available');
    }

    this.logger.info('Refreshing access token...');

    try {
      const response = await axios.post(
        `https://${this.domain}/oauth2/access_token`,
        {
          client_id: this.clientIdValue,
          client_secret: this.clientSecret,
          grant_type: 'refresh_token',
          refresh_token: this.currentTokens.refresh_token,
          redirect_uri: this.redirectUri,
        },
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      const newTokens = response.data;
      newTokens.expires_at = Math.floor(Date.now() / 1000) + newTokens.expires_in;
      this.saveTokens(newTokens);

      this.logger.info('Access token refreshed successfully');
      this.logger.info(`New token expires at: ${new Date(newTokens.expires_at * 1000).toISOString()}`);

      return newTokens.access_token;
    } catch (error) {
      this.logger.error('Error refreshing token', error.response?.data || error.message);
      throw error;
    }
  }

  async getAccessToken() {
    if (!this.currentTokens) {
      this.loadTokens();
    }

    if (!this.currentTokens && this.initialTokens?.refresh_token) {
      this.initializeFromEnv();
    }

    if (!this.currentTokens) {
      throw new Error('No tokens available. Please initialize tokens first.');
    }

    if (this.isTokenExpired()) {
      this.logger.info('Token expired or expiring soon, refreshing...');
      await this.refreshToken();
    }

    return this.currentTokens.access_token;
  }

  initializeFromEnv() {
    const accessToken = this.initialTokens?.access_token;
    const refreshToken = this.initialTokens?.refresh_token;

    if (!accessToken || !refreshToken) {
      this.logger.warn('Initial tokens not provided');
      return false;
    }

    const tokens = {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: Math.floor(Date.now() / 1000) + 3600, // Default to 1 hour
      token_type: 'Bearer',
      expires_in: 3600,
    };

    this.saveTokens(tokens);
    this.logger.info('Tokens initialized from provided configuration (forcing initial refresh)');
    return true;
  }

  startAutoRefresh() {
    setInterval(async () => {
      try {
        if (this.isTokenExpired()) {
          this.logger.info('Auto-refreshing token...');
          await this.refreshToken();
        }
      } catch (error) {
        this.logger.error('Error in auto-refresh', error);
      }
    }, 60 * 60 * 1000);

    this.logger.info('Token auto-refresh started (checking every hour)');
  }
}

module.exports = TokenManager;
