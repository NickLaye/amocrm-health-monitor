import React, { useMemo } from 'react';
import PropTypes from 'prop-types';
import { formatResponseTime } from '../../utils/formatters';
import './AverageResponseTime.css';

/**
 * AverageResponseTimeCard - Отображает среднее время ответа для одного типа запросов
 * @param {string} label - Метка (GET, POST)
 * @param {number} responseTime - Среднее время ответа в секундах
 */
const AverageResponseTimeCard = React.memo(({ label, responseTime }) => {
  const formattedTime = useMemo(() => {
    return formatResponseTime(responseTime * 1000) || '0.000';
  }, [responseTime]);

  return (
    <div className="avg-time-card">
      <span className="label">{label}</span>
      <span className="value">
        <span className="value-number">{formattedTime}</span>
        <span className="value-unit"> сек</span>
      </span>
    </div>
  );
});

AverageResponseTimeCard.propTypes = {
  label: PropTypes.string.isRequired,
  responseTime: PropTypes.number
};

AverageResponseTimeCard.defaultProps = {
  responseTime: 0
};

AverageResponseTimeCard.displayName = 'AverageResponseTimeCard';

/**
 * AverageResponseTime - Секция средних времен ответа API
 * @param {object} stats - Статистика по типам запросов
 */
const AverageResponseTime = React.memo(({ stats }) => {
  if (!stats) {
    return null;
  }

  const getResponseTime = (checkType) => {
    return stats[checkType]?.averageResponseTime || 0;
  };

  return (
    <div className="stats-summary">
      <h3>Среднее время ответа API</h3>
      <div className="avg-times">
        <AverageResponseTimeCard 
          label="GET" 
          responseTime={getResponseTime('GET')} 
        />
        <AverageResponseTimeCard 
          label="POST" 
          responseTime={getResponseTime('POST')} 
        />
      </div>
    </div>
  );
});

AverageResponseTime.propTypes = {
  stats: PropTypes.object
};

AverageResponseTime.defaultProps = {
  stats: null
};

AverageResponseTime.displayName = 'AverageResponseTime';

export default AverageResponseTime;
export { AverageResponseTimeCard };

