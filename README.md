# amoCRM Health Monitor v2.0

> **Single Tenant · Secure · Dark Mode** — единое окно для техподдержки и SRE с real-time метриками amoCRM.

Этот README — единственный источник правды для релиза v2.0.

## Highlights
- 🔒 **Multi-tenant & Secure by default**: несколько amoCRM-доменов через `AMOCRM_CLIENTS`, отдельные токены и интервалы на клиента, плюс Basic Auth (`ADMIN_USER`/`ADMIN_PASSWORD`), `API_SECRET`, строгий CORS и rate limiting.
- 🌑 **Dark Mode UI**: React 19 + Vite 7 + Tailwind (Slate palette) + Chart.js 4, SSE-дашборд с live-картами.
- 📡 **5 типов проверок**: GET, POST, WEB, HOOK, Digital Pipeline; результаты хранятся в SQLite и отдаются через SSE/Web API.
- 🔔 **Incident pipeline**: Mattermost webhook обязателен, email/Summary канал по желанию.
- 📈 **Ops-friendly**: Prometheus `/api/metrics`, cron cleanup, structured logging (Winston + rotation).
- 🧱 **Self-contained**: Node.js backend + React frontend + SQLite file DB → легко переносить и деплоить.

## Tech Stack
| Слой | Технологии |
| --- | --- |
| Backend | Node.js ≥ 18.19 · Express 5 · SSE · Winston · prom-client |
| Frontend | React 19 · Vite 7 · Tailwind Slate · Chart.js 4 · Vitest |
| Storage | SQLite 3 (`health_checks.db`) + Umzug миграции |
| Notifications | Mattermost webhook (обязательно) + optional SMTP email |
| Deployment | Docker/Compose, PM2, nginx reverse proxy |

## Architecture Snapshot
1. **Monitor service** каждые `CHECK_INTERVAL` миллисекунд обращается к amoCRM API/UI/Hook/DP, меряет `responseTime`, пишет в SQLite.
2. **Database** агрегирует статистику, хранит активные инциденты и отдает метрики для графиков.
3. **API layer** (`/api/status`, `/api/history`, `/api/stats`, `/api/incidents`, `/api/metrics`, `/api/stream`) обслуживает UI и внешние интеграции.
4. **Notifications** отправляют DOWN/UP события и суточную сводку в Mattermost (email/Summary доступен дополнительно).
5. **Frontend** слушает SSE `/api/stream`, визуализирует статистику и историю в одном темном дашборде.

## Getting Started
### 1. Клонирование
```bash
git clone <repository-url>
cd "Health Check amoCRM"
```

### 2. Установка зависимостей
```bash
npm install          # backend deps
cd client && npm install && cd ..
```

### 3. Конфигурация окружения
```bash
cp .env.example .env
```
Заполните обязательные переменные (остальные см. `.env.example`):

| Переменная | Назначение |
| --- | --- |
| `AMOCRM_DOMAIN`, `AMOCRM_CLIENT_ID`, `AMOCRM_CLIENT_SECRET`, `AMOCRM_REDIRECT_URI`, `AMOCRM_REFRESH_TOKEN` | OAuth-доступ к вашему amoCRM аккаунту (legacy режим) |
| `AMOCRM_CLIENTS`, `CLIENT_<slug>_*` | Multi-tenant конфигурация: перечислите slug'и (например `skillssales`) и задайте для каждого `CLIENT_slug_DOMAIN`, `CLIENT_slug_CLIENT_ID/SECRET`, `CLIENT_slug_REFRESH_TOKEN`, DP тайминги |
| `CLIENT_<slug>_MATTERMOST_WEBHOOK_URL`, `CLIENT_<slug>_MATTERMOST_CHANNEL` | Per-client настройки Mattermost (приоритет над глобальными) |
| `CLIENT_<slug>_EMAILS` | Per-client email-получатели (через запятую) |
| `CLIENT_<slug>_RESPONSIBLE_EMAIL` | Email ответственного за клиента |
| `API_SECRET` | Shared secret для API и SSE (используйте `openssl rand -hex 32`) |
| `ADMIN_USER` / `ADMIN_PASSWORD` | Basic Auth для единственного тенанта/UI |
| `MATTERMOST_WEBHOOK_URL`, `MATTERMOST_CHANNEL` | Глобальные настройки Mattermost (fallback для клиентов без per-client конфига) |
| `EXTERNAL_WEBHOOK_TOKEN` | Токен для внешнего вебхука `/api/webhooks/mattermail` |
| `VITE_API_URL` | URL backend API, вшивается в фронт при `npm run build` |

> Без `API_SECRET`, `ADMIN_USER`, `ADMIN_PASSWORD` и `MATTERMOST_WEBHOOK_URL` запуск запрещён.

### 4. Dev-режим
```bash
# Терминал 1 — backend (порт 3001)
npm run dev

# Терминал 2 — frontend (порт 5173)
cd client && npm run dev
```
Дашборд: http://localhost:5173 · API: http://localhost:3001/api

### 5. Production build
```bash
cd client
VITE_API_URL=https://your-domain.com/api npm run build
cd ..
NODE_ENV=production npm start
```
Backend автоматически раздаёт `client/dist` при прод-сборке.

### 6. Docker / Compose
Dev parity:
```bash
docker compose -f docker-compose.dev.yml up --build
```
Prod образ:
```bash
docker compose build
docker compose up -d
```
Prometheus тянет `/api/metrics`, Grafana доступна на `http://localhost:3002`.

## Operations Cheatsheet
### Monitoring & Notifications
- 5 типов проверок, SSE-стрим + REST API.
- Mattermost — основной канал; email summary (`EMAIL_*`) включайте при необходимости.
- `/api/metrics` → prom-client метрики (uptime, latency, incidents, jobs).
- Cron (`server/index.js`) очищает старые записи и закрывает «висячие» инциденты.

### Security & Governance
- Basic Auth (`ADMIN_*`) + `API_SECRET` для SSE токена.
- Express-rate-limit (конфиг через `RATE_LIMIT_*`, IPv6 агрегируется по `/56`).
- Helmet, CORS whitelist (`ALLOWED_ORIGINS`), structured logging (Winston + daily rotate).
- OAuth токены автоматически обновляются (`token-manager`).

## API Surface
| Метод | Путь | Описание |
| --- | --- | --- |
| `GET` | `/api/status` | Текущий статус всех проверок |
| `GET` | `/api/history?checkType=&hours=` | История проверок |
| `GET` | `/api/stats?hours=` | 15 агрегированных метрик |
| `GET` | `/api/incidents?limit=` | Журнал инцидентов |
| `GET` | `/api/clients` | Список доступных клиентов/окружений |
| `POST` | `/api/accounts` | Добавление нового аккаунта amoCRM в мониторинг |
| `POST` | `/api/webhooks/mattermail` | Внешний вебхук для отправки инцидентов в Mattermost и Email |
| `GET` | `/api/stream` | SSE-канал для live-обновлений |
| `GET` | `/api/metrics` | Prometheus metrics |
| `GET` | `/api/docs` | Swagger UI (`swagger.yaml`) |

> В multi-tenant конфигурации все чтения (`/status`, `/history`, `/stats`, `/incidents`, `/export/*`, `/stream`, `/webhook/callback`) требуют `clientId` (например `?clientId=skillssales`). Если настроен только один клиент, параметр необязателен и используется первый в списке.

### Добавление аккаунтов через UI

На дашборде доступна кнопка **"Добавить аккаунт"** в шапке, которая ведет на страницу `/accounts/new`. Форма позволяет добавить новый аккаунт amoCRM с обязательными полями:

- **Основные данные**: Client ID, отображаемое имя, среда (production/staging/test), ответственный email
- **Интеграция amoCRM**: поддомен, Client ID, Client Secret, Redirect URI, Access Token, Refresh Token
- **Оповещения**: Mattermost Webhook URL и канал (обязательно), Email-адреса получателей (опционально)

После сохранения конфигурация записывается в `.env.production` и `.env.local`, а новый аккаунт сразу появляется в селекторе на дашборде.

### Внешний вебхук для инцидентов

Эндпоинт `POST /api/webhooks/mattermail` принимает внешние инциденты и отправляет уведомления в Mattermost и Email. Требует заголовок `X-Webhook-Token` или query-параметр `token` со значением из `EXTERNAL_WEBHOOK_TOKEN`.

**Пример запроса:**
```json
{
  "clientId": "client-01",
  "status": "down",
  "checkType": "CUSTOM",
  "message": "Обнаружена проблема",
  "title": "🚨 Критический инцидент",
  "fields": [
    { "short": true, "title": "Источник", "value": "Внешняя система" }
  ]
}
```

Поддерживаемые статусы: `down`, `up`, `warning`. Если `clientId` не указан, используется `default`.

## Testing
```bash
# Backend
npm test
npm run test:watch

# Frontend
cd client
npm run test           # vitest --run
npm run dev -- --host  # для ручных smoke-тестов
```
CI/CD (GitHub Actions) прогоняет Jest + Vitest + security audit (`npm audit --omit=dev`).

## Deployment Options
- **PM2**: `cd client && npm run build`, затем `pm2 start ecosystem.config.js` и `pm2 save`.
- **Docker/Compose**: см. выше, финальный образ уже содержит `client/dist`.
- **Nginx**: используйте `nginx.conf` как reverse proxy + TLS (Let’s Encrypt/Certbot).

## Support & Status
- **Версия:** 2.0 (Single Tenant, Secure, Dark Mode)
- **Runtime matrix:** Node.js 18.x/20.x, npm 10.x, React 19.2, Tailwind 4.1, SQLite 3.
- **Контакты:** создайте issue или пинганите в Mattermost канале проекта.

