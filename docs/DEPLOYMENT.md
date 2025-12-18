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
AMOCRM_REFRESH_TOKEN=xxx

# Тестовые сущности для POST проверок
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
```

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
