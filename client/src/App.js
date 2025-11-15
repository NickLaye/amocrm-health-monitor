import React from 'react';
import './App.css';
import Dashboard from './components/Dashboard';
import IncidentHistory from './components/IncidentHistory';
import ErrorBoundary from './components/ErrorBoundary';
import ThemeToggle from './components/ThemeToggle';
import { useMonitoring } from './hooks/useMonitoring';

function App() {
  const { status, stats, incidents, loading, error, lastUpdate } = useMonitoring();

  if (loading) {
    return (
      <div className="App">
        <div className="loading">
          <div className="spinner"></div>
          <p>Загрузка данных мониторинга...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="App">
        <div className="error-container">
          <div className="error-icon">⚠️</div>
          <h2>Ошибка загрузки данных</h2>
          <p>{error}</p>
          <button onClick={() => window.location.reload()}>Обновить страницу</button>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="App">
        <ThemeToggle />
        <header className="App-header">
          <h1>amoCRM Health Monitor</h1>
        </header>

        <main className="App-main">
          <Dashboard status={status} stats={stats} lastUpdate={lastUpdate} />
          <IncidentHistory incidents={incidents} />
        </main>

        <footer className="App-footer">
          <p>Мониторинг работает в режиме реального времени</p>
        </footer>
      </div>
    </ErrorBoundary>
  );
}

export default App;

