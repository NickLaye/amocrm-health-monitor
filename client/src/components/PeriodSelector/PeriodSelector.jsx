import React, { useCallback } from 'react';
import PropTypes from 'prop-types';
import './PeriodSelector.css';

/**
 * PeriodSelector - Селектор периода времени для отображения данных
 * @param {number} selectedPeriod - Выбранный период в часах
 * @param {function} onPeriodChange - Callback при изменении периода
 */
const PeriodSelector = React.memo(({ selectedPeriod, onPeriodChange }) => {
  const handleChange = useCallback((e) => {
    onPeriodChange(Number(e.target.value));
  }, [onPeriodChange]);

  const periods = [
    { value: 1, label: '1 час' },
    { value: 6, label: '6 часов' },
    { value: 24, label: '24 часа' },
    { value: 168, label: '7 дней' }
  ];

  return (
    <div className="period-selector">
      <label htmlFor="period-select">Период:</label>
      <select 
        id="period-select"
        value={selectedPeriod} 
        onChange={handleChange}
        aria-label="Выбор периода отображения данных"
      >
        {periods.map(({ value, label }) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </div>
  );
});

PeriodSelector.propTypes = {
  selectedPeriod: PropTypes.number.isRequired,
  onPeriodChange: PropTypes.func.isRequired
};

PeriodSelector.displayName = 'PeriodSelector';

export default PeriodSelector;

