/**
 * Custom hook for monitoring data management
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../services/api';
import { handleApiError } from '../utils/api-helpers';

const CLIENT_STORAGE_KEY = 'amo-monitor.clientId';

const getClientIdFromUrl = () => {
  if (typeof window === 'undefined') {
    return null;
  }
  const params = new URLSearchParams(window.location.search);
  return params.get('clientId');
};

const syncClientIdToUrl = (clientId) => {
  if (typeof window === 'undefined') {
    return;
  }
  const url = new URL(window.location.href);
  if (clientId) {
    url.searchParams.set('clientId', clientId);
  } else {
    url.searchParams.delete('clientId');
  }
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
};

export function useMonitoring() {
  const [clients, setClients] = useState([]);
  const [selectedClientId, setSelectedClientId] = useState(null);
  const [status, setStatus] = useState(null);
  const [stats, setStats] = useState(null);
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const eventSourceRef = useRef(null);
  const clientsLoadedRef = useRef(false);

  const fetchData = useCallback(async (clientId) => {
    if (!clientId) return;

    try {
      setError(null);
      const [statusData, statsData, incidentsData] = await Promise.all([
        api.getStatus(clientId),
        api.getStats(24, clientId),
        api.getIncidents(20, clientId)
      ]);

      setStatus(statusData);
      setStats(statsData);
      setIncidents(incidentsData);
      setLastUpdate(new Date());
      setLoading(false);
    } catch (err) {
      console.error('Error fetching monitoring data:', err);
      setError(handleApiError(err));
      setLoading(false);
    }
  }, []);

  const getInitialClientId = useCallback((clientList) => {
    if (!clientList.length) {
      return null;
    }
    const urlClientId = getClientIdFromUrl();
    if (urlClientId && clientList.some(client => client.id === urlClientId)) {
      return urlClientId;
    }
    if (typeof window !== 'undefined') {
      const storedClientId = window.localStorage.getItem(CLIENT_STORAGE_KEY);
      if (storedClientId && clientList.some(client => client.id === storedClientId)) {
        return storedClientId;
      }
    }
    return clientList[0]?.id || null;
  }, []);

  const loadClients = useCallback(async () => {
    // Prevent multiple simultaneous calls
    if (clientsLoadedRef.current) {
      return;
    }

    try {
      clientsLoadedRef.current = true;
      const clientList = await api.getClients();
      setClients(clientList);

      if (!clientList.length) {
        setError('Не найдено ни одного клиента');
        setLoading(false);
        return;
      }

      const initialClient = getInitialClientId(clientList);

      setSelectedClientId(initialClient);
      if (!initialClient) {
        setLoading(false);
      }
    } catch (err) {
      console.error('Error fetching clients:', err);
      setError(handleApiError(err));
      setLoading(false);
      clientsLoadedRef.current = false; // Allow retry on error
    }
  }, [getInitialClientId]);

  useEffect(() => {
    loadClients();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Load only once on mount

  useEffect(() => {
    let mounted = true;
    if (!selectedClientId) {
      return () => {
        mounted = false;
      };
    }

    const setupSSE = async () => {
      try {
        const eventSource = await api.subscribeToUpdates(
          selectedClientId,
          (checkType, data, clientIdFromEvent) => {
            if (!mounted) return;
            if (clientIdFromEvent && clientIdFromEvent !== selectedClientId) {
              return;
            }

            setStatus(prevStatus => ({
              ...(prevStatus || {}),
              [checkType]: data
            }));
            setLastUpdate(new Date());

            setTimeout(async () => {
              try {
                const incidentsData = await api.getIncidents(20, selectedClientId);
                if (mounted) {
                  setIncidents(incidentsData);
                }
              } catch (refreshError) {
                console.error('Error refreshing incidents after status change:', refreshError);
              }
            }, 1000);
          }
        );

        if (mounted) {
          eventSourceRef.current = eventSource;
        } else {
          eventSource.close();
        }
      } catch (err) {
        console.error('SSE Setup Error:', err);
        if (mounted) {
          setError('Ошибка подключения к серверу');
        }
      }
    };

    setupSSE();

    return () => {
      mounted = false;
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [selectedClientId]);

  useEffect(() => {
    if (!selectedClientId) {
      return;
    }

    setLoading(true);
    fetchData(selectedClientId);
    const interval = setInterval(() => fetchData(selectedClientId), 30000);

    return () => clearInterval(interval);
  }, [selectedClientId, fetchData]);

  useEffect(() => {
    if (!selectedClientId) {
      return;
    }
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(CLIENT_STORAGE_KEY, selectedClientId);
    }
    syncClientIdToUrl(selectedClientId);
  }, [selectedClientId]);

  const refresh = useCallback(() => {
    if (!selectedClientId) return;
    setLoading(true);
    fetchData(selectedClientId);
  }, [fetchData, selectedClientId]);

  const changeClient = useCallback((clientId) => {
    setSelectedClientId(clientId);
  }, []);

  return {
    clients,
    selectedClientId,
    status,
    stats,
    incidents,
    loading,
    error,
    lastUpdate,
    refresh,
    changeClient
  };
}

/**
 * Custom hook for fetching history data
 */
export function useHistoryData(initialPeriod = 24, clientId) {
  const [historyData, setHistoryData] = useState({});
  const [period, setPeriod] = useState(initialPeriod);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!clientId) {
      setHistoryData({});
      setLoading(false);
      return;
    }

    const fetchHistory = async () => {
      try {
        setLoading(true);
        setError(null);

        const data = await api.getHistory(null, period, clientId);

        const grouped = {};
        data.forEach(check => {
          if (!grouped[check.check_type]) {
            grouped[check.check_type] = [];
          }
          grouped[check.check_type].push(check);
        });

        setHistoryData(grouped);
        setLoading(false);
      } catch (err) {
        console.error('Error fetching history:', err);
        setError(handleApiError(err));
        setLoading(false);
      }
    };

    fetchHistory();
  }, [period, clientId]);

  return {
    historyData,
    period,
    setPeriod,
    loading,
    error
  };
}

