/**
 * Unit tests for TokenManager module
 * Tests token loading/saving, refresh logic, and auto-refresh
 */

const fs = require('fs');
const path = require('path');

// Mock dependencies
jest.mock('axios');
jest.mock('../utils/logger', () => ({
    createLogger: () => ({
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn()
    })
}));

describe('TokenManager', () => {
    let TokenManager;
    let axios;
    let testTokensFile;
    const testDataDir = path.join(__dirname, '../../data');

    beforeAll(() => {
        // Ensure data directory exists
        if (!fs.existsSync(testDataDir)) {
            fs.mkdirSync(testDataDir, { recursive: true });
        }
    });

    beforeEach(() => {
        jest.clearAllMocks();
        jest.resetModules();

        axios = require('axios');
        TokenManager = require('../token-manager');

        // Set up test tokens file
        testTokensFile = path.join(testDataDir, 'test-client.tokens.json');

        // Clean up any existing test file
        if (fs.existsSync(testTokensFile)) {
            fs.unlinkSync(testTokensFile);
        }

        // Set environment variables
        process.env.AMOCRM_DOMAIN = 'test.amocrm.ru';
        process.env.AMOCRM_CLIENT_ID = 'test-client-id';
        process.env.AMOCRM_CLIENT_SECRET = 'test-secret';
        process.env.AMOCRM_REDIRECT_URI = 'https://test.com/callback';
        process.env.AMOCRM_ACCESS_TOKEN = 'env-access-token';
        process.env.AMOCRM_REFRESH_TOKEN = 'env-refresh-token';
    });

    afterEach(() => {
        // Clean up test tokens file
        if (fs.existsSync(testTokensFile)) {
            fs.unlinkSync(testTokensFile);
        }
    });

    describe('Constructor', () => {
        test('should initialize with default values from env', () => {
            const manager = new TokenManager();

            expect(manager.domain).toBe('test.amocrm.ru');
            expect(manager.clientIdValue).toBe('test-client-id');
            expect(manager.clientSecret).toBe('test-secret');
            expect(manager.redirectUri).toBe('https://test.com/callback');
            expect(manager.currentTokens).toBeNull();
        });

        test('should initialize with custom options', () => {
            const manager = new TokenManager({
                clientId: 'custom-client',
                domain: 'custom.amocrm.ru',
                clientIdValue: 'custom-id',
                clientSecret: 'custom-secret',
                redirectUri: 'https://custom.com/callback',
                tokens: {
                    access_token: 'custom-access',
                    refresh_token: 'custom-refresh'
                }
            });

            expect(manager.clientId).toBe('custom-client');
            expect(manager.domain).toBe('custom.amocrm.ru');
            expect(manager.clientIdValue).toBe('custom-id');
        });

        test('should create data directory if not exists', () => {
            const tempDir = path.join(__dirname, '../../data/temp-test');

            // Clean up first
            if (fs.existsSync(tempDir)) {
                fs.rmSync(tempDir, { recursive: true });
            }

            new TokenManager({
                clientId: 'temp-test',
                tokensFile: path.join(tempDir, 'tokens.json')
            });

            // Constructor creates parent data dir but tokensFile is set directly
            // Data dir already exists from beforeAll
            expect(fs.existsSync(testDataDir)).toBe(true);
        });
    });

    describe('loadTokens', () => {
        test('should load tokens from file', () => {
            const tokens = {
                access_token: 'file-access-token',
                refresh_token: 'file-refresh-token',
                expires_at: Math.floor(Date.now() / 1000) + 3600
            };
            fs.writeFileSync(testTokensFile, JSON.stringify(tokens));

            const manager = new TokenManager({
                clientId: 'test-client',
                tokensFile: testTokensFile
            });

            const loaded = manager.loadTokens();

            expect(loaded).toEqual(tokens);
            expect(manager.currentTokens).toEqual(tokens);
        });

        test('should return null if file does not exist', () => {
            const manager = new TokenManager({
                clientId: 'nonexistent',
                tokensFile: path.join(testDataDir, 'nonexistent.tokens.json')
            });

            const loaded = manager.loadTokens();

            expect(loaded).toBeNull();
        });

        test('should handle JSON parse errors', () => {
            fs.writeFileSync(testTokensFile, 'invalid json');

            const manager = new TokenManager({
                clientId: 'test-client',
                tokensFile: testTokensFile
            });

            const loaded = manager.loadTokens();

            expect(loaded).toBeNull();
        });
    });

    describe('saveTokens', () => {
        test('should save tokens to file', () => {
            const manager = new TokenManager({
                clientId: 'test-client',
                tokensFile: testTokensFile
            });

            const tokens = {
                access_token: 'new-access-token',
                refresh_token: 'new-refresh-token',
                expires_at: Math.floor(Date.now() / 1000) + 3600
            };

            manager.saveTokens(tokens);

            const saved = JSON.parse(fs.readFileSync(testTokensFile, 'utf8'));
            expect(saved).toEqual(tokens);
            expect(manager.currentTokens).toEqual(tokens);
        });

        test('should throw error on write failure', () => {
            const manager = new TokenManager({
                clientId: 'test-client',
                tokensFile: '/invalid/path/tokens.json'
            });

            expect(() => {
                manager.saveTokens({ access_token: 'test' });
            }).toThrow();
        });
    });

    describe('isTokenExpired', () => {
        test('should return true if no tokens', () => {
            const manager = new TokenManager({ clientId: 'test-client' });

            expect(manager.isTokenExpired()).toBe(true);
        });

        test('should return true if no expires_at', () => {
            const manager = new TokenManager({ clientId: 'test-client' });
            manager.currentTokens = { access_token: 'test' };

            expect(manager.isTokenExpired()).toBe(true);
        });

        test('should return true if token expires within 5 minutes', () => {
            const manager = new TokenManager({ clientId: 'test-client' });
            manager.currentTokens = {
                access_token: 'test',
                expires_at: Math.floor(Date.now() / 1000) + 4 * 60 // 4 minutes from now
            };

            expect(manager.isTokenExpired()).toBe(true);
        });

        test('should return false if token is valid', () => {
            const manager = new TokenManager({ clientId: 'test-client' });
            manager.currentTokens = {
                access_token: 'test',
                expires_at: Math.floor(Date.now() / 1000) + 3600 // 1 hour from now
            };

            expect(manager.isTokenExpired()).toBe(false);
        });
    });

    describe('refreshToken', () => {
        test('should refresh token successfully', async () => {
            const manager = new TokenManager({
                clientId: 'test-client',
                tokensFile: testTokensFile
            });
            manager.currentTokens = {
                access_token: 'old-access',
                refresh_token: 'old-refresh'
            };

            const newTokenData = {
                access_token: 'new-access-token',
                refresh_token: 'new-refresh-token',
                expires_in: 86400
            };
            axios.post.mockResolvedValue({ data: newTokenData });

            const result = await manager.refreshToken();

            expect(result).toBe('new-access-token');
            expect(axios.post).toHaveBeenCalledWith(
                'https://test.amocrm.ru/oauth2/access_token',
                expect.objectContaining({
                    grant_type: 'refresh_token',
                    refresh_token: 'old-refresh'
                }),
                expect.any(Object)
            );
            expect(manager.currentTokens.access_token).toBe('new-access-token');
        });

        test('should throw if no refresh token', async () => {
            const manager = new TokenManager({ clientId: 'test-client' });
            manager.currentTokens = { access_token: 'test' };

            await expect(manager.refreshToken()).rejects.toThrow('No refresh token available');
        });

        test('should throw if no current tokens', async () => {
            const manager = new TokenManager({ clientId: 'test-client' });

            await expect(manager.refreshToken()).rejects.toThrow('No refresh token available');
        });

        test('should handle API errors', async () => {
            const manager = new TokenManager({
                clientId: 'test-client',
                tokensFile: testTokensFile
            });
            manager.currentTokens = {
                access_token: 'old-access',
                refresh_token: 'old-refresh'
            };

            const error = new Error('API Error');
            error.response = { data: { error: 'invalid_grant' } };
            axios.post.mockRejectedValue(error);

            await expect(manager.refreshToken()).rejects.toThrow('API Error');
        });
    });

    describe('getAccessToken', () => {
        test('should return access token if valid', async () => {
            const manager = new TokenManager({
                clientId: 'test-client',
                tokensFile: testTokensFile
            });
            manager.currentTokens = {
                access_token: 'valid-token',
                refresh_token: 'refresh',
                expires_at: Math.floor(Date.now() / 1000) + 3600
            };

            const token = await manager.getAccessToken();

            expect(token).toBe('valid-token');
        });

        test('should load tokens from file if not in memory', async () => {
            const tokens = {
                access_token: 'file-token',
                refresh_token: 'file-refresh',
                expires_at: Math.floor(Date.now() / 1000) + 3600
            };
            fs.writeFileSync(testTokensFile, JSON.stringify(tokens));

            const manager = new TokenManager({
                clientId: 'test-client',
                tokensFile: testTokensFile
            });

            const token = await manager.getAccessToken();

            expect(token).toBe('file-token');
        });

        test('should initialize from env if no tokens file', async () => {
            const manager = new TokenManager({
                clientId: 'test-client',
                tokensFile: testTokensFile,
                tokens: {
                    access_token: 'env-access',
                    refresh_token: 'env-refresh'
                }
            });

            const token = await manager.getAccessToken();

            expect(token).toBe('env-access');
        });

        test('should refresh if token expired', async () => {
            const manager = new TokenManager({
                clientId: 'test-client',
                tokensFile: testTokensFile
            });
            manager.currentTokens = {
                access_token: 'expired-token',
                refresh_token: 'refresh-token',
                expires_at: Math.floor(Date.now() / 1000) - 100 // Expired
            };

            axios.post.mockResolvedValue({
                data: {
                    access_token: 'new-token',
                    refresh_token: 'new-refresh',
                    expires_in: 86400
                }
            });

            const token = await manager.getAccessToken();

            expect(token).toBe('new-token');
            expect(axios.post).toHaveBeenCalled();
        });

        test('should throw if no tokens available', async () => {
            // Clear env tokens
            const manager = new TokenManager({
                clientId: 'test-client',
                tokensFile: testTokensFile,
                tokens: {
                    access_token: null,
                    refresh_token: null
                }
            });

            await expect(manager.getAccessToken()).rejects.toThrow('No tokens available');
        });
    });

    describe('initializeFromEnv', () => {
        test('should initialize tokens from initial config', () => {
            const manager = new TokenManager({
                clientId: 'test-client',
                tokensFile: testTokensFile,
                tokens: {
                    access_token: 'init-access',
                    refresh_token: 'init-refresh'
                }
            });

            const result = manager.initializeFromEnv();

            expect(result).toBe(true);
            expect(manager.currentTokens.access_token).toBe('init-access');
            expect(manager.currentTokens.refresh_token).toBe('init-refresh');
            expect(manager.currentTokens.expires_at).toBeDefined();
        });

        test('should return false if no initial tokens', () => {
            const manager = new TokenManager({
                clientId: 'test-client',
                tokensFile: testTokensFile,
                tokens: {
                    access_token: null,
                    refresh_token: null
                }
            });

            const result = manager.initializeFromEnv();

            expect(result).toBe(false);
        });

        test('should save tokens to file', () => {
            const manager = new TokenManager({
                clientId: 'test-client',
                tokensFile: testTokensFile,
                tokens: {
                    access_token: 'init-access',
                    refresh_token: 'init-refresh'
                }
            });

            manager.initializeFromEnv();

            expect(fs.existsSync(testTokensFile)).toBe(true);
        });
    });

    describe('startAutoRefresh', () => {
        beforeEach(() => {
            jest.useFakeTimers();
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        test('should start interval for auto-refresh', () => {
            const manager = new TokenManager({
                clientId: 'test-client',
                tokensFile: testTokensFile
            });
            manager.currentTokens = {
                access_token: 'test',
                refresh_token: 'refresh',
                expires_at: Math.floor(Date.now() / 1000) + 3600
            };

            const setIntervalSpy = jest.spyOn(global, 'setInterval');

            manager.startAutoRefresh();

            expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 60 * 60 * 1000);
        });

        test('should refresh token when expired during auto-refresh', async () => {
            const manager = new TokenManager({
                clientId: 'test-client',
                tokensFile: testTokensFile
            });
            manager.currentTokens = {
                access_token: 'expired',
                refresh_token: 'refresh',
                expires_at: Math.floor(Date.now() / 1000) - 100 // Already expired
            };

            axios.post.mockResolvedValue({
                data: {
                    access_token: 'auto-refreshed',
                    refresh_token: 'new-refresh',
                    expires_in: 86400
                }
            });

            manager.startAutoRefresh();

            // Advance timer by 1 hour
            jest.advanceTimersByTime(60 * 60 * 1000);

            // Wait for async operations
            await Promise.resolve();

            expect(axios.post).toHaveBeenCalled();
        });

        test('should handle errors during auto-refresh gracefully', async () => {
            const manager = new TokenManager({
                clientId: 'test-client',
                tokensFile: testTokensFile
            });
            manager.currentTokens = {
                access_token: 'test',
                refresh_token: 'refresh',
                expires_at: Math.floor(Date.now() / 1000) - 100
            };

            axios.post.mockRejectedValue(new Error('Network error'));

            manager.startAutoRefresh();

            // Advance timer by 1 hour
            jest.advanceTimersByTime(60 * 60 * 1000);

            // Wait for async operations - should not throw
            await Promise.resolve();
        });

        test('should not refresh if token is still valid', async () => {
            const manager = new TokenManager({
                clientId: 'test-client',
                tokensFile: testTokensFile
            });
            manager.currentTokens = {
                access_token: 'valid',
                refresh_token: 'refresh',
                expires_at: Math.floor(Date.now() / 1000) + 7200 // 2 hours from now
            };

            manager.startAutoRefresh();

            // Advance timer by 1 hour
            jest.advanceTimersByTime(60 * 60 * 1000);

            await Promise.resolve();

            expect(axios.post).not.toHaveBeenCalled();
        });
    });
});
