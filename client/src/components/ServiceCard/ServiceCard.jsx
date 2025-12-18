import React, { useMemo } from 'react';
import PropTypes from 'prop-types';
import {
  formatResponseTime,
  formatUptime,
  formatPercentage
} from '../../utils/formatters';

const statusStyles = {
  up: 'border border-emerald-500/60 bg-emerald-900/30 text-emerald-100',
  warning: 'border border-amber-500/70 bg-amber-900/30 text-amber-100',
  down: 'border border-red-600 bg-red-900/40 text-red-100',
  unknown: 'border border-slate-600 bg-slate-800 text-slate-200'
};

const statusLabels = {
  up: 'ОК',
  warning: 'ВНИМ',
  down: 'СБОЙ',
  unknown: 'Н/Д'
};

const MetricRow = React.memo(({ label, value }) => (
  <div className="flex items-center justify-between border-b border-slate-700/50 py-1 last:border-0">
    <span className="text-sm text-slate-400">{label}</span>
    <span className="text-sm font-mono font-medium text-slate-200">{value}</span>
  </div>
));

MetricRow.displayName = 'MetricRow';

MetricRow.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired
};

const ServiceCard = React.memo(({ checkType, label, data, stats, view = 'compact' }) => {
  const formattedResponseTime = useMemo(() => {
    if (data.responseTime === null || data.responseTime === undefined) {
      return null;
    }
    return formatResponseTime(data.responseTime);
  }, [data.responseTime]);

  const hasUptime = stats && stats.uptime !== undefined && stats.uptime !== null;
  const hasSuccessRate = stats && stats.successRate !== undefined && stats.successRate !== null;
  const hasLatency = stats && stats.avgResponseTime !== undefined && stats.avgResponseTime !== null;

  const uptimeValue = hasUptime ? formatUptime(stats.uptime) : '—';
  const successRateValue = hasSuccessRate ? formatPercentage(stats.successRate) : '—';
  const latencyValue = hasLatency ? `${formatResponseTime(stats.avgResponseTime)} сек` : '—';

  const detailMetrics = [
    { label: 'Uptime', value: uptimeValue },
    { label: 'Success Rate', value: successRateValue },
    { label: 'Latency', value: latencyValue }
  ];

  const badgeSizeClasses = view === 'compact' ? 'px-4 py-1.5 text-base' : 'px-3 py-1 text-xs';
  const responseValueClasses = view === 'compact'
    ? 'font-mono text-2xl font-semibold text-white'
    : 'text-3xl font-semibold text-white';

  return (
    <div className="flex h-full flex-col gap-4 rounded-2xl border border-slate-700 bg-slate-800 p-5 shadow-md shadow-black/20">
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="text-xs uppercase tracking-[0.25em] text-slate-500">{checkType}</span>
          <h3 className="text-lg font-semibold text-white">{label}</h3>
        </div>
        <span className={`${statusStyles[data.status] ?? statusStyles.unknown} rounded-full font-semibold uppercase tracking-wide ${badgeSizeClasses}`}>
          {statusLabels[data.status] || statusLabels.unknown}
        </span>
      </div>

      <div className="rounded-xl border border-slate-700/70 bg-slate-900/30 p-4">
        <p className="text-xs uppercase tracking-wide text-slate-400">Ping</p>
        <div className="mt-1 flex items-baseline gap-2">
          <span className={responseValueClasses}>{formattedResponseTime ?? '—'}</span>
          <span className="text-sm text-slate-500">сек</span>
        </div>
      </div>

      {view === 'detailed' && (
        <div className="rounded-xl border border-slate-700/60 bg-slate-900/20 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">Метрики</p>
          <div className="mt-3">
            {detailMetrics.map((metric) => (
              <MetricRow key={metric.label} label={metric.label} value={metric.value} />
            ))}
          </div>
        </div>
      )}

      {data.errorMessage && (
        <div
          className={`rounded-xl p-3 text-sm ${
            data.status === 'down'
              ? 'border border-red-800 bg-red-950/60 text-red-200'
              : data.status === 'warning'
                ? 'border border-amber-600 bg-amber-950/40 text-amber-100'
                : 'border border-slate-800 bg-slate-900/50 text-slate-200'
          }`}
        >
          {data.errorMessage}
        </div>
      )}
    </div>
  );
});

ServiceCard.propTypes = {
  checkType: PropTypes.string.isRequired,
  label: PropTypes.string.isRequired,
  data: PropTypes.shape({
    status: PropTypes.oneOf(['up', 'warning', 'down', 'unknown']).isRequired,
    responseTime: PropTypes.number,
    errorMessage: PropTypes.string,
    httpStatus: PropTypes.number,
    reason: PropTypes.string,
    since: PropTypes.number
  }).isRequired,
  stats: PropTypes.shape({
    uptime: PropTypes.number,
    successRate: PropTypes.number,
    avgResponseTime: PropTypes.number
  }),
  view: PropTypes.oneOf(['compact', 'detailed'])
};

ServiceCard.displayName = 'ServiceCard';

export default ServiceCard;
