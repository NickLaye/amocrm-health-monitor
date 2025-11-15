# AlertManager Configuration

## Описание

AlertManager обрабатывает алерты от Prometheus и отправляет уведомления в Mattermost для критичных событий мониторинга amoCRM.

## Типы алертов

### Критичные (Critical)
- **AmoCRMServiceDown** - сервис не отвечает более 5 минут
- **AmoCRMAllServicesDown** - множественный сбой (3+ сервиса)
- **AmoCRMVeryHighResponseTime** - P95 > 15 секунд
- **AmoCRMCriticalLowUptime** - Uptime < 90%
- **MonitoringServiceDown** - сама служба мониторинга не отвечает

### Предупреждения (Warning)
- **AmoCRMHighResponseTime** - среднее время ответа > 10 секунд
- **AmoCRMLowUptime** - Uptime < 95%
- **AmoCRMFrequentIncidents** - > 3 инцидентов в час
- **AmoCRMHighErrorRate** - > 10% неудачных проверок
- **AmoCRMSLAViolation** - нарушение SLA 99.9%

### Информационные (Info)
- **NoSSEClients** - нет подключенных клиентов

## Установка

### Шаг 1: Установка AlertManager

```bash
# Ubuntu/Debian
sudo apt-get install prometheus-alertmanager

# macOS
brew install alertmanager

# Docker
docker pull prom/alertmanager
```

### Шаг 2: Конфигурация

1. Скопируйте конфигурацию:

```bash
sudo cp alertmanager/config.yml /etc/alertmanager/
sudo cp alertmanager/alert-rules.yml /etc/prometheus/rules/
```

2. Обновите переменные окружения в `config.yml`:

```bash
# Замените ${MATTERMOST_WEBHOOK_URL} на реальный URL
export MATTERMOST_WEBHOOK_URL="https://your-mattermost.com/hooks/xxx"
```

Или используйте envsubst:

```bash
envsubst < alertmanager/config.yml | sudo tee /etc/alertmanager/config.yml
```

### Шаг 3: Настройка Prometheus

Добавьте в `prometheus.yml`:

```yaml
# Alertmanager configuration
alerting:
  alertmanagers:
    - static_configs:
        - targets:
            - localhost:9093

# Load rules once and periodically evaluate them
rule_files:
  - "/etc/prometheus/rules/alert-rules.yml"
```

### Шаг 4: Запуск

```bash
# Start AlertManager
sudo systemctl start alertmanager
sudo systemctl enable alertmanager

# Restart Prometheus
sudo systemctl restart prometheus

# Check status
sudo systemctl status alertmanager
sudo systemctl status prometheus
```

### Шаг 5: Проверка

Откройте AlertManager UI:

```
http://localhost:9093
```

Проверьте что алерты загружены в Prometheus:

```
http://localhost:9090/alerts
```

## Настройка Mattermost

### Создание Incoming Webhook

1. Перейдите в Mattermost → **Integrations** → **Incoming Webhooks**
2. Нажмите **Add Incoming Webhook**
3. Настройте:
   - **Display Name**: amoCRM Health Alerts
   - **Channel**: #skypro-crm-alerts (или другой канал)
4. Скопируйте Webhook URL
5. Обновите переменную `MATTERMOST_WEBHOOK_URL`

### Формат сообщений

AlertManager отправляет уведомления в следующем формате:

```
[CRITICAL] amoCRM API (GET) сервис не отвечает
Сервис не отвечает более 5 минут. Статус: DOWN
Started: 2024-01-15 10:30:00
```

## Тестирование алертов

### Ручной триггер алерта

```bash
# Послать тестовый алерт в AlertManager
curl -H "Content-Type: application/json" -d '[{
  "labels": {
    "alertname": "TestAlert",
    "severity": "warning",
    "check_type": "TEST"
  },
  "annotations": {
    "summary": "Тестовый алерт",
    "description": "Это тестовое уведомление"
  },
  "startsAt": "'$(date --rfc-3339=seconds)'"
}]' http://localhost:9093/api/v1/alerts
```

### Проверка правил

```bash
# Проверить синтаксис правил
promtool check rules /etc/prometheus/rules/alert-rules.yml

# Проверить конфигурацию AlertManager
amtool check-config /etc/alertmanager/config.yml
```

## Кастомизация

### Изменение порогов

Отредактируйте `alert-rules.yml`:

```yaml
# Пример: изменение порога high response time с 10 на 15 секунд
- alert: AmoCRMHighResponseTime
  expr: |
    (
      rate(amocrm_response_time_seconds_sum[5m]) 
      / 
      rate(amocrm_response_time_seconds_count[5m])
    ) > 15  # Изменено с 10 на 15
```

### Добавление email уведомлений

Добавьте в `config.yml`:

```yaml
receivers:
  - name: 'email-critical'
    email_configs:
      - to: 'team@example.com'
        from: 'alertmanager@example.com'
        smarthost: 'smtp.gmail.com:587'
        auth_username: 'your-email@gmail.com'
        auth_password: 'app-password'
        headers:
          Subject: '[CRITICAL] amoCRM Alert'
```

### Добавление Slack интеграции

```yaml
receivers:
  - name: 'slack-critical'
    slack_configs:
      - api_url: 'https://hooks.slack.com/services/xxx/yyy/zzz'
        channel: '#alerts'
        title: 'amoCRM Health Alert'
        text: '{{ .CommonAnnotations.description }}'
```

## Troubleshooting

### Алерты не отправляются

1. Проверьте логи AlertManager:
   ```bash
   sudo journalctl -u alertmanager -f
   ```

2. Проверьте что Prometheus видит AlertManager:
   ```bash
   curl http://localhost:9090/api/v1/alertmanagers
   ```

3. Проверьте активные алерты:
   ```bash
   curl http://localhost:9090/api/v1/alerts
   ```

### Слишком много уведомлений

1. Увеличьте `repeat_interval` в config.yml
2. Добавьте inhibit rules для подавления похожих алертов
3. Настройте `group_interval` для группировки алертов

### Webhook не работает

1. Проверьте URL webhook:
   ```bash
   curl -X POST ${MATTERMOST_WEBHOOK_URL} \
     -H 'Content-Type: application/json' \
     -d '{"text":"Test alert from AlertManager"}'
   ```

2. Проверьте логи Mattermost

3. Убедитесь что webhook активен в Mattermost settings

## Лучшие практики

1. **Группировка алертов** - используйте `group_by` для объединения похожих алертов
2. **Rate limiting** - настройте `repeat_interval` чтобы избежать спама
3. **Приоритизация** - используйте severity labels (critical, warning, info)
4. **Мониторинг мониторинга** - следите за статусом самого AlertManager
5. **Документация** - документируйте runbooks для каждого типа алерта
6. **Тестирование** - регулярно тестируйте алерты

## Полезные команды

```bash
# Проверить статус
amtool config show

# Список активных алертов
amtool alert query

# Заглушить алерт
amtool silence add alertname=AmoCRMServiceDown

# Список заглушенных алертов
amtool silence query

# Удалить заглушку
amtool silence expire <silence-id>
```

## Ссылки

- [AlertManager Documentation](https://prometheus.io/docs/alerting/latest/alertmanager/)
- [Alert Rules](https://prometheus.io/docs/prometheus/latest/configuration/alerting_rules/)
- [Mattermost Webhooks](https://docs.mattermost.com/developer/webhooks-incoming.html)

