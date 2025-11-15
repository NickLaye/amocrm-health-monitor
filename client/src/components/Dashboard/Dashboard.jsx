import React, { useState, useEffect, useCallback, useMemo, Suspense, lazy } from 'react';
import './Dashboard.css';
import StatusCard from '../StatusCard';
import LastUpdateCard from '../LastUpdateCard';
import PeriodSelector from '../PeriodSelector';
import TabsNav from '../TabsNav';
import AverageResponseTime from '../AverageResponseTime';
import ServicesGrid from '../ServicesGrid';
import LoadingSpinner from '../LoadingSpinner';
import api from '../../services/api';
import { CHECK_TYPE_COLORS, CHECK_TYPE_LABELS } from '../../constants';
import PropTypes from 'prop-types';

// Lazy load heavy components for better initial load performance
const ResponseTimeChart = lazy(() => import('../ResponseTimeChart'));
const IncidentHistory = lazy(() => import('../IncidentHistory'));

/**
 * Dashboard - Главный компонент мониторинга
 * @param {object} status - Текущий статус всех сервисов
 * @param {object} stats - Статистика всех сервисов
 * @param {Date} lastUpdate - Время последнего обновления
 */
function Dashboard({ status, stats, lastUpdate }) {
  const [historyData, setHistoryData] = useState({});
  const [selectedPeriod, setSelectedPeriod] = useState(24);
  const [activeView, setActiveView] = useState('compact');

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
    if (!status) {
      return 'unknown';
    }
    
    const statuses = Object.values(status);
    const hasDown = statuses.some(s => s.status === 'down');
    
    return hasDown ? 'down' : 'up';
  }, [status]);

  // Memoized period change handler
  const handlePeriodChange = useCallback((newPeriod) => {
    setSelectedPeriod(newPeriod);
  }, []);

  // Memoized view change handler
  const handleViewChange = useCallback((newView) => {
    setActiveView(newView);
  }, []);

  // Tabs configuration
  const viewTabs = useMemo(() => [
    { id: 'compact', label: 'Компактный вид', icon: '📊' },
    { id: 'detailed', label: 'Развернутый вид', icon: '📈' }
  ], []);

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

      {/* View Switcher */}
      <TabsNav 
        activeTab={activeView}
        onTabChange={handleViewChange}
        tabs={viewTabs}
      />

      {/* All Services in one row */}
      <ServicesGrid status={status} stats={stats} view={activeView} />

      {/* Response Time Chart - Lazy Loaded */}
      {hasHistoryData && (
        <div className="chart-section">
          <h3>График времени ответа</h3>
          <Suspense fallback={<LoadingSpinner />}>
            <ResponseTimeChart 
              data={historyData} 
              colors={CHECK_TYPE_COLORS}
              labels={CHECK_TYPE_LABELS}
            />
          </Suspense>
        </div>
      )}

      {/* Incident History - Lazy Loaded */}
      <Suspense fallback={<LoadingSpinner />}>
        <IncidentHistory period={selectedPeriod} />
      </Suspense>
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
