# Troubleshooting amoCRM Health Monitor

## Частые проблемы

### Токены amoCRM

#### Ошибка: "Invalid access token"

```bash
# 1. Проверьте срок действия токена
curl -X GET "https://YOUR_DOMAIN.amocrm.ru/api/v4/account" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# 2. Обновите токены вручную
node -e "require('./server/token-manager').refreshToken()"

# 3. Проверьте переменные окружения
grep AMOCRM .env
```

#### Ошибка: "Token refresh failed"

- Проверьте `AMOCRM_CLIENT_SECRET`
- Убедитесь, что refresh_token не истёк
- Получите новые токены через OAuth flow

### База данных

#### Ошибка: "Database is locked"

```bash
# Проверьте активные соединения
lsof health_checks.db

# Перезапустите приложение
pm2 restart amocrm-monitor

# Включите WAL mode
sqlite3 health_checks.db 'PRAGMA journal_mode=WAL;'
```

#### Ошибка: "No such table"

```bash
# Запустите миграции
npm run migrate

# Проверьте структуру
sqlite3 health_checks.db '.tables'
```

### Уведомления

#### Mattermost не получает алерты

1. Проверьте webhook URL:
```bash
curl -X POST "$MATTERMOST_WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d '{"text":"Test message"}'
```

2. Проверьте health endpoint:
```bash
curl http://localhost:3001/api/health/notifications
```

3. Проверьте логи:
```bash
grep -i mattermost logs/app.log
```

### SSE Подключение

#### Клиент не получает обновления

```bash
# Проверьте SSE endpoint
curl -N http://localhost:3001/api/stream?clientId=default

# Проверьте количество соединений
curl http://localhost:3001/api/health | jq '.data.sseClients'
```

### Health Checks

#### Все проверки показывают "unknown"

```bash
# 1. Проверьте токены
curl http://localhost:3001/api/health/amo

# 2. Проверьте amoCRM API
curl -X GET "https://YOUR_DOMAIN.amocrm.ru/api/v4/account" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# 3. Перезапустите мониторинг
npm restart
```

#### Высокий response time

1. Проверьте сеть до amoCRM:
```bash
ping YOUR_DOMAIN.amocrm.ru
```

2. Проверьте rate limits amoCRM (429 ошибки)

3. Увеличьте CHECK_INTERVAL если нужно

## Логи

### Просмотр

```bash
# Все логи
tail -f logs/app.log

# Только ошибки
grep -i error logs/app.log

# По компоненту
grep "Monitor" logs/app.log
```

### Docker логи

```bash
docker logs -f amocrm-monitor

# Последние 100 строк
docker logs --tail 100 amocrm-monitor
```

## Диагностика

### Полная проверка системы

```bash
# 1. Health check
curl http://localhost:3001/api/health/all | jq

# 2. Статус сервисов
curl http://localhost:3001/api/status | jq

# 3. Метрики
curl http://localhost:3001/api/metrics

# 4. Последние инциденты
curl http://localhost:3001/api/incidents?limit=5 | jq
```

### Производительность

```bash
# Response time статистика
curl "http://localhost:3001/api/stats?hours=24" | jq

# Размер базы
ls -lh health_checks.db

# Количество записей
sqlite3 health_checks.db 'SELECT COUNT(*) FROM health_checks;'
```

## Сброс

### Очистка старых данных

```bash
# Удаление данных старше 30 дней
sqlite3 health_checks.db "DELETE FROM health_checks WHERE timestamp < strftime('%s','now','-30 days')*1000;"
sqlite3 health_checks.db "VACUUM;"
```

### Полный сброс

```bash
# Backup перед сбросом
cp health_checks.db health_checks.db.backup

# Удаление и пересоздание
rm health_checks.db
npm run migrate
```

## Поддержка

При обращении приложите:
1. Версию приложения (`package.json`)
2. Вывод `curl http://localhost:3001/api/health/all`
3. Последние 50 строк логов
4. Описание проблемы
