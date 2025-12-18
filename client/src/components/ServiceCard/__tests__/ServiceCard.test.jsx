import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import ServiceCard from '../ServiceCard.jsx';
import { formatResponseTime, formatUptime } from '../../../utils/formatters.js';

const baseData = {
  status: 'up',
  responseTime: 250,
  errorMessage: 'Timeout при обращении к API'
};

const stats = {
  uptime: 99.5,
  availability: 99.1,
  totalChecks: 24500,
  successRate: 98.7,
  avgResponseTime: 420,
  minResponseTime: 200,
  maxResponseTime: 1200,
  p95ResponseTime: 800,
  p99ResponseTime: 1100,
  mttr: 45,
  mtbf: 120,
  incidentCount: 3,
  lastIncident: Date.now(),
  apdexScore: 0.45
};

describe('ServiceCard', () => {
  it('отображает метрики в компактном режиме', () => {
    render(
      <ServiceCard
        checkType="GET"
        label="API (GET)"
        data={baseData}
        stats={stats}
        view="compact"
      />
    );

    expect(screen.getByText('API (GET)')).toBeInTheDocument();
    expect(screen.getByText('ОК')).toBeInTheDocument();
    expect(screen.getByText('Ping')).toBeInTheDocument();
    expect(
      screen.getByText(formatResponseTime(baseData.responseTime))
    ).toBeInTheDocument();
    expect(screen.getByText(baseData.errorMessage)).toBeInTheDocument();
  });

  it('показывает расширенные блоки в detailed режиме', () => {
    render(
      <ServiceCard
        checkType="GET"
        label="API (GET)"
        data={baseData}
        stats={stats}
        view="detailed"
      />
    );

    expect(screen.getByText('Метрики')).toBeInTheDocument();
    expect(screen.getByText('Uptime')).toBeInTheDocument();
    expect(screen.getByText('Success Rate')).toBeInTheDocument();
    expect(screen.getByText('Latency')).toBeInTheDocument();
  });
});


