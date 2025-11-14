/**
 * Unit tests for Token Manager
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Mock axios
jest.mock('axios');

// Mock fs
jest.mock('fs');

describe('TokenManager', () => {
  let tokenManager;
  const mockTokensFile = path.join(__dirname, '../data/tokens.json');
  const mockTokens = {
    access_token: 'test_access_token',
    refresh_token: 'test_refresh_token',
    expires_at: Math.floor(Date.now() / 1000) + 3600, // +1 hour
    token_type: 'Bearer',
    expires_in: 3600
  };

  beforeEach(() => {
    // Clear module cache
    jest.resetModules();
    jest.clearAllMocks();
    
    // Reset process.env
    process.env.AMOCRM_DOMAIN = 'test.amocrm.ru';
    process.env.AMOCRM_CLIENT_ID = 'test_client_id';
    process.env.AMOCRM_CLIENT_SECRET = 'test_client_secret';
    process.env.AMOCRM_REDIRECT_URI = 'https://test.com/callback';
    process.env.AMOCRM_ACCESS_TOKEN = 'env_access_token';
    process.env.AMOCRM_REFRESH_TOKEN = 'env_refresh_token';
    
    // Mock fs.existsSync to return false by default
    fs.existsSync.mockReturnValue(false);
    fs.mkdirSync.mockImplementation(() => {});
  });

  describe('loadTokens', () => {
    test('should return null if tokens file does not exist', () => {
      fs.existsSync.mockReturnValue(false);
      
      tokenManager = require('../token-manager');
      const tokens = tokenManager.loadTokens();
      
      expect(tokens).toBeNull();
    });

    test('should load tokens from file if it exists', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify(mockTokens));
      
      tokenManager = require('../token-manager');
      const tokens = tokenManager.loadTokens();
      
      expect(tokens).toEqual(mockTokens);
      expect(fs.readFileSync).toHaveBeenCalledWith(
        expect.stringContaining('tokens.json'),
        'utf8'
      );
    });

    test('should return null on file read error', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockImplementation(() => {
        throw new Error('File read error');
      });
      
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      tokenManager = require('../token-manager');
      const tokens = tokenManager.loadTokens();
      
      expect(tokens).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });

  describe('saveTokens', () => {
    test('should save tokens to file', () => {
      fs.writeFileSync.mockImplementation(() => {});
      
      tokenManager = require('../token-manager');
      tokenManager.saveTokens(mockTokens);
      
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('tokens.json'),
        JSON.stringify(mockTokens, null, 2)
      );
      expect(tokenManager.currentTokens).toEqual(mockTokens);
    });

    test('should throw error if file write fails', () => {
      fs.writeFileSync.mockImplementation(() => {
        throw new Error('Write error');
      });
      
      tokenManager = require('../token-manager');
      
      expect(() => {
        tokenManager.saveTokens(mockTokens);
      }).toThrow('Write error');
    });
  });

  describe('isTokenExpired', () => {
    test('should return true if no tokens', () => {
      tokenManager = require('../token-manager');
      tokenManager.currentTokens = null;
      
      expect(tokenManager.isTokenExpired()).toBe(true);
    });

    test('should return true if no expires_at', () => {
      tokenManager = require('../token-manager');
      tokenManager.currentTokens = { access_token: 'test' };
      
      expect(tokenManager.isTokenExpired()).toBe(true);
    });

    test('should return true if token expired', () => {
      tokenManager = require('../token-manager');
      tokenManager.currentTokens = {
        ...mockTokens,
        expires_at: Math.floor(Date.now() / 1000) - 3600 // -1 hour
      };
      
      expect(tokenManager.isTokenExpired()).toBe(true);
    });

    test('should return true if token expires in less than 5 minutes', () => {
      tokenManager = require('../token-manager');
      tokenManager.currentTokens = {
        ...mockTokens,
        expires_at: Math.floor(Date.now() / 1000) + 60 // +1 minute
      };
      
      expect(tokenManager.isTokenExpired()).toBe(true);
    });

    test('should return false if token is valid', () => {
      tokenManager = require('../token-manager');
      tokenManager.currentTokens = {
        ...mockTokens,
        expires_at: Math.floor(Date.now() / 1000) + 3600 // +1 hour
      };
      
      expect(tokenManager.isTokenExpired()).toBe(false);
    });
  });

  describe('refreshToken', () => {
    test('should throw error if no refresh token', async () => {
      tokenManager = require('../token-manager');
      tokenManager.currentTokens = null;
      
      await expect(tokenManager.refreshToken()).rejects.toThrow('No refresh token available');
    });

    test('should refresh token successfully', async () => {
      const newTokens = {
        access_token: 'new_access_token',
        refresh_token: 'new_refresh_token',
        expires_in: 3600,
        token_type: 'Bearer'
      };
      
      axios.post.mockResolvedValue({ data: newTokens });
      fs.writeFileSync.mockImplementation(() => {});
      
      tokenManager = require('../token-manager');
      tokenManager.currentTokens = mockTokens;
      
      const result = await tokenManager.refreshToken();
      
      expect(result).toBe('new_access_token');
      expect(axios.post).toHaveBeenCalledWith(
        'https://test.amocrm.ru/oauth2/access_token',
        expect.objectContaining({
          client_id: 'test_client_id',
          client_secret: 'test_client_secret',
          grant_type: 'refresh_token',
          refresh_token: 'test_refresh_token'
        }),
        expect.any(Object)
      );
    });

    test('should handle refresh error', async () => {
      axios.post.mockRejectedValue(new Error('Refresh failed'));
      
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      tokenManager = require('../token-manager');
      tokenManager.currentTokens = mockTokens;
      
      await expect(tokenManager.refreshToken()).rejects.toThrow('Refresh failed');
      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });

  describe('initializeFromEnv', () => {
    test('should initialize tokens from environment variables', () => {
      fs.writeFileSync.mockImplementation(() => {});
      
      tokenManager = require('../token-manager');
      const result = tokenManager.initializeFromEnv();
      
      expect(result).toBe(true);
      expect(fs.writeFileSync).toHaveBeenCalled();
      expect(tokenManager.currentTokens).toMatchObject({
        access_token: 'env_access_token',
        refresh_token: 'env_refresh_token'
      });
    });

    test('should return false if env vars are missing', () => {
      delete process.env.AMOCRM_ACCESS_TOKEN;
      delete process.env.AMOCRM_REFRESH_TOKEN;
      
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      tokenManager = require('../token-manager');
      const result = tokenManager.initializeFromEnv();
      
      expect(result).toBe(false);
      expect(consoleWarnSpy).toHaveBeenCalled();
      consoleWarnSpy.mockRestore();
    });
  });

  describe('getAccessToken', () => {
    test('should return current token if valid', async () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify(mockTokens));
      
      tokenManager = require('../token-manager');
      const token = await tokenManager.getAccessToken();
      
      expect(token).toBe('test_access_token');
    });

    test('should throw error if no tokens available', async () => {
      fs.existsSync.mockReturnValue(false);
      
      tokenManager = require('../token-manager');
      
      await expect(tokenManager.getAccessToken()).rejects.toThrow('No tokens available');
    });

    test('should refresh token if expired', async () => {
      const expiredTokens = {
        ...mockTokens,
        expires_at: Math.floor(Date.now() / 1000) - 3600 // -1 hour
      };
      
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify(expiredTokens));
      fs.writeFileSync.mockImplementation(() => {});
      
      const newTokens = {
        access_token: 'refreshed_access_token',
        refresh_token: 'refreshed_refresh_token',
        expires_in: 3600,
        token_type: 'Bearer'
      };
      
      axios.post.mockResolvedValue({ data: newTokens });
      
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
      tokenManager = require('../token-manager');
      const token = await tokenManager.getAccessToken();
      
      expect(token).toBe('refreshed_access_token');
      expect(axios.post).toHaveBeenCalled();
      consoleLogSpy.mockRestore();
    });
  });
});

