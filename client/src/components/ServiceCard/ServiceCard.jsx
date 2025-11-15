import React, { useMemo } from 'react';
import PropTypes from 'prop-types';
import { formatResponseTime, formatUptime, formatNumber } from '../../utils/formatters';
import './ServiceCard.css';

/**
 * ServiceBadge - Бейдж со статусом сервиса
 */
const ServiceBadge = React.memo(({ status }) => {
  const getText = () => {
    switch (status) {
      case 'up':
        return 'UP';
      case 'down':
        return 'DOWN';
      default:
        return 'N/A';
    }
  };

  return (
    <span className={`badge badge-${status}`}>
      {getText()}
    </span>
  );
});

ServiceBadge.propTypes = {
  status: PropTypes.oneOf(['up', 'down', 'unknown']).isRequired
};

ServiceBadge.displayName = 'ServiceBadge';

/**
 * DetailItem - Элемент детальной информации
 */
const DetailItem = React.memo(({ label, value, isResponseTime = false }) => {
  return (
    <div className="detail-item">
      <span className="detail-label">{label}</span>
      {isResponseTime ? (
        <span className="detail-value">
          <span className="time-value">{value}</span>
          <span className="time-unit">сек</span>
        </span>
      ) : (
        <span className="detail-value">{value}</span>
      )}
    </div>
  );
});

DetailItem.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  isResponseTime: PropTypes.bool
};

DetailItem.displayName = 'DetailItem';

/**
 * ServiceCard - Карточка сервиса с детальной информацией
 * @param {string} checkType - Тип проверки (GET, POST, WEB, HOOK, DP)
 * @param {string} label - Название сервиса
 * @param {object} data - Данные о текущем состоянии
 * @param {object} stats - Статистика сервиса
 * @param {string} view - Режим отображения ('compact' | 'detailed')
 */
const ServiceCard = React.memo(({ checkType, label, data, stats, view = 'compact' }) => {
  const isHighResponseTime = useMemo(() => {
    return data.responseTime && data.responseTime > 700;
  }, [data.responseTime]);

  const cardClassName = useMemo(() => {
    const classes = ['service-card', `status-${data.status}`];
    if (isHighResponseTime) {
      classes.push('high-response-time');
    }
    return classes.join(' ');
  }, [data.status, isHighResponseTime]);

  const formattedResponseTime = useMemo(() => {
    return data.responseTime ? formatResponseTime(data.responseTime) : null;
  }, [data.responseTime]);

  return (
    <div className={cardClassName}>
      <div className="service-header">
        <h3>{label}</h3>
        <ServiceBadge status={data.status} />
      </div>
      
      <div className="service-details">
        {formattedResponseTime && (
          <DetailItem 
            label="Время ответа:" 
            value={formattedResponseTime} 
            isResponseTime 
          />
        )}
        
        {view === 'detailed' && stats && (
          <>
            <DetailItem 
              label="Uptime:" 
              value={formatUptime(stats.uptime)} 
            />
            <DetailItem 
              label="Проверок:" 
              value={formatNumber(stats.totalChecks)} 
            />
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
});

ServiceCard.propTypes = {
  checkType: PropTypes.string.isRequired,
  label: PropTypes.string.isRequired,
  data: PropTypes.shape({
    status: PropTypes.oneOf(['up', 'down', 'unknown']).isRequired,
    responseTime: PropTypes.number,
    errorMessage: PropTypes.string
  }).isRequired,
  stats: PropTypes.shape({
    uptime: PropTypes.number,
    totalChecks: PropTypes.number
  }),
  view: PropTypes.oneOf(['compact', 'detailed'])
};

ServiceCard.displayName = 'ServiceCard';

export default ServiceCard;
export { ServiceBadge, DetailItem };

