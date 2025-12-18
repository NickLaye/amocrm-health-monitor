# Architecture Documentation: amoCRM Health Monitor v2.0

## Обзор
Проект представляет собой Self-contained Full-stack приложение для мониторинга доступности amoCRM и критических интеграций. Архитектура построена на принципах модульности и мульти-тенантности, позволяя обслуживать несколько клиентов (аккаунтов amoCRM) в рамках одного инстанса.

### Ключевые компоненты
1.  **Backend (Node.js/Express)**: 
    - REST API для фронтенда.
    - Фоновые процессы мониторинга (Health Checks).
    - Оркестратор для управления клиентами.
    - SSE (Server-Sent Events) для уведомлений в реальном времени.
2.  **Frontend (React/Vite)**: 
    - SPA дашборд.
    - Визуализация статусов и графиков.
3.  **Infrastructure**: 
    - Docker + Compose.
    - Nginx (Reverse Proxy).
    - SQLite (Persistance).

---

## Backend Architecture

### Структура классов
Backend построен вокруг `AppServer` (конфигурация Express) и `MonitorOrchestrator` (управление бизнес-логикой мониторинга).

#### Class Diagram
```mermaid
classDiagram
    class AppServer {
        +initialize()
        +setupRoutes()
        +start()
    }

    class MonitorOrchestrator {
        -monitors: Map
        +ensureMonitor(clientId)
        +getAllMonitors()
        +start()
    }

    class AmoCRMMonitor {
        +start()
        +stop()
        +runAllChecks()
    }

    class DPHandler {
        <<Mixin>>
        +runDigitalPipelineCycle()
    }

    class HealthChecks {
        <<Mixin>>
        +checkApiGet()
        +checkApiPost()
    }

    class StatusManager {
        <<Mixin>>
        +updateStatus()
        +evaluateBaseStatus()
    }

    class NotificationService {
        +sendDownNotification()
        +sendUpNotification()
        -stateMachine logic
    }

    AppServer ..> MonitorOrchestrator : starts
    MonitorOrchestrator *-- AmoCRMMonitor : manages
    AmoCRMMonitor --|> DPHandler : uses
    AmoCRMMonitor --|> HealthChecks : uses
    AmoCRMMonitor --|> StatusManager : uses
    AmoCRMMonitor ..> NotificationService : triggers
```

### Поток данных (Data Flow)
1.  **Инициализация**: `index.js` запускает `MonitorOrchestrator`.
2.  **Orchestrator**: Загружает конфиги клиентов из `ClientRegistry` и создает инстансы `AmoCRMMonitor`.
3.  **Monitor**:
    -   Запускает периодические проверки (Mixin `HealthChecks`).
    -   Обновляет статус через `StatusManager`.
    -   Если статус изменился -> Вызывает `NotificationService` и обновляет `metrics` (Prometheus).
    -   Уведомляет Orchestrator, который пушит событие в SSE.

#### Sequence Diagram: Health Check Cycle
```mermaid
sequenceDiagram
    participant Timer
    participant Monitor as AmoCRMMonitor
    participant API as amoCRM API
    participant Status as StatusManager
    participant Notify as NotificationService
    participant SSE as Client (SSE)

    Timer->>Monitor: Tick (Interval)
    Monitor->>Monitor: runAllChecks()
    par Check GET
        Monitor->>API: GET /api/v4/leads
        API-->>Monitor: 200 OK (120ms)
    and Check POST
        Monitor->>API: POST /api/v4/leads (add)
        API-->>Monitor: 200 OK (150ms)
    end
    
    Monitor->>Status: updateStatus('GET', 'up', 120ms)
    Status->>Status: evaluate(prev='up', curr='up')
    
    rect rgb(200, 250, 200)
        Note right of Status: No state change
    end

    Monitor->>Status: updateStatus('POST', 'down', null, 'Timeout')
    Status->>Status: evaluate(prev='up', curr='down')
    
    rect rgb(250, 200, 200)
        Note right of Status: State Changed: DOWN
    end
    
    Status->>Notify: sendDownNotification('POST')
    Notify->>Notify: Check Flapping/SLA
    Notify-->>SSE: Push Alert
```

---

## Frontend Architecture

Frontend использует компонентную архитектуру React.

### Component Hierarchy
-   `App` (Routing, Global Layout)
    -   `HealthMonitorDashboard` (Smart container)
        -   `HealthMonitorDashboardWithData` (Pure presentational)
            -   `ServiceCard` (Status visualization)
            -   `ResponseTimeChart` (Chart.js wrapper)
            -   `IncidentHistory` (List view)
        -   `useMonitoring` (Custom Hook: SSE + Polling logic)

---

## Multi-Tenancy

Система поддерживает изоляцию клиентов через `clientId`.
-   **Config**: `ClientRegistry` загружает конфигурации из ENV.
-   **Execution**: Каждый клиент имеет свой независимый инстанс `AmoCRMMonitor`.
-   **Storage**: Данные в SQLite разделены колонкой `client_id` (Soft Isolation).
-   **API**: Все эндпоинты принимают `?clientId=...`.

## Observability

1.  **Logs**: Winston logger с ротацией. Файлы в `logs/`.
2.  **Metrics**: Prometheus endpoint `/api/metrics`.
3.  **Alerting**: Mattermost webhook + Email.
