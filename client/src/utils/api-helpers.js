/**
 * API Helper utilities for error handling and response processing
 */

/**
 * Handles API errors and returns user-friendly messages
 * @param {Error} error - The error object
 * @returns {string} User-friendly error message
 */
export function handleApiError(error) {
  if (!error) {
    return 'Неизвестная ошибка';
  }
  
  // Network errors
  if (error.message === 'Network Error' || !navigator.onLine) {
    return 'Ошибка сети. Проверьте подключение к интернету.';
  }
  
  // Timeout errors
  if (error.code === 'ECONNABORTED') {
    return 'Превышено время ожидания. Попробуйте еще раз.';
  }
  
  // HTTP errors
  if (error.response) {
    const { status, data } = error.response;
    
    switch (status) {
      case 400:
        if (data?.details && Array.isArray(data.details) && data.details.length > 0) {
          const firstError = data.details[0];
          return firstError.msg || firstError.message || data.error || 'Ошибка валидации';
        }
        return data?.error || data?.message || 'Неверный запрос';
      case 401:
        return 'Ошибка авторизации';
      case 403:
        return 'Доступ запрещен';
      case 404:
        return 'Ресурс не найден';
      case 409:
        return data?.error || 'Конфликт: ресурс уже существует';
      case 429:
        return 'Слишком много запросов. Попробуйте позже.';
      case 500:
        return 'Ошибка сервера. Попробуйте позже.';
      case 503:
        return data?.error || 'Сервис временно недоступен';
      default:
        return data?.error || data?.message || `Ошибка ${status}`;
    }
  }
  
  return error.message || 'Произошла ошибка';
}

/**
 * Retries a function with exponential backoff
 * @param {Function} fn - Function to retry
 * @param {number} maxRetries - Maximum number of retries
 * @param {number} delay - Initial delay in milliseconds
 * @returns {Promise} Result of the function
 */
export async function retryWithBackoff(fn, maxRetries = 3, delay = 1000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) {
        throw error;
      }
      
      const waitTime = delay * Math.pow(2, i);
      console.warn(`Retry ${i + 1}/${maxRetries} after ${waitTime}ms...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
}

/**
 * Debounces a function call
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @returns {Function} Debounced function
 */
export function debounce(func, wait = 300) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Checks if response data is valid
 * @param {Object} response - API response
 * @returns {boolean} True if valid
 */
export function isValidResponse(response) {
  return response && 
         response.success !== false && 
         response.data !== undefined &&
         response.data !== null;
}

/**
 * Extracts data from API response
 * @param {Object} response - API response
 * @returns {*} Extracted data
 */
export function extractResponseData(response) {
  if (!response) {
    return null;
  }
  return response.data?.data || response.data || null;
}

/**
 * Creates URL with query parameters
 * @param {string} baseUrl - Base URL
 * @param {Object} params - Query parameters
 * @returns {string} URL with parameters
 */
export function buildUrlWithParams(baseUrl, params) {
  if (!params || Object.keys(params).length === 0) {
    return baseUrl;
  }
  
  const queryString = Object.entries(params)
    .filter(([_, value]) => value !== null && value !== undefined)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
  
  return queryString ? `${baseUrl}?${queryString}` : baseUrl;
}
