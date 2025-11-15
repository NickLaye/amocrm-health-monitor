import React, { useState } from 'react';
import './IncidentHistory.css';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

const CHECK_TYPE_LABELS = {
  GET: 'API (GET)',
  POST: 'API (POST)',
  WEB: 'Web Interface',
  HOOK: 'Webhooks',
  DP: 'Digital Pipeline'
};

function IncidentHistory({ incidents }) {
  const [showAll, setShowAll] = useState(false);

  const formatDuration = (milliseconds) => {
    if (!milliseconds) {
      return 'В процессе...';
    }
    
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}д ${hours % 24}ч ${minutes % 60}м`;
    } else if (hours > 0) {
      return `${hours}ч ${minutes % 60}м`;
    } else if (minutes > 0) {
      return `${minutes}м ${seconds % 60}с`;
    } else {
      return `${seconds}с`;
    }
  };

  const formatDate = (timestamp) => {
    return format(new Date(timestamp), 'dd MMM yyyy, HH:mm:ss', { locale: ru });
  };

  // Check if incidents is undefined or empty before using slice
  if (!incidents || incidents.length === 0) {
    return (
      <div className="incident-history">
        <h2>История инцидентов</h2>
        <div className="no-incidents">
          <div className="success-icon">✓</div>
          <p>Отличная новость! За последнее время инцидентов не обнаружено.</p>
        </div>
      </div>
    );
  }

  const displayedIncidents = showAll ? incidents : incidents.slice(0, 10);

  return (
    <div className="incident-history">
      <div className="history-header">
        <h2>История инцидентов</h2>
        <div className="incident-count">
          Всего инцидентов: <span className="count">{incidents.length}</span>
        </div>
      </div>

      <div className="incidents-table-container">
        <table className="incidents-table">
          <thead>
            <tr>
              <th>Сервис</th>
              <th>Начало</th>
              <th>Конец</th>
              <th>Длительность</th>
              <th>Детали</th>
            </tr>
          </thead>
          <tbody>
            {displayedIncidents.map((incident) => (
              <tr key={incident.id} className={incident.end_time ? 'resolved' : 'ongoing'}>
                <td>
                  <span className="service-badge">
                    {CHECK_TYPE_LABELS[incident.check_type] || incident.check_type}
                  </span>
                </td>
                <td className="timestamp">
                  {formatDate(incident.start_time)}
                </td>
                <td className="timestamp">
                  {incident.end_time ? formatDate(incident.end_time) : (
                    <span className="ongoing-badge">В процессе</span>
                  )}
                </td>
                <td>
                  <span className={`duration ${!incident.end_time ? 'ongoing' : ''}`}>
                    {formatDuration(incident.duration)}
                  </span>
                </td>
                <td className="details">
                  {incident.details || 'Нет деталей'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {incidents.length > 10 && (
        <div className="show-more-container">
          <button 
            className="show-more-btn"
            onClick={() => setShowAll(!showAll)}
          >
            {showAll ? 'Показать меньше' : `Показать еще (${incidents.length - 10})`}
          </button>
        </div>
      )}
    </div>
  );
}

export default IncidentHistory;

