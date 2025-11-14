import React from 'react';
import './LoadingSpinner.css';

/**
 * LoadingSpinner - Анимированный индикатор загрузки
 * @param {string} message - Текст сообщения (опционально)
 * @param {string} size - Размер: 'small', 'medium', 'large'
 */
const LoadingSpinner = ({ message = 'Загрузка...', size = 'medium' }) => {
  return (
    <div className={`loading-spinner-container loading-spinner-${size}`}>
      <div className="loading-spinner">
        <div className="spinner-ring"></div>
        <div className="spinner-ring"></div>
        <div className="spinner-ring"></div>
      </div>
      {message && (
        <p className="loading-message">{message}</p>
      )}
    </div>
  );
};

export default LoadingSpinner;

