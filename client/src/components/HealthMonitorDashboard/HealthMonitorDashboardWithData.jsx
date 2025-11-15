import React, { useMemo } from 'react';
import PropTypes from 'prop-types';
import { formatResponseTime, formatUptime } from '../../utils/formatters';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

/**
 * HealthMonitorDashboardWithData - Pixel-perfect компонент с реальными данными
 * @param {object} status - Текущий статус всех сервисов
 * @param {object} stats - Статистика всех сервисов  
 * @param {Date} lastUpdate - Время последнего обновления
 */
const HealthMonitorDashboardWithData = ({ status, stats, lastUpdate }) => {
  // Вычисляем общий статус
  const overallStatus = useMemo(() => {
    if (!status) {
      return 'unknown';
    }
    const statuses = Object.values(status);
    const hasDown = statuses.some(s => s.status === 'down');
    return hasDown ? 'down' : 'up';
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

  // Данные сервисов
  const services = useMemo(() => {
    const serviceConfigs = [
      { key: 'GET', name: 'API (GET)' },
      { key: 'POST', name: 'API (POST)' },
      { key: 'WEB', name: 'Веб-интерфейс' },
      { key: 'HOOK', name: 'Вебхуки' },
      { key: 'DP', name: 'Digital Pipeline' }
    ];

    return serviceConfigs.map(config => {
      const serviceStatus = status?.[config.key] || { status: 'unknown', responseTime: null };
      const serviceStats = stats?.[config.key] || { uptime: 0, totalChecks: 0 };
      
      const responseTime = serviceStatus.responseTime 
        ? formatResponseTime(serviceStatus.responseTime) 
        : '0.000';
      
      const isHighResponseTime = serviceStatus.responseTime && serviceStatus.responseTime > 700;

      return {
        name: config.name,
        status: serviceStatus.status,
        responseTime,
        uptime: formatUptime(serviceStats.uptime),
        checks: serviceStats.totalChecks || 0,
        highlight: isHighResponseTime
      };
    });
  }, [status, stats]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#7B5FE8] to-[#9B6BE8] px-4 py-6 md:px-6 md:py-8">
      {/* Main Container */}
      <div className="max-w-[1240px] mx-auto">
        {/* Page Title */}
        <h1 className="text-white text-2xl font-semibold text-center mb-8">
          amoCRM Health Monitor
        </h1>

        {/* Top Status Row - 3 cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {/* Card 1: Overall Status */}
          <div className="bg-white rounded-2xl shadow-card p-6 flex items-center gap-4 transition-all duration-200 hover:shadow-card-hover hover:-translate-y-0.5">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${
              overallStatus === 'up' ? 'bg-success-bg' : 'bg-red-100'
            }`}>
              {overallStatus === 'up' ? (
                <svg className="w-6 h-6 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
            </div>
            <div className="flex-1">
              <div className="text-[#111827] font-bold text-base leading-tight">Общий статус</div>
              <div className="text-[#6B7280] text-sm leading-tight mt-1">
                {overallStatus === 'up' ? 'Все сервисы работают' : 'Обнаружены проблемы'}
              </div>
            </div>
          </div>

          {/* Card 2: Last Updated */}
          <div className="bg-white rounded-2xl shadow-card p-6 flex flex-col justify-center items-center transition-all duration-200 hover:shadow-card-hover hover:-translate-y-0.5">
            <div className="text-[#6B7280] text-[13px] mb-1.5">Последнее обновление</div>
            <div className="text-[#111827] text-2xl font-semibold">{formattedLastUpdate}</div>
          </div>

          {/* Card 3: Period Selector */}
          <div className="bg-white rounded-2xl shadow-card p-6 flex items-center justify-between gap-4 transition-all duration-200 hover:shadow-card-hover hover:-translate-y-0.5">
            <div className="text-[#111827] font-semibold text-base">Период:</div>
            <div className="relative flex-1 max-w-[160px]">
              <select className="w-full appearance-none bg-white border border-gray-200 rounded-lg px-4 py-2 pr-10 text-[#111827] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-purple-accent focus:border-transparent cursor-pointer transition-colors hover:border-gray-300">
                <option>24 часа</option>
                <option>7 дней</option>
                <option>30 дней</option>
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                <svg className="w-5 h-5 text-[#6B7280]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Section: Average Response Time API */}
        <section className="mb-8">
          <h2 className="text-white text-xl font-semibold mb-4">Среднее время ответа API</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* GET Card */}
            <div className="bg-gradient-to-br from-[#E9D5FF] to-[#DDD6FE] rounded-xl shadow-card p-6 h-32 flex flex-col justify-between transition-all duration-200 hover:shadow-card-hover hover:-translate-y-0.5">
              <div className="inline-flex items-center justify-center bg-white/60 rounded-full px-3 py-1 text-xs font-semibold text-[#7C3AED] uppercase self-start">
                GET
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-[32px] font-bold text-[#111827] leading-none">
                  {formatResponseTime(getResponseTime * 1000) || '0.000'}
                </span>
                <span className="text-base text-[#6B7280] leading-none">сек</span>
              </div>
            </div>

            {/* POST Card */}
            <div className="bg-gradient-to-br from-[#E9D5FF] to-[#DDD6FE] rounded-xl shadow-card p-6 h-32 flex flex-col justify-between transition-all duration-200 hover:shadow-card-hover hover:-translate-y-0.5">
              <div className="inline-flex items-center justify-center bg-white/60 rounded-full px-3 py-1 text-xs font-semibold text-[#7C3AED] uppercase self-start">
                POST
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-[32px] font-bold text-[#111827] leading-none">
                  {formatResponseTime(postResponseTime * 1000) || '0.000'}
                </span>
                <span className="text-base text-[#6B7280] leading-none">сек</span>
              </div>
            </div>
          </div>
        </section>

        {/* Section: Per-Service Metrics */}
        <section className="mb-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {services.map((service, index) => (
              <div 
                key={index}
                className={`bg-white rounded-xl shadow-card p-5 flex flex-col gap-3 transition-all duration-200 hover:shadow-card-hover hover:-translate-y-0.5 ${
                  service.highlight ? 'relative overflow-hidden' : ''
                }`}
              >
                {service.highlight && (
                  <div className="absolute inset-0 bg-gradient-to-br from-amber-50/40 to-transparent pointer-events-none"></div>
                )}
                <div className="relative flex items-start justify-between gap-2">
                  <h3 className="text-[#111827] font-semibold text-[15px] leading-tight flex-1">
                    {service.name}
                  </h3>
                  <span className={`inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide flex-shrink-0 ${
                    service.status === 'up' 
                      ? 'bg-success-bg text-success' 
                      : service.status === 'down'
                        ? 'bg-red-100 text-red-600'
                        : 'bg-gray-100 text-gray-600'
                  }`}>
                    {service.status === 'up' ? 'UP' : service.status === 'down' ? 'DOWN' : 'N/A'}
                  </span>
                </div>
                
                <div className="relative space-y-2">
                  {/* Response Time */}
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-[13px] text-[#6B7280]">Время ответа:</span>
                    <div className="flex items-baseline gap-1">
                      <span className="text-[22px] font-semibold text-[#111827] leading-none">
                        {service.responseTime}
                      </span>
                      <span className="text-[13px] text-[#6B7280] leading-none">сек</span>
                    </div>
                  </div>
                  
                  {/* Uptime */}
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-[13px] text-[#6B7280]">Uptime:</span>
                    <span className="text-[15px] font-semibold text-[#111827]">{service.uptime}</span>
                  </div>
                  
                  {/* Checks */}
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-[13px] text-[#6B7280]">Проверок:</span>
                    <span className="text-[15px] font-semibold text-[#111827]">{service.checks}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Section: Response Time Chart */}
        <section className="mb-8">
          <div className="bg-white rounded-2xl shadow-card p-6 transition-all duration-200 hover:shadow-card-hover hover:-translate-y-0.5">
            <h3 className="text-[#111827] text-xl font-semibold mb-6">График времени ответа</h3>
            
            {/* Chart Placeholder */}
            <div className="relative h-80 bg-[#F3F4F6] rounded-lg mb-6 flex items-center justify-center">
              {/* Placeholder for chart */}
              <div className="absolute inset-0 flex items-end justify-around px-8 pb-12">
                {/* Sample chart bars visualization */}
                {[65, 45, 70, 55, 80, 50, 75, 60, 85, 55, 70, 65].map((height, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <div 
                      className="w-full bg-gradient-to-t from-purple-accent to-purple-light rounded-t-sm transition-all"
                      style={{ height: `${height}%` }}
                    ></div>
                  </div>
                ))}
              </div>
              
              {/* Y-axis label */}
              <div className="absolute left-2 top-2 text-xs text-[#6B7280] font-medium">
                Время ответа (сек)
              </div>
            </div>

            {/* Chart Legend */}
            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 pt-4 border-t border-gray-100">
              {[
                { name: 'Digital Pipeline', color: '#F59E0B' },
                { name: 'API (POST)', color: '#8B5CF6' },
                { name: 'API (GET)', color: '#7C3AED' },
                { name: 'Вебхуки', color: '#6366F1' },
                { name: 'Веб-интерфейс', color: '#3B82F6' }
              ].map((item, index) => (
                <div key={index} className="flex items-center gap-2">
                  <div 
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: item.color }}
                  ></div>
                  <span className="text-sm text-[#6B7280]">{item.name}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Section: Incident History */}
        <section className="mb-8">
          <div className="bg-white rounded-2xl shadow-card p-8 flex flex-col items-center justify-center text-center transition-all duration-200 hover:shadow-card-hover hover:-translate-y-0.5">
            <h3 className="text-[#111827] text-xl font-semibold mb-6 self-start">История инцидентов</h3>
            
            <div className="flex flex-col items-center gap-4 py-6">
              <div className="w-16 h-16 rounded-full bg-success-bg flex items-center justify-center">
                <svg className="w-8 h-8 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              
              <p className="text-[#111827] text-base max-w-md">
                Отличная новость! За последнее время инцидентов не обнаружено.
              </p>
            </div>
          </div>
        </section>

        {/* Footer Status Line */}
        <div className="text-center text-white/80 text-sm py-4">
          Мониторинг работает в режиме реального времени
        </div>
      </div>
    </div>
  );
};

HealthMonitorDashboardWithData.propTypes = {
  status: PropTypes.object,
  stats: PropTypes.object,
  lastUpdate: PropTypes.instanceOf(Date)
};

HealthMonitorDashboardWithData.defaultProps = {
  status: null,
  stats: null,
  lastUpdate: null
};

export default HealthMonitorDashboardWithData;

