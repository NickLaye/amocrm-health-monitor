import React, { useState, useEffect } from 'react';
import './Dashboard.css';
import ResponseTimeChart from './ResponseTimeChart';
import LoadingSpinner from './LoadingSpinner';
import TabsNav from './TabsNav';
import DetailedMetrics from './DetailedMetrics';
import { initKeyboardShortcuts, KeyboardShortcutsHelp } from '../utils/keyboardShortcuts';
import api from '../services/api';
import { CHECK_TYPE_LABELS, CHECK_TYPE_COLORS } from '../constants';
import { formatResponseTime, formatUptime, formatNumber } from '../utils/formatters';

function Dashboard({ status, stats, lastUpdate }) {
  const [historyData, setHistoryData] = useState({});
  const [selectedPeriod, setSelectedPeriod] = useState(24);
  const [showHelp, setShowHelp] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    fetchHistoryData();
  }, [selectedPeriod]);

  // Initialize keyboard shortcuts
  useEffect(() => {
    const cleanup = initKeyboardShortcuts({
      onPeriodChange: setSelectedPeriod,
      onHelp: () => setShowHelp(true)
    });
    return cleanup;
  }, []);

  const fetchHistoryData = async () => {
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
  };

  const getOverallStatus = () => {
    if (!status) return 'unknown';
    
    const statuses = Object.values(status);
    const hasDown = statuses.some(s => s.status === 'down');
    
    return hasDown ? 'down' : 'up';
  };

  const overallStatus = getOverallStatus();

  // Tabs configuration
  const tabs = [
    { id: 'overview', label: 'Overview', icon: '📊' },
    { id: 'detailed', label: 'Detailed Metrics', icon: '📈' }
  ];

  // Show loading spinner if data is not ready
  if (!status || !stats) {
    return <LoadingSpinner message="Загрузка метрик..." size="large" />;
  }

  return (
    <div className="dashboard">
      {/* Top Bar: Status + Last Update + Period */}
      <div className="dashboard-top-bar">
        {/* Overall Status Indicator */}
        <div className={`status-card overall-status status-${overallStatus}`}>
          <div className="status-indicator">
            <div className="status-icon">
              {overallStatus === 'up' ? '✓' : '✗'}
            </div>
            <div className="status-text">
              <h2>Общий статус</h2>
              <p className="status-label">
                {overallStatus === 'up' ? 'Все сервисы работают' : 'Обнаружены проблемы'}
              </p>
            </div>
          </div>
        </div>

        {/* Last Update */}
        {lastUpdate && (
          <div className="last-update-card">
            <div className="last-update-label">Последнее обновление</div>
            <div className="last-update-time">{lastUpdate.toLocaleTimeString('ru-RU')}</div>
          </div>
        )}

        {/* Period Selector */}
        <div className="period-selector">
          <label>Период:</label>
          <select value={selectedPeriod} onChange={(e) => setSelectedPeriod(Number(e.target.value))}>
            <option value={1}>1 час</option>
            <option value={6}>6 часов</option>
            <option value={24}>24 часа</option>
            <option value={168}>7 дней</option>
          </select>
        </div>
      </div>

      {/* Tabs Navigation */}
      <TabsNav activeTab={activeTab} onTabChange={setActiveTab} tabs={tabs} />

      {/* Tab Content */}
      {activeTab === 'overview' ? (
        <>
          {/* Average Response Times - GET and POST */}
          {stats && (
            <div className="stats-summary">
              <h3>Среднее время ответа API</h3>
                  <div className="avg-times">
                    <div className="avg-time-card">
                      <span className="label">GET</span>
                      <span className="value">
                        <span className="value-number">{formatResponseTime(stats.GET?.averageResponseTime * 1000) || 0}</span>
                        <span className="value-unit"> сек</span>
                      </span>
                    </div>
                    <div className="avg-time-card">
                      <span className="label">POST</span>
                      <span className="value">
                        <span className="value-number">{formatResponseTime(stats.POST?.averageResponseTime * 1000) || 0}</span>
                        <span className="value-unit"> сек</span>
                      </span>
                    </div>
                  </div>
            </div>
          )}

          {/* All Services in one row */}
          <div className="services-grid-all">
        {status && ['GET', 'POST', 'WEB', 'HOOK', 'DP'].map(checkType => {
          const data = status[checkType];
          if (!data) return null;
          const isHighResponseTime = data.responseTime && data.responseTime > 700;
          return (
            <div key={checkType} className={`service-card status-${data.status}${isHighResponseTime ? ' high-response-time' : ''}`}>
              <div className="service-header">
                <h3>{CHECK_TYPE_LABELS[checkType]}</h3>
                <span className={`badge badge-${data.status}`}>
                  {data.status === 'up' ? 'UP' : data.status === 'down' ? 'DOWN' : 'N/A'}
                </span>
              </div>
              
              <div className="service-details">
                    {data.responseTime && (
                      <div className="detail-item">
                        <span className="detail-label">Время ответа:</span>
                        <span className="detail-value">
                          <span className="time-value">{formatResponseTime(data.responseTime)}</span>
                          <span className="time-unit">сек</span>
                        </span>
                      </div>
                    )}
                    
                    {stats && stats[checkType] && (
                      <>
                        <div className="detail-item">
                          <span className="detail-label">Uptime:</span>
                          <span className="detail-value">{formatUptime(stats[checkType].uptime)}</span>
                        </div>
                        <div className="detail-item">
                          <span className="detail-label">Проверок:</span>
                          <span className="detail-value">{formatNumber(stats[checkType].totalChecks)}</span>
                        </div>
                      </>
                    )}
                
                {data.errorMessage && (
                  <div className="error-message">
                    <span className="detail-label">Ошибка:</span>
                    <span className="detail-value">{data.errorMessage}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
          </div>

          {/* Response Time Chart */}
          {Object.keys(historyData).length > 0 && (
            <div className="chart-section">
              <h3>График времени ответа</h3>
              <ResponseTimeChart 
                data={historyData} 
                colors={CHECK_TYPE_COLORS}
                labels={CHECK_TYPE_LABELS}
              />
            </div>
          )}
        </>
      ) : (
        <DetailedMetrics stats={stats} />
      )}

      {/* Keyboard Shortcuts Help Modal */}
      <KeyboardShortcutsHelp isOpen={showHelp} onClose={() => setShowHelp(false)} />
    </div>
  );
}

export default Dashboard;

