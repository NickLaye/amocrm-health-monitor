import React, { useState, useEffect, useCallback, useMemo } from 'react';
import './Dashboard.css';
import StatusCard from '../StatusCard';
import LastUpdateCard from '../LastUpdateCard';
import PeriodSelector from '../PeriodSelector';
import AverageResponseTime from '../AverageResponseTime';
import ServicesGrid from '../ServicesGrid';
import ResponseTimeChart from '../ResponseTimeChart';
import IncidentHistory from '../IncidentHistory';
import api from '../../services/api';
import { CHECK_TYPE_COLORS, CHECK_TYPE_LABELS } from '../../constants';
import PropTypes from 'prop-types';

/**
 * Dashboard - Главный компонент мониторинга
 * @param {object} status - Текущий статус всех сервисов
 * @param {object} stats - Статистика всех сервисов
 * @param {Date} lastUpdate - Время последнего обновления
 */
function Dashboard({ status, stats, lastUpdate }) {
  const [historyData, setHistoryData] = useState({});
  const [selectedPeriod, setSelectedPeriod] = useState(24);

  // Fetch history data when period changes
  const fetchHistoryData = useCallback(async () => {
    try {
      const data = await api.getHistory(null, selectedPeriod);
      
      // Group data by check type
      const grouped = {};
      data.forEach(check => {
        if (!grouped[check.check_type]) {
          grouped[check.check_type] = [];
        }
        grouped[check.check_type].push(check);
      });
      
      setHistoryData(grouped);
    } catch (error) {
      console.error('Error fetching history:', error);
    }
  }, [selectedPeriod]);

  useEffect(() => {
    fetchHistoryData();
  }, [fetchHistoryData]);

  // Calculate overall status
  const overallStatus = useMemo(() => {
    if (!status) return 'unknown';
    
    const statuses = Object.values(status);
    const hasDown = statuses.some(s => s.status === 'down');
    
    return hasDown ? 'down' : 'up';
  }, [status]);

  // Memoized period change handler
  const handlePeriodChange = useCallback((newPeriod) => {
    setSelectedPeriod(newPeriod);
  }, []);

  // Check if we have history data
  const hasHistoryData = useMemo(() => {
    return Object.keys(historyData).length > 0;
  }, [historyData]);

  return (
    <div className="dashboard">
      {/* Top Bar: Status + Last Update + Period */}
      <div className="dashboard-top-bar">
        <StatusCard status={overallStatus} />
        <LastUpdateCard lastUpdate={lastUpdate} />
        <PeriodSelector 
          selectedPeriod={selectedPeriod} 
          onPeriodChange={handlePeriodChange} 
        />
      </div>

      {/* Average Response Times - GET and POST */}
      <AverageResponseTime stats={stats} />

      {/* All Services in one row */}
      <ServicesGrid status={status} stats={stats} />

      {/* Response Time Chart */}
      {hasHistoryData && (
        <div className="chart-section">
          <h3>График времени ответа</h3>
          <ResponseTimeChart 
            data={historyData} 
            colors={CHECK_TYPE_COLORS}
            labels={CHECK_TYPE_LABELS}
          />
        </div>
      )}

      {/* Incident History */}
      <IncidentHistory period={selectedPeriod} />
    </div>
  );
}

Dashboard.propTypes = {
  status: PropTypes.object,
  stats: PropTypes.object,
  lastUpdate: PropTypes.instanceOf(Date)
};

Dashboard.defaultProps = {
  status: null,
  stats: null,
  lastUpdate: null
};

export default React.memo(Dashboard);
