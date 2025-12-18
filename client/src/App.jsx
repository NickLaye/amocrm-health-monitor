import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import HealthMonitorDashboardWithData from './components/HealthMonitorDashboard/HealthMonitorDashboardWithData';
import ErrorBoundary from './components/ErrorBoundary';
import LoadingSpinner from './components/LoadingSpinner';
import { useMonitoring } from './hooks/useMonitoring';
import AddAccountPage from './pages/AddAccountPage';

/**
 * DashboardScreen — прежняя логика приложения с данными мониторинга.
 */
function DashboardScreen() {
  const {
    status,
    stats,
    incidents,
    loading,
    error,
    lastUpdate,
    clients,
    selectedClientId,
    changeClient
  } = useMonitoring();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center px-6">
        <div className="text-center bg-slate-800 border border-slate-700 rounded-2xl px-8 py-10 shadow-lg shadow-black/30">
          <LoadingSpinner />
          <p className="text-slate-200 mt-4 text-lg font-medium">Загрузка данных мониторинга...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center px-4">
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-8 max-w-md w-full text-center shadow-2xl shadow-black/40">
          <div className="w-16 h-16 bg-red-900/40 border border-red-700 rounded-full flex items-center justify-center mx-auto mb-5">
            <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">Ошибка загрузки данных</h2>
          <p className="text-slate-400 mb-6">{error}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="w-full bg-slate-700 text-slate-100 px-6 py-3 rounded-lg font-medium hover:bg-slate-600 transition-colors duration-150"
          >
            Обновить страницу
          </button>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <HealthMonitorDashboardWithData
        status={status}
        stats={stats}
        lastUpdate={lastUpdate}
        incidents={incidents}
        clients={clients}
        selectedClientId={selectedClientId}
        onClientChange={changeClient}
      />
    </ErrorBoundary>
  );
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<DashboardScreen />} />
      <Route path="/accounts/new" element={<AddAccountPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;

