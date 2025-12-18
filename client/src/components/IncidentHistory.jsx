import React, { useState } from 'react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

const CHECK_TYPE_LABELS = {
  GET: 'API (GET)',
  POST: 'API (POST)',
  WEB: 'Web Interface',
  HOOK: 'Webhooks',
  DP: 'Digital Pipeline'
};

const ERROR_TRANSLATIONS = {
  'Request failed with status code 401': 'Ошибка авторизации (401)',
  'socket hang up': 'Обрыв соединения (socket hang up)'
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
      <div className="rounded-2xl border border-slate-700 bg-slate-800 p-6 text-center shadow-lg shadow-black/20">
        <h2 className="text-xl font-semibold text-white">История инцидентов</h2>
        <div className="mt-6 flex flex-col items-center gap-2 text-slate-400">
          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-emerald-500/60 bg-emerald-900/30 text-2xl text-emerald-100">
            ✓
          </div>
          <p className="text-sm text-slate-300">Отличная новость! За последнее время инцидентов не обнаружено.</p>
        </div>
      </div>
    );
  }

  const displayedIncidents = showAll ? incidents : incidents.slice(0, 10);

  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-800 p-6 shadow-lg shadow-black/20">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">История инцидентов</h2>
          <p className="text-sm text-slate-400">Журнал последних событий инфраструктуры</p>
        </div>
        <div className="rounded-full border border-slate-600 bg-slate-900/40 px-4 py-2 text-sm text-slate-300">
          Всего инцидентов: <span className="font-semibold text-white">{incidents.length}</span>
        </div>
      </div>

      <div className="mt-5 overflow-x-auto rounded-lg border border-slate-700 bg-slate-800">
        <table className="min-w-full text-left text-sm text-slate-300">
          <thead className="bg-slate-900/50">
            <tr>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Сервис</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Начало</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Конец</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Длительность</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Детали</th>
            </tr>
          </thead>
          <tbody data-testid="incident-rows">
            {displayedIncidents.map((incident) => {
              const rowDown = !incident.end_time;
              const rawDetails = incident.details || 'Нет деталей';
              const detailsText = ERROR_TRANSLATIONS[rawDetails] || rawDetails;

              return (
                <tr
                  key={incident.id}
                  className={`border-b border-slate-700 text-slate-300 transition-colors last:border-0 hover:bg-slate-700/50 ${rowDown ? 'bg-red-950/20' : ''}`}
                >
                  <td className="px-4 py-3">
                    <span className="rounded-full border border-slate-600 bg-slate-900/40 px-3 py-1 text-xs font-semibold text-slate-200">
                      {CHECK_TYPE_LABELS[incident.check_type] || incident.check_type}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-400">
                    {formatDate(incident.start_time)}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-400">
                    {incident.end_time ? (
                      formatDate(incident.end_time)
                    ) : (
                      <span className="rounded-full border border-amber-500/60 bg-amber-900/30 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-100">
                        В процессе
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-semibold text-white">
                    <span className={rowDown ? 'text-red-200' : 'text-slate-100'}>
                      {formatDuration(incident.duration)}
                    </span>
                  </td>
                  <td className="max-w-xs px-4 py-3 text-sm text-slate-300">
                    {detailsText}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {incidents.length > 10 && (
        <div className="mt-6 text-center">
          <button
            className="rounded-full border border-slate-600 bg-slate-900/50 px-6 py-2 text-sm font-semibold text-slate-200 transition hover:border-emerald-500/60 hover:text-white"
            onClick={() => setShowAll(!showAll)}
          >
            {showAll ? 'Показать меньше' : `Показать ещё (${incidents.length - 10})`}
          </button>
        </div>
      )}
    </div>
  );
}

export default IncidentHistory;

