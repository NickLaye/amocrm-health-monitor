/**
 * Configuration service for runtime config loading
 */

let cachedConfig = null;

/**
 * Fetch configuration from backend
 * @returns {Promise<Object>} Configuration object
 */
export async function fetchConfig() {
  if (cachedConfig) {
    return cachedConfig;
  }

  try {
    const response = await fetch('/api/config');
    const result = await response.json();
    
    if (result.success && result.data) {
      cachedConfig = result.data;
      return cachedConfig;
    }
    
    throw new Error('Failed to load configuration');
  } catch (error) {
    console.error('Error fetching config:', error);
    // Return default config on error
    return {
      checkInterval: 60000,
      domain: '',
      sse: {
        tokenEndpoint: '/api/stream/token',
        tokenTtlMs: 300000
      }
    };
  }
}

/**
 * Get cached configuration
 * @returns {Object|null} Cached configuration or null
 */
export function getConfig() {
  return cachedConfig;
}

/**
 * Clear cached configuration (for testing)
 */
export function clearConfigCache() {
  cachedConfig = null;
}

