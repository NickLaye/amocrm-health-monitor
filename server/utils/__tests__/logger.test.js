/**
 * Unit tests for Logger utility
 */

const { createLogger, LOG_LEVELS } = require('../logger');

describe('Logger', () => {
  let logger;
  let consoleLogSpy;
  let consoleErrorSpy;
  let consoleWarnSpy;

  beforeEach(() => {
    logger = createLogger('Test');
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  test('should create logger with context', () => {
    expect(logger).toBeDefined();
    expect(logger.context).toBe('Test');
  });

  test('should log info messages', () => {
    logger.info('Test message');
    expect(consoleLogSpy).toHaveBeenCalled();
    const logMessage = consoleLogSpy.mock.calls[0][0];
    expect(logMessage).toContain('[INFO]');
    expect(logMessage).toContain('[Test]');
    expect(logMessage).toContain('Test message');
  });

  test('should log error messages', () => {
    logger.error('Error message');
    expect(consoleErrorSpy).toHaveBeenCalled();
    const logMessage = consoleErrorSpy.mock.calls[0][0];
    expect(logMessage).toContain('[ERROR]');
    expect(logMessage).toContain('[Test]');
    expect(logMessage).toContain('Error message');
  });

  test('should log warning messages', () => {
    logger.warn('Warning message');
    expect(consoleWarnSpy).toHaveBeenCalled();
    const logMessage = consoleWarnSpy.mock.calls[0][0];
    expect(logMessage).toContain('[WARN]');
    expect(logMessage).toContain('[Test]');
    expect(logMessage).toContain('Warning message');
  });

  test('should format timestamps correctly', () => {
    logger.info('Test');
    const logMessage = consoleLogSpy.mock.calls[0][0];
    // Check for ISO timestamp format
    expect(logMessage).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});

