import React, { useMemo } from 'react';
import PropTypes from 'prop-types';
import ServiceCard from '../ServiceCard';
import { CHECK_TYPE_LABELS } from '../../constants';
import './ServicesGrid.css';

/**
 * ServicesGrid - Сетка карточек сервисов
 * @param {object} status - Текущий статус всех сервисов
 * @param {object} stats - Статистика всех сервисов
 * @param {string} view - Вид отображения (compact/detailed)
 */
const ServicesGrid = React.memo(({ status, stats, view = 'compact' }) => {
  const serviceTypes = useMemo(() => ['GET', 'POST', 'WEB', 'HOOK', 'DP'], []);

  if (!status) {
    return null;
  }

  return (
    <div className="services-grid-all">
      {serviceTypes.map(checkType => {
        const data = status[checkType];
        if (!data) {
          return null;
        }

        return (
          <ServiceCard
            key={checkType}
            checkType={checkType}
            label={CHECK_TYPE_LABELS[checkType]}
            data={data}
            stats={stats?.[checkType]}
            view={view}
          />
        );
      })}
    </div>
  );
});

ServicesGrid.propTypes = {
  status: PropTypes.object,
  stats: PropTypes.object,
  view: PropTypes.oneOf(['compact', 'detailed'])
};

ServicesGrid.defaultProps = {
  status: null,
  stats: null,
  view: 'compact'
};

ServicesGrid.displayName = 'ServicesGrid';

export default ServicesGrid;

