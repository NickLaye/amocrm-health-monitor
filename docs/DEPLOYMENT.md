# Развёртывание amoCRM Health Monitor

## Требования

- Node.js v18+
- Docker (опционально)
- amoCRM аккаунт с API интеграцией
- Mattermost webhook URL

## Быстрый старт

```bash
# Клонирование и установка
git clone <repository>
cd amocrm-health-monitor
npm install
cd client && npm install && cd ..

# Настройка окружения
cp .env.example .env
# Отредактируйте .env

# Запуск
npm run dev
```

## Переменные окружения

### Обязательные

```bash
# Безопасность
API_SECRET=your-random-secret-key-32-chars

# amoCRM OAuth
AMOCRM_DOMAIN=yourcompany.amocrm.ru
AMOCRM_CLIENT_ID=xxx
AMOCRM_CLIENT_SECRET=xxx
AMOCRM_ACCESS_TOKEN=xxx
# REFRESH_TOKEN опционален: нужен хотя бы ОДИН из ACCESS/REFRESH.
# В long-term режиме оставьте пустым — срок жизни берётся из exp самого access-токена.
AMOCRM_REFRESH_TOKEN=

# Тестовые сущности для POST проверки (опционально — без них POST-проверка
# показывает "not configured" и не алертит)
AMOCRM_TEST_DEAL_ID=12345678
AMOCRM_TEST_FIELD_ID=1234567

# Уведомления
MATTERMOST_WEBHOOK_URL=https://your-mattermost/hooks/xxx
```

### Опциональные

```bash
# Мониторинг
CHECK_INTERVAL=60000            # Интервал проверок (мс)
PORT=3001                       # Порт сервера

# Admin UI
ADMIN_USER=admin
ADMIN_PASSWORD=secure-password

# Multi-tenant
AMOCRM_CLIENTS=client1,client2
AMOCRM_client1_DOMAIN=...

# Персистентность (если деплой заменяет каталог релиза, напр. current/)
# Укажите пути ВНЕ сменяемого каталога, иначе деплой стирает БД и токены.
DB_PATH=/root/amocrm-monitor/health_checks.db
TOKENS_DIR=/root/amocrm-monitor/data

# Пороги латентности по типам (мс). Дефолты: GET/HOOK 2000/5000, POST 3000/7000,
# WEB 3000/8000, DP 30000/50000. Apdex привязан к warning-порогу.
LATENCY_GET_WARNING_MS=2000
LATENCY_GET_DOWN_MS=5000
# ... аналогично LATENCY_POST_*, LATENCY_WEB_*, LATENCY_HOOK_*, LATENCY_DP_*

# Опциональный токен для amoCRM DP-callback /api/webhook/callback
WEBHOOK_CALLBACK_TOKEN=
```

## Особенности продакшн-деплоя (этот проект)

- **Деплой** идёт через GitHub Actions (`.github/workflows/deploy.yml`) на push в `main`:
  сборка фронта → артефакт → SSH на сервер → `pm2 restart`. Health-check после деплоя
  проверяет приложение **локально на сервере** (`127.0.0.1:3001/health`), а не по публичному
  URL (публичный путь во время перезагрузки nginx даёт ложные 502). Если приложение не
  поднялось — деплой падает (красный) и срабатывает `Rollback on failure`.
- **Персистентность обязательна.** Деплой заменяет каталог `current/`, поэтому БД и файл
  токенов должны лежать ВНЕ него — задайте `DB_PATH` и `TOKENS_DIR` в `.env`. Без этого
  каждый деплой стирает историю инцидентов и токены (монитор «слепнет» на amoCRM).
- **Домен для вебхука amoCRM** должен быть НАСТОЯЩИМ (с валидным TLS). amoCRM отклоняет
  динамические DNS (`*.duckdns.org` и т.п.) как «небезопасные/внутренние» — нужен обычный
  домен или поддомен.
- **Режим токена.** Поддерживается долгоживущий `AMOCRM_ACCESS_TOKEN` без refresh-токена.
  Следите за его сроком (`exp`) — без refresh-токена монитор не сможет обновить его сам;
  при истечении начнут лететь ложные `auth_error` алерты (см. TROUBLESHOOTING).

## Docker

### Быстрый запуск

```bash
docker-compose up -d
```

### docker-compose.yml

```yaml
services:
  amocrm-monitor:
    build: .
    ports:
      - "3001:3001"
    volumes:
      - ./health_checks.db:/app/health_checks.db
    env_file:
      - .env
    restart: unless-stopped
```

### Production

```bash
# Build
docker build -t amocrm-monitor .

# Run
docker run -d \
  --name amocrm-monitor \
  -p 3001:3001 \
  -v $(pwd)/health_checks.db:/app/health_checks.db \
  --env-file .env \
  --restart unless-stopped \
  amocrm-monitor
```

## Systemd (Linux)

```ini
# /etc/systemd/system/amocrm-monitor.service
[Unit]
Description=amoCRM Health Monitor
After=network.target

[Service]
Type=simple
User=www-data
WorkingDir=/opt/amocrm-monitor
ExecStart=/usr/bin/node server/index.js
Restart=on-failure
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable amocrm-monitor
sudo systemctl start amocrm-monitor
```

## Nginx Reverse Proxy

```nginx
server {
    listen 443 ssl;
    server_name monitor.example.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }
    
    # SSE endpoint
    location /api/stream {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        proxy_buffering off;
        proxy_cache off;
        chunked_transfer_encoding off;
    }
}
```

## Проверка

```bash
# Health check
curl http://localhost:3001/api/health

# Расширенные проверки
curl http://localhost:3001/api/health/all

# Prometheus метрики
curl http://localhost:3001/api/metrics
```

## Backup

```bash
# SQLite backup
cp health_checks.db health_checks.db.backup

# Docker volume backup
docker cp amocrm-monitor:/app/health_checks.db ./backup/
```

## Обновление

```bash
# Остановка
docker-compose down

# Обновление кода
git pull

# Пересборка и запуск
docker-compose up -d --build
```
