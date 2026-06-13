import axios from 'axios';

// Use relative path in production, full URL in development
const API_BASE_URL = import.meta.env.VITE_API_URL || (
  import.meta.env.PROD ? '/api' : 'http://localhost:3001/api'
);

class ApiService {
  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      timeout: 10000
    });
    // Cache for clients list (rarely changes)
    this.clientsCache = null;
    this.clientsCacheTime = null;
    this.clientsCacheTtl = 5 * 60 * 1000; // 5 minutes
    this.clientsRequestPromise = null; // Prevent parallel requests
  }

  buildParams(params = {}, clientId) {
    if (clientId) {
      return { ...params, clientId };
    }
    return params;
  }

  async getClients(forceRefresh = false) {
    // Return cached data if still valid
    if (!forceRefresh && this.clientsCache && this.clientsCacheTime) {
      const age = Date.now() - this.clientsCacheTime;
      if (age < this.clientsCacheTtl) {
        return this.clientsCache;
      }
    }

    // If there's already a request in progress, wait for it
    if (this.clientsRequestPromise) {
      try {
        return await this.clientsRequestPromise;
      } catch (error) {
        // If the pending request fails, allow retry
        this.clientsRequestPromise = null;
        throw error;
      }
    }

    // Start new request
    this.clientsRequestPromise = (async () => {
      try {
        const response = await this.client.get('/clients');
        const clientList = response.data.data || [];
        this.clientsCache = clientList;
        this.clientsCacheTime = Date.now();
        this.clientsRequestPromise = null;
        return clientList;
      } catch (error) {
        this.clientsRequestPromise = null;
        console.error('Error fetching clients:', error);
        throw error;
      }
    })();

    return await this.clientsRequestPromise;
  }

  // Get current status
  async getStatus(clientId) {
    try {
      const response = await this.client.get('/status', {
        params: this.buildParams({}, clientId)
      });
      return response.data.data;
    } catch (error) {
      console.error('Error fetching status:', error);
      throw error;
    }
  }

  // Get historical data
  async getHistory(checkType = null, hours = 24, clientId) {
    try {
      const params = this.buildParams({ hours }, clientId);
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
  async getIncidents(limit = 50, clientId) {
    try {
      const response = await this.client.get('/incidents', {
        params: this.buildParams({ limit }, clientId)
      });
      return response.data.data;
    } catch (error) {
      console.error('Error fetching incidents:', error);
      throw error;
    }
  }

  // Get statistics
  async getStats(hours = 24, clientId) {
    try {
      const response = await this.client.get('/stats', {
        params: this.buildParams({ hours }, clientId)
      });
      return response.data.data;
    } catch (error) {
      console.error('Error fetching stats:', error);
      throw error;
    }
  }

  async requestSseToken(clientId) {
    if (!clientId) {
      throw new Error('clientId is required to request SSE token');
    }
    try {
      const response = await this.client.post('/stream/token', { clientId });
      const payload = response?.data?.data;
      if (!payload?.token) {
        throw new Error('Empty SSE token response');
      }
      return payload;
    } catch (error) {
      console.error('Error requesting SSE token:', error);
      throw error;
    }
  }

  // Subscribe to real-time updates via SSE.
  // Returns a controller with a `close()` method. On connection errors it
  // requests a fresh SSE token and recreates the EventSource using exponential
  // backoff (1s -> 2s -> ... -> max 30s), so real-time keeps working after the
  // short-lived token TTL expires. Calling `close()` cancels any pending
  // reconnect timer and tears down the connection.
  async subscribeToUpdates(clientId, callback) {
    if (!clientId) {
      throw new Error('clientId is required to subscribe to updates');
    }

    const BASE_BACKOFF_MS = 1000;
    const MAX_BACKOFF_MS = 30000;

    let eventSource = null;
    let reconnectTimer = null;
    let attempt = 0;
    let closed = false;

    const clearReconnectTimer = () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const teardownEventSource = () => {
      if (eventSource) {
        eventSource.onmessage = null;
        eventSource.onerror = null;
        eventSource.close();
        eventSource = null;
      }
    };

    const scheduleReconnect = () => {
      if (closed || reconnectTimer) {
        return;
      }
      const delay = Math.min(BASE_BACKOFF_MS * Math.pow(2, attempt), MAX_BACKOFF_MS);
      attempt += 1;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, delay);
    };

    const connect = async () => {
      if (closed) {
        return;
      }
      try {
        const tokenPayload = await this.requestSseToken(clientId);
        if (closed) {
          return;
        }

        const params = new URLSearchParams();
        params.append('clientId', clientId);
        params.append('token', tokenPayload.token);

        const streamUrl = `${API_BASE_URL}/stream?${params.toString()}`;
        teardownEventSource();
        eventSource = new EventSource(streamUrl, { withCredentials: true });

        eventSource.onopen = () => {
          // Reset backoff once a connection is successfully established.
          attempt = 0;
        };

        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'status_update') {
              callback(data.checkType, data.data, data.clientId);
            }
          } catch (error) {
            console.error('Error parsing SSE message:', error);
          }
        };

        eventSource.onerror = (error) => {
          console.error('SSE connection error:', error);
          if (closed) {
            return;
          }
          // Drop the stale connection and reconnect with a fresh token,
          // instead of letting the browser silently retry with an expired one.
          teardownEventSource();
          scheduleReconnect();
        };
      } catch (error) {
        console.error('SSE connection setup failed:', error);
        if (!closed) {
          scheduleReconnect();
        }
      }
    };

    await connect();

    return {
      close() {
        closed = true;
        clearReconnectTimer();
        teardownEventSource();
      }
    };
  }

  async createAccount(payload) {
    try {
      const response = await this.client.post('/accounts', payload);
      return response.data?.data;
    } catch (error) {
      console.error('Error creating account:', error);
      throw error;
    }
  }
}

export default new ApiService();

