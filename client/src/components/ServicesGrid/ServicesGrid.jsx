import React, { useMemo } from 'react';
import PropTypes from 'prop-types';
import ServiceCard from '../ServiceCard';
import { CHECK_TYPE_LABELS } from '../../constants';
import './ServicesGrid.css';

/**
 * ServicesGrid - Сетка карточек сервисов
 * @param {object} status - Текущий статус всех сервисов
 * @param {object} stats - Статистика всех сервисов
 */
const ServicesGrid = React.memo(({ status, stats }) => {
  const serviceTypes = useMemo(() => ['GET', 'POST', 'WEB', 'HOOK', 'DP'], []);

  if (!status) return null;

  return (
    <div className="services-grid-all">
      {serviceTypes.map(checkType => {
        const data = status[checkType];
        if (!data) return null;

        return (
          <ServiceCard
            key={checkType}
            checkType={checkType}
            label={CHECK_TYPE_LABELS[checkType]}
            data={data}
            stats={stats?.[checkType]}
          />
        );
      })}
    </div>
  );
});

ServicesGrid.propTypes = {
  status: PropTypes.object,
  stats: PropTypes.object
};

ServicesGrid.defaultProps = {
  status: null,
  stats: null
};

ServicesGrid.displayName = 'ServicesGrid';

export default ServicesGrid;

