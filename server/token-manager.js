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
      const params = new URLSearchParams();
      params.append('client_id', this.clientIdValue);
      params.append('client_secret', this.clientSecret);
      params.append('grant_type', 'refresh_token');
      params.append('refresh_token', this.currentTokens.refresh_token);
      params.append('redirect_uri', this.redirectUri);

      const response = await axios.post(
        `https://${this.domain}/oauth2/access_token`,
        params.toString(),
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
      const initialized = await this.initializeFromEnv();
      if (!initialized) {
        this.logger.warn('Failed to initialize tokens from environment');
      }
    }

    if (!this.currentTokens) {
      const error = new Error('No tokens available. Please initialize tokens first.');
      error.code = 'NO_TOKENS';
      throw error;
    }

    if (this.isTokenExpired()) {
      this.logger.info('Token expired or expiring soon, refreshing...');
      try {
        await this.refreshToken();
      } catch (error) {
        this.logger.error('Failed to refresh expired token', error);
        // If refresh fails, try to reinitialize from env if available
        if (this.initialTokens?.refresh_token) {
          this.logger.info('Attempting to reinitialize tokens from environment...');
          try {
            const reinitialized = await this.initializeFromEnv();
            if (reinitialized && this.isTokenExpired()) {
              // If still expired after reinit, try one more refresh
              await this.refreshToken();
            }
          } catch (reinitError) {
            this.logger.error('Failed to reinitialize tokens', reinitError);
            const authError = new Error(`Token refresh failed: ${error.message || 'Unauthorized'}`);
            authError.code = 'TOKEN_REFRESH_FAILED';
            authError.originalError = error;
            throw authError;
          }
        } else {
          const authError = new Error(`Token refresh failed: ${error.message || 'Unauthorized'}`);
          authError.code = 'TOKEN_REFRESH_FAILED';
          authError.originalError = error;
          throw authError;
        }
      }
    }

    return this.currentTokens.access_token;
  }

  async initializeFromEnv() {
    const accessToken = this.initialTokens?.access_token;
    const refreshToken = this.initialTokens?.refresh_token;

    if (!refreshToken) {
      this.logger.warn('Refresh token not provided in environment');
      return false;
    }

    // If we have both tokens, use them directly
    if (accessToken && refreshToken) {
      const tokens = {
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_at: Math.floor(Date.now() / 1000) + 3600, // Default to 1 hour
        token_type: 'Bearer',
        expires_in: 3600,
      };

      this.saveTokens(tokens);
      this.logger.info('Tokens initialized from environment variables');
      return true;
    }

    // If we only have refresh_token, use it to get a new access_token
    if (refreshToken && !accessToken) {
      this.logger.info('Only refresh token provided, obtaining new access token...');
      
      // Check if we have all required parameters for token refresh
      if (!this.domain || !this.clientIdValue || !this.clientSecret) {
        this.logger.error('Missing required parameters for token refresh', {
          hasDomain: !!this.domain,
          hasClientId: !!this.clientIdValue,
          hasClientSecret: !!this.clientSecret
        });
        return false;
      }
      
      try {
        // Temporarily set currentTokens with refresh_token to allow refreshToken() to work
        this.currentTokens = {
          refresh_token: refreshToken,
          expires_at: 0 // Force refresh
        };
        await this.refreshToken();
        this.logger.info('Successfully obtained new access token from refresh token');
        return true;
      } catch (error) {
        this.logger.error('Failed to obtain access token from refresh token', {
          error: error.message,
          response: error.response?.data,
          status: error.response?.status
        });
        this.currentTokens = null;
        return false;
      }
    }

    return false;
  }

  startAutoRefresh() {
    // Check every 30 minutes instead of hourly for more proactive refresh
    const checkInterval = 30 * 60 * 1000;
    
    setInterval(async () => {
      try {
        if (this.isTokenExpired()) {
          this.logger.info('Auto-refreshing token...');
          await this.refreshToken();
        } else {
          // Log token status for debugging
          const expiresAt = this.currentTokens?.expires_at;
          if (expiresAt) {
            const timeUntilExpiry = expiresAt * 1000 - Date.now();
            const minutesUntilExpiry = Math.floor(timeUntilExpiry / 60000);
            this.logger.debug(`Token still valid, expires in ${minutesUntilExpiry} minutes`);
          }
        }
      } catch (error) {
        this.logger.error('Error in auto-refresh', error);
        // Try to reinitialize if refresh fails
        if (this.initialTokens?.refresh_token) {
          try {
            this.logger.info('Attempting to reinitialize tokens after auto-refresh failure...');
            await this.initializeFromEnv();
          } catch (initError) {
            this.logger.error('Failed to reinitialize tokens after auto-refresh failure', initError);
          }
        }
      }
    }, checkInterval);

    this.logger.info(`Token auto-refresh started (checking every ${checkInterval / 60000} minutes)`);
  }
}

module.exports = TokenManager;
