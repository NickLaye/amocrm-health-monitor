import React from 'react';
import PropTypes from 'prop-types';
import './StatusCard.css';

/**
 * StatusCard - Отображает общий статус системы
 * @param {string} status - Статус системы ('up', 'down', 'unknown')
 */
const StatusCard = React.memo(({ status }) => {
  const getStatusText = () => {
    switch (status) {
      case 'up':
        return 'Все сервисы работают';
      case 'down':
        return 'Обнаружены проблемы';
      default:
        return 'Статус неизвестен';
    }
  };

  const getStatusIcon = () => {
    return status === 'up' ? '✓' : '✗';
  };

  return (
    <div className={`status-card overall-status status-${status}`}>
      <div className="status-indicator">
        <div className="status-icon">
          {getStatusIcon()}
        </div>
        <div className="status-text">
          <h2>Общий статус</h2>
          <p className="status-label">
            {getStatusText()}
          </p>
        </div>
      </div>
    </div>
  );
});

StatusCard.propTypes = {
  status: PropTypes.oneOf(['up', 'down', 'unknown']).isRequired
};

StatusCard.displayName = 'StatusCard';

export default StatusCard;

