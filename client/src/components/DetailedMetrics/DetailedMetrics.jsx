import React from 'react';
import './DetailedMetrics.css';
import { CHECK_TYPE_LABELS } from '../../constants';
import { formatResponseTime, formatNumber } from '../../utils/formatters';

const MetricsLegend = () => {
  const metricsInfo = [
    {
      category: 'Performance Metrics',
      icon: '⚡',
      metrics: [
        { name: 'Average', description: 'Среднее время ответа за выбранный период' },
        { name: '95th Percentile', description: '95% запросов выполняются быстрее этого времени (исключает выбросы)' },
        { name: 'Min', description: 'Минимальное время ответа' },
        { name: 'Max', description: 'Максимальное время ответа' },
        { name: 'Median', description: 'Медианное время ответа (50-й процентиль)' }
      ]
    },
    {
      category: 'Reliability Metrics',
      icon: '🛡️',
      metrics: [
        { name: 'Success Rate', description: 'Процент успешных проверок (Uptime)' },
        { name: 'Error Rate', description: 'Процент неудачных проверок' },
        { name: 'MTTR', description: 'Mean Time To Recovery - среднее время восстановления после сбоя' },
        { name: 'MTBF', description: 'Mean Time Between Failures - среднее время между сбоями' }
      ]
    },
    {
      category: 'User Experience',
      icon: '👥',
      metrics: [
        { 
          name: 'Apdex Score', 
          description: 'Application Performance Index (0-1): оценка удовлетворенности пользователей',
          details: '≥0.94 = Excellent, 0.85-0.93 = Good, 0.70-0.84 = Fair, <0.70 = Poor'
        },
        { name: 'Checks', description: 'Общее количество проверок за выбранный период' }
      ]
    }
  ];

  return (
    <div className="metrics-legend">
      <div className="legend-header">
        <h3>📊 Описание метрик</h3>
        <p>Подробная информация о каждой метрике для лучшего понимания данных</p>
      </div>
      
      <div className="legend-grid">
        {metricsInfo.map((category, idx) => (
          <div key={idx} className="legend-category">
            <h4 className="category-title">
              <span className="category-icon">{category.icon}</span>
              {category.category}
            </h4>
            <div className="category-metrics">
              {category.metrics.map((metric, midx) => (
                <div key={midx} className="metric-description">
                  <div className="metric-name">{metric.name}</div>
                  <div className="metric-desc">{metric.description}</div>
                  {metric.details && (
                    <div className="metric-details">{metric.details}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const DetailedMetrics = ({ stats }) => {
  if (!stats) return null;

  const serviceTypes = ['GET', 'POST', 'WEB', 'HOOK', 'DP'];

  return (
    <div className="detailed-metrics-container">
      {/* Metrics Legend */}
      <MetricsLegend />

      {/* Detailed Metrics Cards */}
      <div className="detailed-metrics">
        {serviceTypes.map(checkType => {
        const data = stats[checkType];
        if (!data) return null;

        return (
          <div key={checkType} className="detailed-card">
            <h3 className="detailed-card-title">{CHECK_TYPE_LABELS[checkType]}</h3>
            
            {/* Performance Metrics */}
            <div className="metrics-section">
              <h4>Performance</h4>
              <div className="metrics-grid">
                <MetricItem 
                  label="Average" 
                  value={formatResponseTime(data.averageResponseTime * 1000)}
                  unit="сек"
                />
                <MetricItem 
                  label="95th Percentile" 
                  value={data.percentile95 ? formatResponseTime(data.percentile95) : 'N/A'}
                  unit={data.percentile95 ? "сек" : ""}
                  highlight
                />
                <MetricItem 
                  label="Min" 
                  value={data.minResponseTime ? formatResponseTime(data.minResponseTime) : 'N/A'}
                  unit={data.minResponseTime ? "сек" : ""}
                />
                <MetricItem 
                  label="Max" 
                  value={data.maxResponseTime ? formatResponseTime(data.maxResponseTime) : 'N/A'}
                  unit={data.maxResponseTime ? "сек" : ""}
                />
                <MetricItem 
                  label="Median" 
                  value={data.medianResponseTime ? formatResponseTime(data.medianResponseTime) : 'N/A'}
                  unit={data.medianResponseTime ? "сек" : ""}
                />
              </div>
            </div>

            {/* Reliability Metrics */}
            <div className="metrics-section">
              <h4>Reliability</h4>
              <div className="metrics-grid">
                <MetricItem 
                  label="Success Rate" 
                  value={data.successRate?.toFixed(2) || '0'}
                  unit="%"
                  good={data.successRate >= 99}
                />
                <MetricItem 
                  label="Error Rate" 
                  value={data.errorRate?.toFixed(2) || '0'}
                  unit="%"
                  bad={data.errorRate > 1}
                />
                <MetricItem 
                  label="MTTR" 
                  value={data.mttr ? (data.mttr / 1000 / 60).toFixed(1) : 'N/A'}
                  unit={data.mttr ? "мин" : ""}
                  tooltip="Mean Time To Recovery"
                />
                <MetricItem 
                  label="MTBF" 
                  value={data.mtbf ? (data.mtbf / 1000 / 60 / 60).toFixed(1) : 'N/A'}
                  unit={data.mtbf ? "ч" : ""}
                  tooltip="Mean Time Between Failures"
                />
              </div>
            </div>

            {/* User Experience */}
            <div className="metrics-section">
              <h4>User Experience</h4>
              <div className="metrics-grid">
                <MetricItem 
                  label="Apdex Score" 
                  value={data.apdex || 'N/A'}
                  unit=""
                  highlight
                  good={data.apdex >= 0.94}
                  tooltip="Application Performance Index (0-1)"
                />
                <MetricItem 
                  label="Checks" 
                  value={formatNumber(data.totalChecks)}
                  unit=""
                />
              </div>
            </div>
          </div>
        );
        })}
      </div>
    </div>
  );
};

const MetricItem = ({ label, value, unit, highlight, good, bad, tooltip }) => (
  <div className={`metric-item ${highlight ? 'highlight' : ''} ${good ? 'good' : ''} ${bad ? 'bad' : ''}`}>
    <span className="metric-label" title={tooltip}>{label}</span>
    <span className="metric-value">
      {value}
      {unit && <span className="metric-unit">{unit}</span>}
    </span>
  </div>
);

export default DetailedMetrics;

