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

#### "No tokens available" / "Token refresh failed: No refresh token available" (long-term режим)

Симптом: GET/HOOK/DP в статусе `warning`, `reason=auth_error`, при этом amoCRM реально
работает (другой монитор сбоев не видит). Это **ложные алерты** — монитор не может
авторизоваться, а не amoCRM упал.

Проверка и причины:

```bash
# exp из самого access-токена:
echo "$AMOCRM_ACCESS_TOKEN" | cut -d. -f2 | base64 -d 2>/dev/null | python3 -c "import sys,json;print(json.load(sys.stdin)['exp'])"
# принимает ли его amoCRM (ожидаем 200):
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $AMOCRM_ACCESS_TOKEN" \
  https://YOUR_DOMAIN.amocrm.ru/api/v4/account
```

1. **Токен истёк** (в long-term режиме refresh-токена нет — обновить нечем). Если `exp` в
   прошлом или amoCRM вернул 401 — пропишите свежий долгоживущий `AMOCRM_ACCESS_TOKEN`,
   удалите кэш токена и перезапустите:
   ```bash
   rm -f "$TOKENS_DIR"/*.tokens.json   # или data/*.tokens.json
   pm2 restart amocrm-health-monitor
   ```
2. Файл токена **стёрт деплоем** — см. ниже «Деплой стирает историю/токены».

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

### Деплой стирает историю/токены

Симптом: после каждого релиза дашборд «забывает» историю инцидентов и/или появляются
`auth_error` (нет токенов).

Причина: БД (`health_checks.db`) и каталог токенов лежали внутри сменяемого каталога
релиза (`current/`), который деплой пересоздаёт. Решение — вынести их наружу через
`DB_PATH` и `TOKENS_DIR` в `.env` (пути ВНЕ `current/`, см. DEPLOYMENT.md), затем перезапустить.

### amoCRM не сохраняет вебхук («Используйте общедоступный адрес…»)

Сообщение amoCRM про «внутреннюю сеть amoCRM / частные адреса» часто **вводит в заблуждение** —
эндпоинт при этом может быть полностью публичным и рабочим. Реально встречавшиеся причины:

1. **Приложение лежит (502)** — amoCRM не получает `200`. Проверьте `curl -i https://ВАШ_ДОМЕН/health`.
2. **Динамический DNS** (`*.duckdns.org` и подобные) — amoCRM отклоняет их как небезопасные.
   Нужен настоящий домен/поддомен с валидным TLS.
3. **Лимит вебхуков / «битый» отключённый хук** — удалите лишний или отключённый вебхук
   в amoCRM (Настройки → вебхуки) и сохраните заново.

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
