import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import AddAccountPage from '../../pages/AddAccountPage.jsx';

const mockedNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockedNavigate,
  };
});

vi.mock('../../services/api.js', () => ({
  __esModule: true,
  default: {
    createAccount: vi.fn(),
  },
}));

import api from '../../services/api.js';

function renderPage() {
  return render(
    <MemoryRouter>
      <AddAccountPage />
    </MemoryRouter>
  );
}

describe('AddAccountPage', () => {
  beforeEach(() => {
    mockedNavigate.mockReset();
    api.createAccount.mockReset();
    // Mock successful API response
    api.createAccount.mockResolvedValue({ success: true });
  });

  it('показывает ошибки валидации для обязательных полей', async () => {
    renderPage();

    fireEvent.submit(screen.getByRole('button', { name: /сохранить аккаунт/i }));

    const errors = await screen.findAllByText('Обязательное поле');
    expect(errors.length).toBeGreaterThan(0);
    expect(api.createAccount).not.toHaveBeenCalled();
  });

  it('отправляет данные при валидной форме и редиректит на дашборд', async () => {
    renderPage();
    const user = userEvent.setup();

    const [clientIdInput, amoClientIdInput] = screen.getAllByLabelText(/client id \*/i);
    await user.type(clientIdInput, 'client-01');
    await user.type(screen.getByLabelText(/отображаемое имя/i), 'Client 01');
    await user.type(screen.getByLabelText(/поддомен amocrm/i), 'client01.amocrm.ru');
    await user.type(amoClientIdInput, 'amo-client');
    await user.type(screen.getByLabelText(/client secret \*/i), 'secret');
    await user.type(screen.getByLabelText(/redirect uri/i), 'https://example.com/callback');
    await user.type(screen.getByLabelText(/access token/i), 'access-token');
    await user.type(screen.getByLabelText(/refresh token/i), 'refresh-token');
    await user.type(screen.getByLabelText(/mattermost webhook url/i), 'https://mattermost.example.com/hook');
    await user.type(screen.getByLabelText(/mattermost канал/i), 'alerts');

    await user.click(screen.getByRole('button', { name: /сохранить аккаунт/i }));

    await waitFor(() => expect(api.createAccount).toHaveBeenCalledTimes(1));
    expect(api.createAccount.mock.calls[0][0]).toMatchObject({
      clientId: 'client-01',
      mattermostChannel: 'alerts',
    });
    // navigate is called after setTimeout 1200ms in the component
    await waitFor(() => expect(mockedNavigate).toHaveBeenCalledWith('/'), { timeout: 2000 });
  });
});

