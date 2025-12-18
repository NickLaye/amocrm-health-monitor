import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import HealthMonitorDashboardWithData from '../components/HealthMonitorDashboard/HealthMonitorDashboardWithData';
import api from '../services/api';

// Mock dependencies
vi.mock('../services/api');
vi.mock('../components/ResponseTimeChart', () => ({
    default: () => <div data-testid="response-time-chart">Response Time Chart</div>
}));
vi.mock('../components/ServiceCard', () => ({
    default: ({ label, data }) => (
        <div data-testid="service-card">
            {label}: {data.status}
        </div>
    )
}));
vi.mock('../components/IncidentHistory', () => ({
    default: ({ incidents }) => (
        <div data-testid="incident-history">Incidents: {incidents.length}</div>
    )
}));

describe('HealthMonitorDashboardWithData', () => {
    const mockClients = [
        { id: 'client1', label: 'Client 1', environment: 'PROD', tags: ['crm'] },
        { id: 'client2', label: 'Client 2', environment: 'DEV' }
    ];

    const mockStatus = {
        GET: { status: 'up', responseTime: 120 },
        POST: { status: 'up', responseTime: 150 }
    };

    const mockStats = {
        GET: { averageResponseTime: 120, uptime: 100 },
        POST: { averageResponseTime: 150, uptime: 99.9 }
    };

    beforeEach(() => {
        vi.clearAllMocks();
        api.getHistory.mockResolvedValue([]);
    });

    const renderComponent = (props = {}) => {
        return render(
            <BrowserRouter>
                <HealthMonitorDashboardWithData
                    clients={mockClients}
                    selectedClientId="client1"
                    status={mockStatus}
                    stats={mockStats}
                    lastUpdate={new Date()}
                    incidents={[]}
                    {...props}
                />
            </BrowserRouter>
        );
    };

    it('renders dashboard with client selector', () => {
        renderComponent();
        expect(screen.getByText('AmoPulse Monitor')).toBeInTheDocument();
        expect(screen.getByText('Client 1')).toBeInTheDocument();
    });

    it('renders service cards for all services', () => {
        renderComponent();
        const cards = screen.getAllByTestId('service-card');
        expect(cards.length).toBeGreaterThan(0);
        expect(screen.getByText('API (GET): up')).toBeInTheDocument();
    });

    it('calls onClientChange when different client is selected', () => {
        const onClientChange = vi.fn();
        renderComponent({ onClientChange });

        // Select by clicking card
        const client2Button = screen.getByText('Client 2').closest('button');
        fireEvent.click(client2Button);

        expect(onClientChange).toHaveBeenCalledWith('client2');
    });

    it('fetches history data on mount', async () => {
        renderComponent();
        await waitFor(() => {
            expect(api.getHistory).toHaveBeenCalledWith(null, 24, 'client1');
        });
    });

    it('renders overall status correctly', () => {
        renderComponent();
        expect(screen.getByText('Все сервисы стабильны')).toBeInTheDocument();
    });

    it('handles warning status correctly', () => {
        const warningStatus = {
            ...mockStatus,
            GET: { status: 'warning', responseTime: 5000 }
        };
        renderComponent({ status: warningStatus });
        expect(screen.getByText('Обнаружены предупреждения')).toBeInTheDocument();
    });

    it('handles down status correctly', () => {
        const downStatus = {
            ...mockStatus,
            GET: { status: 'down', errorMessage: 'Timeout' }
        };
        renderComponent({ status: downStatus });
        expect(screen.getByText('Обнаружены инциденты')).toBeInTheDocument();
    });
});
