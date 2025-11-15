import React from 'react';
import './App.css';
import HealthMonitorDashboardWithData from './components/HealthMonitorDashboard/HealthMonitorDashboardWithData';
import ErrorBoundary from './components/ErrorBoundary';
import LoadingSpinner from './components/LoadingSpinner';
import { useMonitoring } from './hooks/useMonitoring';

/**
 * App - Интегрированная версия с новым pixel-perfect дизайном и реальными данными
 * 
 * Использование:
 * 1. Переименуйте текущий App.js в App.old.js
 * 2. Переименуйте этот файл в App.js
 * 3. Запустите npm start
 */
function App() {
  const { status, stats, incidents, loading, error, lastUpdate } = useMonitoring();

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#7B5FE8] to-[#9B6BE8] flex items-center justify-center">
        <div className="text-center">
          <LoadingSpinner />
          <p className="text-white mt-4 text-lg">Загрузка данных мониторинга...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#7B5FE8] to-[#9B6BE8] flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-card p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-[#111827] mb-2">Ошибка загрузки данных</h2>
          <p className="text-[#6B7280] mb-6">{error}</p>
          <button 
            onClick={() => window.location.reload()}
            className="bg-gradient-to-r from-[#7C3AED] to-[#8B5CF6] text-white px-6 py-3 rounded-lg font-medium hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5"
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
      />
    </ErrorBoundary>
  );
}

export default App;

