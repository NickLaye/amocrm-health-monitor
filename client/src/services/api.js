import axios from 'axios';

// Use relative path in production, full URL in development
const API_BASE_URL = process.env.REACT_APP_API_URL || (
  process.env.NODE_ENV === 'production' ? '/api' : 'http://localhost:3001/api'
);

class ApiService {
  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      timeout: 10000
    });
  }

  // Get current status
  async getStatus() {
    try {
      const response = await this.client.get('/status');
      return response.data.data;
    } catch (error) {
      console.error('Error fetching status:', error);
      throw error;
    }
  }

  // Get historical data
  async getHistory(checkType = null, hours = 24) {
    try {
      const params = { hours };
      if (checkType) {
        params.checkType = checkType;
      }
      const response = await this.client.get('/history', { params });
      return response.data.data;
    } catch (error) {
      console.error('Error fetching history:', error);
      throw error;
    }
  }

  // Get incidents
  async getIncidents(limit = 50) {
    try {
      const response = await this.client.get('/incidents', {
        params: { limit }
      });
      return response.data.data;
    } catch (error) {
      console.error('Error fetching incidents:', error);
      throw error;
    }
  }

  // Get statistics
  async getStats(hours = 24) {
    try {
      const response = await this.client.get('/stats', {
        params: { hours }
      });
      return response.data.data;
    } catch (error) {
      console.error('Error fetching stats:', error);
      throw error;
    }
  }

  // Subscribe to real-time updates via SSE
  subscribeToUpdates(callback) {
    const eventSource = new EventSource(`${API_BASE_URL}/stream`);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'status_update') {
          callback(data.checkType, data.data);
        }
      } catch (error) {
        console.error('Error parsing SSE message:', error);
      }
    };

    eventSource.onerror = (error) => {
      console.error('SSE connection error:', error);
      // Auto-reconnect is handled by EventSource
    };

    return eventSource;
  }
}

export default new ApiService();

