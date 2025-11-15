# Архитектура amoCRM Health Monitor

## Общая схема

```
┌─────────────────────────────────────────────────────────────────┐
│                     amohealth.duckdns.org                       │
│                         (Nginx + SSL)                           │
└────────────────────────┬────────────────────────────────────────┘
                         │ HTTPS
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    React Frontend (Port 443)                    │
│  - Dashboard с графиками                                        │
│  - История инцидентов                                           │
│  - Real-time обновления (SSE)                                   │
└────────────────────────┬────────────────────────────────────────┘
                         │ HTTP API + SSE
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Express Backend (Port 3001)                    │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │   Monitor    │  │   Database   │  │    API       │         │
│  │   Service    │◄─┤   (SQLite)   │─►│  Endpoints   │         │
│  └──────┬───────┘  └──────────────┘  └──────┬───────┘         │
│         │                                     │                 │
│         │                                     │ SSE Stream      │
│         │          ┌──────────────┐          │                 │
│         └─────────►│Notifications │          │                 │
│                    │   Service    │          │                 │
│                    └──────┬───────┘          │                 │
└───────────────────────────┼──────────────────┼─────────────────┘
                            │                   │
            ┌───────────────┼───────────────────┘
            │               │
            │               └──► SSE to Browser
            │
            ▼ Webhook
┌───────────────────────────────────┐
│    Mattermost (Notifications)     │
│  mm-time.skyeng.tech/hooks/...   │
└───────────────────────────────────┘
            
            
┌─────────────────────────────────────────────────────────────────┐
│                  amoCRM Services (skillssales)                  │
│                                                                 │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────┐│
│  │GET API   │ │POST API  │ │   WEB    │ │  HOOK    │ │  DP   ││
│  │/api/v4/  │ │/api/v4/  │ │   UI     │ │/webhooks │ │       ││
│  │account   │ │leads     │ │          │ │          │ │       ││
│  └────▲─────┘ └────▲─────┘ └────▲─────┘ └────▲─────┘ └───▲───┘│
└───────┼───────────┼─────────────┼───────────┼───────────┼─────┘
        │           │             │           │           │
        └───────────┴─────────────┴───────────┴───────────┘
                    Проверки каждые 60 секунд (по умолчанию)
                            │
                            │
                    ┌───────▼────────┐
                    │  Monitor Loop  │
                    │   (60 sec)     │
                    └────────────────┘
```

## Поток данных

### 1. Мониторинг (каждые 60 секунд по умолчанию)

```
Monitor Service
    │
    ├─► GET   → skillssales.amocrm.ru/api/v4/account
    ├─► POST  → skillssales.amocrm.ru/api/v4/leads
    ├─► WEB   → skillssales.amocrm.ru
    ├─► HOOK  → skillssales.amocrm.ru/api/v4/webhooks
    └─► DP    → digitalpipeline.amocrm.ru/health
         │
         ▼
    Измерение времени ответа
         │
         ▼
    SQLite Database
         │
         ▼
    Анализ статуса (UP/DOWN)
         │
         ├─► Если DOWN → Notifications → Mattermost
         ├─► Если UP после DOWN → Notifications → Mattermost
         └─► SSE Broadcast → Frontend
```

### 2. Отображение данных

```
User Browser
    │
    ├─► Открывает https://amohealth.duckdns.org
    │        │
    │        ▼
    │   Nginx отдаёт React Build
    │        │
    │        ▼
    │   React App загружается
    │        │
    │        ├─► GET /api/status    → Текущий статус
    │        ├─► GET /api/history   → История проверок
    │        ├─► GET /api/incidents → Инциденты
    │        ├─► GET /api/stats     → Статистика
    │        └─► GET /api/stream    → SSE подключение
    │                 │
    │                 ▼
    └────────── Real-time обновления ──────────────┐
                                                    │
         Каждые 60 сек новые данные ◄──────────────┘
```

### 3. Уведомления

```
Status Change
    │
    ├─► Service DOWN
    │       │
    │       ▼
    │   Создать инцидент в DB
    │       │
    │       ▼
    │   POST webhook to Mattermost
    │       │
    │       └─► 🔴 Service Down notification
    │
    └─► Service UP (after DOWN)
            │
            ▼
        Закрыть инцидент в DB
            │
            ▼
        POST webhook to Mattermost
            │
            └─► ✅ Service Restored notification
```

## Компоненты

### Backend

| Файл | Назначение | Порт |
|------|-----------|------|
| `server/index.js` | Главный сервер Express | 3001 |
| `server/monitor.js` | Сервис мониторинга 5 типов | - |
| `server/database.js` | SQLite хранилище | - |
| `server/api.js` | REST API + SSE | 3001 |
| `server/notifications.js` | Mattermost webhook | - |

### Frontend

| Файл | Назначение |
|------|-----------|
| `client/src/App.js` | Главный компонент |
| `client/src/components/Dashboard.jsx` | Дашборд с графиками |
| `client/src/components/ResponseTimeChart.jsx` | График Chart.js |
| `client/src/components/IncidentHistory.jsx` | Таблица инцидентов |
| `client/src/services/api.js` | API клиент + SSE |

### Инфраструктура

| Компонент | Описание |
|-----------|----------|
| **Nginx** | Reverse proxy, SSL, static files |
| **PM2** | Process manager для backend |
| **Let's Encrypt** | SSL сертификаты |
| **SQLite** | База данных (health_checks.db) |

## API Endpoints

### REST API

```
GET  /api/status               # Текущий статус всех сервисов
GET  /api/history?hours=24     # История проверок
GET  /api/incidents?limit=50   # История инцидентов  
GET  /api/stats?hours=24       # Статистика (uptime, avg time)
GET  /api/stream               # SSE для real-time
```

### SSE Messages

```json
{
  "type": "status_update",
  "checkType": "GET",
  "data": {
    "status": "up",
    "responseTime": 450,
    "lastCheck": 1699876543210,
    "errorMessage": null
  },
  "timestamp": 1699876543210
}
```

## База данных

### Таблица: health_checks

```sql
CREATE TABLE health_checks (
  id INTEGER PRIMARY KEY,
  timestamp INTEGER NOT NULL,
  check_type TEXT NOT NULL,      -- GET, POST, WEB, HOOK, DP
  status TEXT NOT NULL,           -- up, down
  response_time INTEGER,          -- milliseconds
  error_message TEXT,
  created_at DATETIME
);
```

### Таблица: incidents

```sql
CREATE TABLE incidents (
  id INTEGER PRIMARY KEY,
  check_type TEXT NOT NULL,
  start_time INTEGER NOT NULL,
  end_time INTEGER,              -- NULL если инцидент активен
  duration INTEGER,              -- end_time - start_time
  details TEXT,
  created_at DATETIME
);
```

## Конфигурация

### Переменные окружения

```env
# amoCRM OAuth
AMOCRM_DOMAIN=skillssales.amocrm.ru
AMOCRM_CLIENT_ID=<client_id>
AMOCRM_CLIENT_SECRET=<client_secret>
AMOCRM_ACCESS_TOKEN=<JWT токен>
AMOCRM_REFRESH_TOKEN=<refresh_token>
AMOCRM_REDIRECT_URI=<callback_url>

# Mattermost
MATTERMOST_WEBHOOK_URL=https://mm-time.skyeng.tech/hooks/...
MATTERMOST_MENTIONS=@user1 @user2

# Security
API_SECRET=<random_secret>

# Monitoring
CHECK_INTERVAL=60000            # 60 секунд
TIMEOUT_THRESHOLD=10000         # 10 секунд

# Server
PORT=3001
NODE_ENV=production
```

### Nginx

- **Домен**: amohealth.duckdns.org
- **SSL**: Let's Encrypt (автообновление)
- **Static**: /root/Health Check amoCRM/client/build
- **Proxy**: http://localhost:3001

### PM2

- **Имя**: amocrm-health-monitor
- **Экземпляры**: 1
- **Max Memory**: 500MB
- **Автозапуск**: Да
- **Логи**: ./logs/

## Мониторинг производительности

### Проверка здоровья

```bash
# Статус приложения
pm2 status

# Логи в реальном времени
pm2 logs amocrm-health-monitor

# Использование ресурсов
pm2 monit

# Nginx статус
systemctl status nginx

# База данных
sqlite3 health_checks.db "SELECT COUNT(*) FROM health_checks;"
```

### Метрики

- **Интервал проверок**: 60 секунд (по умолчанию, настраивается)
- **Проверок в час**: 60
- **Проверок в день**: 1,440
- **Проверок всех типов в день**: 7,200 (5 типов × 1,440)
- **Хранение данных**: 30 дней
- **Размер БД**: ~50-100 MB за 30 дней

### Собираемые метрики (15 показателей)

**Performance:**
- Average Response Time - среднее время ответа
- Min/Max/Median Response Time - минимальное, максимальное и медианное время
- 95th Percentile - 95-й процентиль времени ответа

**Reliability:**
- Uptime Percentage - процент времени работы
- Error Rate / Success Rate - процент ошибок и успехов
- MTTR (Mean Time To Recovery) - среднее время восстановления
- MTBF (Mean Time Between Failures) - среднее время между сбоями

**User Experience:**
- Apdex Score (Application Performance Index) - индекс производительности
- Check Count / Total Checks - количество проверок

## Безопасность

### Реализованные меры

- ✅ **HTTPS** с Let's Encrypt (автообновление сертификатов)
- ✅ **Helmet.js** - security headers (XSS, clickjacking защита)
- ✅ **CORS** - whitelist разрешенных доменов
- ✅ **Rate Limiting** - 100 запросов в минуту с одного IP
- ✅ **API_SECRET** - обязательная авторизация в production
- ✅ **Environment Variables** - секреты не в коде
- ✅ **Token Auto-refresh** - автоматическое обновление OAuth токенов
- ✅ **Валидация входных данных** - все API endpoints
- ✅ **Structured Logging** - аудит всех действий
- ✅ **PM2 Isolation** - изоляция процесса

### Рекомендации по безопасности

1. Регулярно обновляйте зависимости: `npm audit fix`
2. Используйте сильный `API_SECRET` (минимум 32 байта)
3. Ограничьте доступ к серверу через firewall
4. Настройте backup базы данных
5. Мониторьте логи на подозрительную активность
6. Используйте `openssl rand -hex 32` для генерации секретов

## Масштабирование

Текущая конфигурация рассчитана на:
- ✅ 1 аккаунт amoCRM
- ✅ 5 типов проверок
- ✅ 1 инстанс backend
- ✅ До 1000 проверок в минуту (теоретический лимит)

Для масштабирования:
- Увеличить количество PM2 instances
- Использовать PostgreSQL вместо SQLite
- Добавить Redis для кеширования
- Настроить load balancer

---

**Архитектура оптимизирована для надежного мониторинга в режиме 24/7** 🚀

