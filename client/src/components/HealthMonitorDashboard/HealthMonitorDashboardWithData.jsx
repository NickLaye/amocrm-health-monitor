import React, { useMemo, useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import { formatResponseTime, formatUptime, formatPercentage } from '../../utils/formatters';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import ResponseTimeChart from '../ResponseTimeChart';
import ServiceCard from '../ServiceCard';
import IncidentHistory from '../IncidentHistory';
import api from '../../services/api';
import { CHECK_TYPE_COLORS, CHECK_TYPE_LABELS } from '../../constants';

/**
 * HealthMonitorDashboardWithData - Pixel-perfect компонент с реальными данными
 * @param {object} status - Текущий статус всех сервисов
 * @param {object} stats - Статистика всех сервисов  
 * @param {Date} lastUpdate - Время последнего обновления
 * @param {Array} incidents - Массив инцидентов
 */
const HealthMonitorDashboardWithData = ({
  status,
  stats,
  lastUpdate,
  incidents = [],
  clients = [],
  selectedClientId,
  onClientChange
}) => {
  const [historyData, setHistoryData] = useState({});
  const [selectedPeriod, setSelectedPeriod] = useState(24); // По умолчанию 24 часа
  const [isDetailedView, setIsDetailedView] = useState(true);

  // Fetch history data when period changes
  const fetchHistoryData = useCallback(async () => {
    if (!selectedClientId) {
      setHistoryData({});
      return;
    }

    try {
      const data = await api.getHistory(null, selectedPeriod, selectedClientId);
      
      // Group data by check type
      const grouped = {};
      data.forEach(check => {
        const checkType = check.check_type;
        if (!grouped[checkType]) {
          grouped[checkType] = [];
        }
        // Ensure we have required fields
        if (check.timestamp && check.response_time !== undefined) {
          grouped[checkType].push({
            timestamp: check.timestamp,
            response_time: check.response_time || 0,
            check_type: checkType
          });
        }
      });
      
      setHistoryData(grouped);
    } catch (error) {
      console.error('Error fetching history:', error);
      setHistoryData({});
    }
  }, [selectedPeriod, selectedClientId]);

  useEffect(() => {
    fetchHistoryData();
  }, [fetchHistoryData, selectedClientId]);

  // Вычисляем общий статус
  const overallStatus = useMemo(() => {
    if (!status) {
      return 'unknown';
    }
    const statuses = Object.values(status);
    const hasDown = statuses.some(s => s.status === 'down');
    if (hasDown) {
      return 'down';
    }
    const hasWarning = statuses.some(s => s.status === 'warning');
    if (hasWarning) {
      return 'warning';
    }
    return 'up';
  }, [status]);

  // Форматируем время последнего обновления
  const formattedLastUpdate = useMemo(() => {
    if (!lastUpdate) {
      return '--:--:--';
    }
    try {
      return format(lastUpdate, 'HH:mm:ss', { locale: ru });
    } catch {
      return '--:--:--';
    }
  }, [lastUpdate]);

  // Получаем время ответа для GET и POST
  const getAvgResponseTime = (checkType) => {
    if (!stats || !stats[checkType]) {
      return 0;
    }
    return stats[checkType].averageResponseTime || 0;
  };

  const getResponseTime = getAvgResponseTime('GET');
  const postResponseTime = getAvgResponseTime('POST');

  // Данные сервисов для ServiceCard
  const serviceConfigs = useMemo(() => [
    { key: 'GET', name: 'API (GET)' },
    { key: 'POST', name: 'API (POST)' },
    { key: 'WEB', name: 'Веб-интерфейс' },
    { key: 'HOOK', name: 'Вебхуки' },
    { key: 'DP', name: 'Digital Pipeline' }
  ], []);

  const detailMode = isDetailedView ? 'detailed' : 'compact';
  const selectedClient = useMemo(
    () => clients.find(client => client.id === selectedClientId),
    [clients, selectedClientId]
  );

  const handleClientSelection = (clientId) => {
    if (clientId && clientId !== selectedClientId) {
      onClientChange?.(clientId);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 px-4 py-8 text-slate-200">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        {clients.length > 0 && (
          <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 shadow-inner shadow-black/15">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Клиенты</p>
                <h2 className="mt-1 text-xl font-semibold text-white">Выберите стенд для мониторинга</h2>
                <p className="text-sm text-slate-400">Данные фильтруются по выбранному клиенту</p>
              </div>
              <div className="lg:w-64">
                <label className="sr-only" htmlFor="client-selector">Выбор клиента</label>
                <select
                  id="client-selector"
                  value={selectedClientId || ''}
                  onChange={(event) => handleClientSelection(event.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900/60 px-4 py-2 text-sm font-medium text-slate-100 focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  {clients.map(client => (
                    <option key={`select-${client.id}`} value={client.id}>
                      {client.label || client.id}
                      {client.environment ? ` · ${client.environment}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {clients.map(client => {
                const active = client.id === selectedClientId;
                return (
                  <button
                    key={`card-${client.id}`}
                    type="button"
                    onClick={() => handleClientSelection(client.id)}
                    className={`w-full rounded-2xl border px-4 py-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
                      active
                        ? 'border-emerald-500/80 bg-emerald-900/20 shadow-inner shadow-emerald-500/20'
                        : 'border-slate-700 bg-slate-900/40 hover:border-emerald-400/50 hover:bg-slate-900/60'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-base font-semibold text-white">{client.label || client.id}</p>
                      {client.environment && (
                        <span className="rounded-full border border-slate-600 bg-slate-800/70 px-2 py-0.5 text-xs uppercase tracking-wide text-slate-300">
                          {client.environment}
                        </span>
                      )}
                    </div>
                    {client.domain && (
                      <p className="mt-1 text-xs font-mono text-slate-400">{client.domain}</p>
                    )}
                    {client.tags?.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {client.tags.map(tag => (
                          <span
                            key={`${client.id}-${tag}`}
                            className="rounded-full border border-slate-600/80 bg-slate-800/70 px-2 py-0.5 text-xs text-slate-300"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        <header className="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900/40 p-6 shadow-inner shadow-black/20 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-2">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">amoCRM Health Monitor</p>
            <h1 className="mt-2 text-3xl font-semibold text-white">AmoPulse Monitor</h1>
            <p className="text-sm text-slate-400">
              Единое окно для SRE и поддержки
              {selectedClient?.label ? ` · ${selectedClient.label}` : ''}
            </p>
          </div>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-end md:gap-4">
            <div className="flex items-center gap-3 rounded-full border border-slate-700 bg-slate-800 px-4 py-2">
              <span className="text-sm text-slate-400">Detailed View</span>
              <button
                type="button"
                role="switch"
                aria-checked={isDetailedView}
                onClick={() => setIsDetailedView(prev => !prev)}
                className={`relative h-8 w-14 rounded-full transition-colors duration-200 ${isDetailedView ? 'bg-emerald-500/80' : 'bg-slate-600'}`}
              >
                <span
                  className={`absolute inset-y-1 left-1 h-6 w-6 rounded-full bg-white transition-transform duration-200 ${isDetailedView ? 'translate-x-6' : 'translate-x-0'}`}
                />
              </button>
            </div>
            <Link
              to="/accounts/new"
              className="inline-flex items-center justify-center rounded-full border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-200 transition hover:border-emerald-400 hover:bg-emerald-500/20"
            >
              <svg className="mr-2 h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 010 2h-5v5a1 1 0 01-2 0v-5H4a1 1 0 011-1z" clipRule="evenodd" />
              </svg>
              Добавить аккаунт
            </Link>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="flex items-center gap-4 rounded-2xl border border-slate-700 bg-slate-800 p-5">
            <div className={`flex h-14 w-14 items-center justify-center rounded-full ${
              overallStatus === 'up'
                ? 'bg-emerald-900/40 text-emerald-300'
                : overallStatus === 'warning'
                  ? 'bg-amber-900/40 text-amber-200'
                  : 'bg-red-900/40 text-red-300'
            }`}>
              {overallStatus === 'up' ? (
                <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              ) : overallStatus === 'warning' ? (
                <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v4m0 4h.01M10.29 3.86l-7 12A1 1 0 004 17h16a1 1 0 00.87-1.5l-7-12a1 1 0 00-1.74 0z" />
                </svg>
              ) : (
                <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-400">Общий статус</p>
              <p className="text-xl font-semibold text-white">
                {overallStatus === 'up'
                  ? 'Все сервисы стабильны'
                  : overallStatus === 'warning'
                    ? 'Обнаружены предупреждения'
                    : 'Обнаружены инциденты'}
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-700 bg-slate-800 p-5 text-center">
            <p className="text-sm font-semibold text-slate-400">Последнее обновление</p>
            <p className="mt-2 text-3xl font-semibold text-white">{formattedLastUpdate}</p>
          </div>

          <div className="rounded-2xl border border-slate-700 bg-slate-800 p-5">
            <p className="text-sm font-semibold text-slate-400">Период</p>
            <div className="mt-3">
              <select
                value={selectedPeriod}
                onChange={(e) => setSelectedPeriod(Number(e.target.value))}
                className="w-full rounded-xl border border-slate-600 bg-slate-900/60 px-4 py-2 text-sm font-medium text-slate-100 focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                <option value={1}>1 час</option>
                <option value={3}>3 часа</option>
                <option value={6}>6 часов</option>
                <option value={24}>24 часа</option>
                <option value={168}>7 дней</option>
                <option value={720}>30 дней</option>
              </select>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <h2 className="text-2xl font-semibold text-white">Среднее время ответа API</h2>
            <p className="text-sm text-slate-400">Период анализа: {selectedPeriod}ч</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {[
              { key: 'GET', label: 'API (GET)', value: getResponseTime },
              { key: 'POST', label: 'API (POST)', value: postResponseTime }
            ].map(({ key, label, value }) => (
              <div
                key={key}
                className="rounded-2xl border border-slate-700 bg-slate-800/80 p-6 shadow-lg shadow-black/10 transition hover:border-emerald-400/60"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs uppercase tracking-[0.2em] text-slate-400">{key}</span>
                  <span className="text-sm text-slate-500">{label}</span>
                </div>
                <div className="mt-4 flex items-end gap-2">
                  <span className="text-4xl font-semibold text-white">{formatResponseTime(value) || '0.000'}</span>
                  <span className="pb-1 text-sm text-slate-400">сек</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-5">
          <div className="hidden gap-4 md:grid md:grid-cols-2 lg:grid-cols-3">
            {serviceConfigs.map((config) => {
              const serviceStatus = status?.[config.key] || { status: 'unknown', responseTime: null };
              const serviceStats = stats?.[config.key] || {};

              return (
                <ServiceCard
                  key={config.key}
                  checkType={config.key}
                  label={config.name}
                  data={{
                    status: serviceStatus.status,
                    responseTime: serviceStatus.responseTime,
                    errorMessage: serviceStatus.errorMessage,
                    httpStatus: serviceStatus.httpStatus,
                    reason: serviceStatus.reason,
                    since: serviceStatus.since
                  }}
                  stats={serviceStats}
                  view={detailMode}
                />
              );
            })}
          </div>

          <div className="space-y-3 md:hidden">
            <h3 className="text-lg font-semibold text-white">Статусы сервисов</h3>
            {serviceConfigs.map((config) => {
              const serviceStatus = status?.[config.key] || { status: 'unknown' };
              const isUp = serviceStatus.status === 'up';
              const isWarning = serviceStatus.status === 'warning';
              const isDown = serviceStatus.status === 'down';
              const serviceStats = stats?.[config.key] || {};
              const mobileResponseTime = serviceStatus.responseTime ? formatResponseTime(serviceStatus.responseTime) : null;
              const badgeLabel = isUp ? 'ОК' : isDown ? 'СБОЙ' : isWarning ? 'ВНИМ' : 'Н/Д';
              const badgeTone = isUp
                ? 'text-emerald-200'
                : isDown
                  ? 'text-red-200'
                  : isWarning
                    ? 'text-amber-200'
                    : 'text-slate-200';
              const uptimeValue = serviceStats.uptime !== undefined && serviceStats.uptime !== null
                ? formatUptime(serviceStats.uptime)
                : '—';
              const successRateValue = serviceStats.successRate !== undefined && serviceStats.successRate !== null
                ? formatPercentage(serviceStats.successRate)
                : '—';
              const latencyValue = serviceStats.avgResponseTime !== undefined && serviceStats.avgResponseTime !== null
                ? `${formatResponseTime(serviceStats.avgResponseTime)} сек`
                : '—';

              return (
                <div
                  key={`mobile-${config.key}`}
                  className={`flex flex-col gap-3 rounded-2xl border px-4 py-4 ${
                    isUp
                      ? 'border-emerald-600 bg-emerald-900/30 text-emerald-100'
                      : isDown
                        ? 'border-red-700 bg-red-900/30 text-red-100'
                        : isWarning
                          ? 'border-amber-600 bg-amber-900/30 text-amber-100'
                          : 'border-slate-600 bg-slate-800 text-slate-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm uppercase tracking-wide text-slate-200">{config.name}</p>
                      <p className="text-xs text-slate-400">{mobileResponseTime ? `Ping ${mobileResponseTime} сек` : 'Нет данных'}</p>
                    </div>
                    <span className={`text-lg font-semibold ${badgeTone}`}>
                      {badgeLabel}
                    </span>
                  </div>
                  {!isDetailedView ? (
                    <div className="text-xs text-slate-300">
                      {serviceStatus.status === 'unknown'
                        ? 'Нет актуальной телеметрии'
                        : mobileResponseTime
                          ? `Latency ${mobileResponseTime} сек`
                          : 'Нет данных о задержке'}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-slate-600/60 bg-slate-900/40 p-3 text-xs text-slate-300">
                      <div className="flex items-center justify-between border-b border-slate-700/60 pb-2">
                        <span>Uptime</span>
                        <span className="font-mono text-slate-100">{uptimeValue}</span>
                      </div>
                      <div className="flex items-center justify-between border-b border-slate-700/60 py-2">
                        <span>Success Rate</span>
                        <span className="font-mono text-slate-100">{successRateValue}</span>
                      </div>
                      <div className="flex items-center justify-between pt-2">
                        <span>Latency</span>
                        <span className="font-mono text-slate-100">{latencyValue}</span>
                      </div>
                    </div>
                  )}
                  {serviceStatus.errorMessage && (
                    <div className={`text-xs ${
                      isDown
                        ? 'text-red-200'
                        : isWarning
                          ? 'text-amber-200'
                          : 'text-slate-300'
                    }`}>
                      {serviceStatus.errorMessage}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {Object.keys(historyData).length > 0 && (
          <section className="hidden md:block">
            <div className="rounded-2xl border border-slate-700 bg-slate-800 p-6 shadow-lg shadow-black/20">
              <h3 className="text-xl font-semibold text-white">График времени ответа</h3>
              <p className="text-sm text-slate-400">Актуальные данные из Chart.js</p>
              <div className="mt-6">
                <ResponseTimeChart
                  data={historyData}
                  colors={CHECK_TYPE_COLORS}
                  labels={CHECK_TYPE_LABELS}
                />
              </div>
            </div>
          </section>
        )}

        <section>
          <IncidentHistory incidents={incidents} />
        </section>

        <footer className="pb-4 text-center text-sm text-slate-500">
          Мониторинг работает в режиме реального времени
        </footer>
      </div>
    </div>
  );
};

HealthMonitorDashboardWithData.propTypes = {
  status: PropTypes.object,
  stats: PropTypes.object,
  lastUpdate: PropTypes.instanceOf(Date),
  incidents: PropTypes.array,
  clients: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string.isRequired,
    label: PropTypes.string,
    environment: PropTypes.string,
    tags: PropTypes.arrayOf(PropTypes.string)
  })),
  selectedClientId: PropTypes.string,
  onClientChange: PropTypes.func
};

HealthMonitorDashboardWithData.defaultProps = {
  status: null,
  stats: null,
  lastUpdate: null,
  incidents: [],
  clients: [],
  selectedClientId: null,
  onClientChange: null
};

export default HealthMonitorDashboardWithData;

