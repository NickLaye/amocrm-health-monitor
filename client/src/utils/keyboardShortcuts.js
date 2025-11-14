/**
 * Keyboard shortcuts для навигации и управления дашбордом
 */

const SHORTCUTS = {
  REFRESH: { key: 'r', ctrl: true, description: 'Обновить данные' },
  PERIOD_1H: { key: '1', ctrl: true, description: 'Период: 1 час' },
  PERIOD_6H: { key: '6', ctrl: true, description: 'Период: 6 часов' },
  PERIOD_24H: { key: '2', ctrl: true, description: 'Период: 24 часа' },
  PERIOD_7D: { key: '7', ctrl: true, description: 'Период: 7 дней' },
  HELP: { key: '?', ctrl: false, description: 'Показать помощь' }
};

/**
 * Инициализация клавиатурных сокращений
 * @param {object} handlers - Объект с обработчиками
 * @param {function} handlers.onRefresh - Обновить данные
 * @param {function} handlers.onPeriodChange - Изменить период (принимает hours)
 * @param {function} handlers.onHelp - Показать помощь
 */
export function initKeyboardShortcuts(handlers) {
  const handleKeyDown = (event) => {
    const { key, ctrlKey, metaKey } = event;
    const isCtrl = ctrlKey || metaKey;

    // Refresh (Ctrl+R или Cmd+R) - но не мешаем стандартной перезагрузке
    if (key === 'r' && isCtrl && !event.shiftKey) {
      // Не блокируем стандартную перезагрузку браузера
      return;
    }

    // Period shortcuts (Ctrl+1, Ctrl+6, Ctrl+2, Ctrl+7)
    if (key === '1' && isCtrl) {
      event.preventDefault();
      handlers.onPeriodChange && handlers.onPeriodChange(1);
    }
    if (key === '6' && isCtrl) {
      event.preventDefault();
      handlers.onPeriodChange && handlers.onPeriodChange(6);
    }
    if (key === '2' && isCtrl) {
      event.preventDefault();
      handlers.onPeriodChange && handlers.onPeriodChange(24);
    }
    if (key === '7' && isCtrl) {
      event.preventDefault();
      handlers.onPeriodChange && handlers.onPeriodChange(168);
    }

    // Help (?)
    if (key === '?' && !isCtrl) {
      event.preventDefault();
      handlers.onHelp && handlers.onHelp();
    }
  };

  document.addEventListener('keydown', handleKeyDown);

  // Cleanup function
  return () => {
    document.removeEventListener('keydown', handleKeyDown);
  };
}

/**
 * Получить список всех доступных сокращений
 */
export function getShortcutsList() {
  return Object.entries(SHORTCUTS).map(([name, shortcut]) => ({
    name,
    key: shortcut.ctrl ? `Ctrl+${shortcut.key}` : shortcut.key,
    description: shortcut.description
  }));
}

/**
 * Компонент с подсказками по клавиатурным сокращениям
 */
export function KeyboardShortcutsHelp({ isOpen, onClose }) {
  if (!isOpen) return null;

  const shortcuts = getShortcutsList();

  return (
    <div 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        backdropFilter: 'blur(4px)'
      }}
      onClick={onClose}
    >
      <div 
        style={{
          background: 'white',
          borderRadius: '16px',
          padding: '32px',
          maxWidth: '500px',
          width: '90%',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          marginBottom: '24px'
        }}>
          <h2 style={{ 
            fontSize: '24px', 
            fontWeight: '700',
            color: '#1a202c',
            margin: 0
          }}>
            Клавиатурные сокращения
          </h2>
          <button 
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '24px',
              cursor: 'pointer',
              color: '#718096',
              padding: '4px 8px'
            }}
          >
            ×
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {shortcuts.map((shortcut) => (
            <div 
              key={shortcut.name}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px 16px',
                background: '#f7fafc',
                borderRadius: '8px'
              }}
            >
              <span style={{ 
                fontSize: '15px',
                color: '#2d3748'
              }}>
                {shortcut.description}
              </span>
              <kbd style={{
                padding: '4px 12px',
                background: 'white',
                border: '1px solid #cbd5e0',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: '600',
                color: '#667eea',
                fontFamily: 'monospace'
              }}>
                {shortcut.key}
              </kbd>
            </div>
          ))}
        </div>

        <div style={{
          marginTop: '24px',
          padding: '16px',
          background: '#edf2f7',
          borderRadius: '8px',
          fontSize: '14px',
          color: '#4a5568',
          lineHeight: '1.6'
        }}>
          <strong>Совет:</strong> Используйте <kbd style={{ 
            padding: '2px 6px',
            background: 'white',
            borderRadius: '4px',
            fontFamily: 'monospace'
          }}>?</kbd> чтобы открыть эту подсказку в любое время.
        </div>
      </div>
    </div>
  );
}

export default { initKeyboardShortcuts, getShortcutsList, KeyboardShortcutsHelp };

