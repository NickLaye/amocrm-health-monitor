import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import IncidentHistory from '../IncidentHistory.jsx';

let incidentId = 0;
const baseTimestamp = new Date('2024-01-01T00:00:00Z').getTime();
const buildIncident = (overrides = {}) => {
  const currentId = incidentId++;
  const baseIncident = {
    id: `incident-${currentId}`,
    check_type: 'GET',
    start_time: baseTimestamp + currentId * 60000,
    end_time: baseTimestamp + currentId * 60000 + 300000,
    duration: 300000,
    details: 'Инцидент',
  };

  return { ...baseIncident, ...overrides };
};

describe('IncidentHistory', () => {
  it('показывает заглушку при отсутствии данных', () => {
    render(<IncidentHistory incidents={[]} />);
    expect(
      screen.getByText('Отличная новость! За последнее время инцидентов не обнаружено.')
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /показать (?:еще|ещё)/i })).not.toBeInTheDocument();
  });

  it('отображает таблицу и переключает показ всех инцидентов', async () => {
    const user = userEvent.setup();
    const incidents = Array.from({ length: 11 }, (_, idx) =>
      buildIncident({
        id: `incident-${idx}`,
        end_time:
          idx % 3 === 0
            ? null
            : baseTimestamp + idx * 60000 + 120000,
        duration: idx % 3 === 0 ? null : 120000,
        details: `Инцидент №${idx + 1}`,
      })
    );

    render(<IncidentHistory incidents={incidents} />);

    const body = screen.getByTestId('incident-rows');
    expect(body.querySelectorAll('tr')).toHaveLength(10);

    const toggleButton = screen.getByRole('button', { name: /показать (?:еще|ещё)/i });
    await user.click(toggleButton);

    expect(toggleButton).toHaveTextContent('Показать меньше');
    expect(body.querySelectorAll('tr')).toHaveLength(11);
    expect(screen.getAllByText(/В процессе/).length).toBeGreaterThan(0);
  });
});


