/**
 * Unit tests for Logger utility with Winston
 */

const { createLogger, getWinstonLogger } = require('../logger');
const winston = require('winston');

describe('Logger', () => {
  let logger;
  let winstonLogger;
  let infoSpy;
  let errorSpy;
  let warnSpy;
  let debugSpy;

  beforeEach(() => {
    logger = createLogger('Test');
    winstonLogger = getWinstonLogger();
    
    // Spy on Winston logger methods
    infoSpy = jest.spyOn(winstonLogger, 'info').mockImplementation();
    errorSpy = jest.spyOn(winstonLogger, 'error').mockImplementation();
    warnSpy = jest.spyOn(winstonLogger, 'warn').mockImplementation();
    debugSpy = jest.spyOn(winstonLogger, 'debug').mockImplementation();
  });

  afterEach(() => {
    infoSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
    debugSpy.mockRestore();
  });

  test('should create logger with context', () => {
    expect(logger).toBeDefined();
    expect(logger.context).toBe('Test');
  });

  test('should log info messages', () => {
    logger.info('Test message');
    expect(infoSpy).toHaveBeenCalled();
    const call = infoSpy.mock.calls[0];
    expect(call[0]).toBe('Test message');
    expect(call[1]).toHaveProperty('context', 'Test');
  });

  test('should log info messages with metadata', () => {
    logger.info('Test message', { key: 'value' });
    expect(infoSpy).toHaveBeenCalled();
    const call = infoSpy.mock.calls[0];
    expect(call[0]).toBe('Test message');
    expect(call[1]).toMatchObject({ context: 'Test', key: 'value' });
  });

  test('should log error messages', () => {
    logger.error('Error message');
    expect(errorSpy).toHaveBeenCalled();
    const call = errorSpy.mock.calls[0];
    expect(call[0]).toBe('Error message');
    expect(call[1]).toHaveProperty('context', 'Test');
  });

  test('should log error messages with Error object', () => {
    const error = new Error('Test error');
    logger.error('Error message', error);
    expect(errorSpy).toHaveBeenCalled();
    const call = errorSpy.mock.calls[0];
    expect(call[0]).toBe('Error message');
    expect(call[1]).toMatchObject({
      context: 'Test',
      error: 'Test error'
    });
    expect(call[1]).toHaveProperty('stack');
  });

  test('should log warning messages', () => {
    logger.warn('Warning message');
    expect(warnSpy).toHaveBeenCalled();
    const call = warnSpy.mock.calls[0];
    expect(call[0]).toBe('Warning message');
    expect(call[1]).toHaveProperty('context', 'Test');
  });

  test('should log debug messages', () => {
    logger.debug('Debug message');
    expect(debugSpy).toHaveBeenCalled();
    const call = debugSpy.mock.calls[0];
    expect(call[0]).toBe('Debug message');
    expect(call[1]).toHaveProperty('context', 'Test');
  });

  test('should log HTTP requests', () => {
    logger.http('GET', '/api/test', 200, 150);
    expect(infoSpy).toHaveBeenCalled();
    const call = infoSpy.mock.calls[0];
    expect(call[0]).toContain('GET');
    expect(call[0]).toContain('/api/test');
    expect(call[0]).toContain('200');
    expect(call[0]).toContain('150ms');
    expect(call[1]).toMatchObject({
      context: 'Test',
      method: 'GET',
      url: '/api/test',
      statusCode: 200,
      responseTime: 150
    });
  });

  test('getWinstonLogger returns Winston instance', () => {
    expect(winstonLogger).toBeDefined();
    expect(winstonLogger).toHaveProperty('info');
    expect(winstonLogger).toHaveProperty('error');
    expect(winstonLogger).toHaveProperty('warn');
    expect(winstonLogger).toHaveProperty('debug');
  });
});
