import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import LoadingSpinner from '../../LoadingSpinner.jsx';

describe('LoadingSpinner', () => {
  it('показывает сообщение по умолчанию', () => {
    render(<LoadingSpinner />);
    expect(screen.getByText('Загрузка...')).toBeInTheDocument();
  });

  it('поддерживает кастомный текст и размер', () => {
    render(<LoadingSpinner message="Обновляем данные" size="large" />);
    const message = screen.getByText('Обновляем данные');
    const container = message.closest('.loading-spinner-container');
    expect(container).toHaveClass('loading-spinner-large');
  });

  it('не рендерит сообщение, если текст пустой', () => {
    render(<LoadingSpinner message="" />);
    expect(screen.queryByText('Загрузка...')).not.toBeInTheDocument();
  });
});


