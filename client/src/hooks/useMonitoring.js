/**
 * Custom hook for monitoring data management
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../services/api';
import { handleApiError } from '../utils/api-helpers';

export function useMonitoring() {
  const [status, setStatus] = useState(null);
  const [stats, setStats] = useState(null);
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const eventSourceRef = useRef(null);

  // Fetch all monitoring data
  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const [statusData, statsData, incidentsData] = await Promise.all([
        api.getStatus(),
        api.getStats(24),
        api.getIncidents(20)
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

  // Setup SSE for real-time updates
  useEffect(() => {
    eventSourceRef.current = api.subscribeToUpdates(
      (checkType, data) => {
        setStatus(prevStatus => ({
          ...prevStatus,
          [checkType]: data
        }));
        setLastUpdate(new Date());
      },
      (err) => {
        console.error('SSE Error:', err);
        setError('Ошибка подключения к серверу');
      }
    );

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  // Fetch initial data
  useEffect(() => {
    fetchData();
    
    // Fallback polling every 30 seconds
    const interval = setInterval(fetchData, 30000);
    
    return () => clearInterval(interval);
  }, [fetchData]);

  // Manual refresh function
  const refresh = useCallback(() => {
    setLoading(true);
    fetchData();
  }, [fetchData]);

  return {
    status,
    stats,
    incidents,
    loading,
    error,
    lastUpdate,
    refresh
  };
}

/**
 * Custom hook for fetching history data
 */
export function useHistoryData(initialPeriod = 24) {
  const [historyData, setHistoryData] = useState({});
  const [period, setPeriod] = useState(initialPeriod);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const data = await api.getHistory(null, period);
        
        // Group data by check type
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
  }, [period]);

  return {
    historyData,
    period,
    setPeriod,
    loading,
    error
  };
}

