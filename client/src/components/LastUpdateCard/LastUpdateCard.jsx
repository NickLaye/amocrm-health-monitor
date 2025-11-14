import React from 'react';
import PropTypes from 'prop-types';
import './LastUpdateCard.css';

/**
 * LastUpdateCard - Отображает время последнего обновления
 * @param {Date} lastUpdate - Дата и время последнего обновления
 */
const LastUpdateCard = React.memo(({ lastUpdate }) => {
  if (!lastUpdate) return null;

  return (
    <div className="last-update-card">
      <div className="last-update-label">Последнее обновление</div>
      <div className="last-update-time">
        {lastUpdate.toLocaleTimeString('ru-RU')}
      </div>
    </div>
  );
});

LastUpdateCard.propTypes = {
  lastUpdate: PropTypes.instanceOf(Date)
};

LastUpdateCard.defaultProps = {
  lastUpdate: null
};

LastUpdateCard.displayName = 'LastUpdateCard';

export default LastUpdateCard;

