# Grafana Dashboard для amoCRM Health Monitor

## Описание

Этот dashboard предоставляет comprehensive визуализацию метрик мониторинга amoCRM, включая:

- **Service Status** - текущий статус всех сервисов (UP/DOWN)
- **Response Time** - среднее время ответа и 95-й процентиль
- **Uptime Percentage** - процент времени работы для каждого сервиса
- **Health Checks Rate** - частота проверок здоровья
- **Incidents** - количество инцидентов за последний час
- **SSE Clients** - активные WebSocket подключения
- **Server Metrics** - uptime, память, ресурсы

## Предварительные требования

1. **Prometheus** - должен быть настроен и собирать метрики из вашего приложения
2. **Grafana** - версия 8.0+ установлена и запущена
3. **Prometheus datasource** - настроен в Grafana

## Установка

### Шаг 1: Настройка Prometheus

Добавьте target в `prometheus.yml`:

```yaml
scrape_configs:
  - job_name: 'amocrm-health-monitor'
    static_configs:
      - targets: ['localhost:3001']
    metrics_path: '/api/metrics'
    scrape_interval: 10s
```

Перезапустите Prometheus:

```bash
sudo systemctl restart prometheus
```

### Шаг 2: Импорт Dashboard в Grafana

#### Метод 1: Через UI

1. Откройте Grafana (обычно `http://localhost:3000`)
2. Войдите в систему (по умолчанию admin/admin)
3. Нажмите **+** → **Import** в левом меню
4. Нажмите **Upload JSON file**
5. Выберите файл `grafana/dashboards/amocrm-monitor.json`
6. Выберите Prometheus datasource
7. Нажмите **Import**

#### Метод 2: Через API

```bash
curl -X POST \
  http://localhost:3000/api/dashboards/db \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_API_KEY' \
  -d @grafana/dashboards/amocrm-monitor.json
```

#### Метод 3: Provisioning (рекомендуется для production)

1. Скопируйте dashboard JSON в Grafana provisioning директорию:

```bash
sudo cp grafana/dashboards/amocrm-monitor.json \
  /etc/grafana/provisioning/dashboards/
```

2. Создайте provisioning config (если еще не существует):

```bash
sudo nano /etc/grafana/provisioning/dashboards/dashboard.yml
```

Добавьте:

```yaml
apiVersion: 1

providers:
  - name: 'amoCRM'
    orgId: 1
    folder: 'Monitoring'
    type: file
    disableDeletion: false
    updateIntervalSeconds: 10
    allowUiUpdates: true
    options:
      path: /etc/grafana/provisioning/dashboards
```

3. Перезапустите Grafana:

```bash
sudo systemctl restart grafana-server
```

### Шаг 3: Проверка метрик

Убедитесь что метрики доступны:

```bash
curl http://localhost:3001/api/metrics
```

Вы должны увидеть метрики в формате Prometheus:

```
# HELP amocrm_service_status Current status of amoCRM services (1 = up, 0 = down)
# TYPE amocrm_service_status gauge
amocrm_service_status{check_type="GET"} 1
amocrm_service_status{check_type="POST"} 1
...
```

## Доступные метрики

Dashboard использует следующие метрики:

| Метрика | Описание | Тип | Labels |
|---------|----------|------|--------|
| `amocrm_service_status` | Текущий статус сервиса (1=up, 0=down) | gauge | check_type |
| `amocrm_response_time_seconds` | Время ответа в секундах | histogram | check_type |
| `amocrm_health_checks_total` | Общее количество проверок | counter | check_type, status |
| `amocrm_incidents_total` | Общее количество инцидентов | counter | check_type |
| `amocrm_uptime_percentage` | Процент времени работы | gauge | check_type |
| `amocrm_sse_clients_active` | Активные SSE клиенты | gauge | - |

## Настройка алертов

Вы можете добавить алерты к панелям dashboard:

### Пример: Alert для Service Down

1. Откройте панель **Service Status**
2. Перейдите на вкладку **Alert**
3. Создайте правило:

```
WHEN avg() OF query(A, 5m, now) IS BELOW 1
```

4. Настройте уведомления (Email, Slack, Mattermost и т.д.)

### Пример: Alert для высокого Response Time

```
WHEN avg() OF query(A, 5m, now) IS ABOVE 5
```

## Кастомизация

Dashboard можно настроить под ваши нужды:

- **Time range** - измените период отображения (default: 1 hour)
- **Refresh rate** - измените частоту обновления (default: 10 seconds)
- **Thresholds** - настройте пороги для алертов
- **Colors** - измените цветовую схему
- **Additional panels** - добавьте дополнительные визуализации

## Troubleshooting

### Dashboard не показывает данные

1. Проверьте что Prometheus собирает метрики:
   ```bash
   curl http://localhost:9090/api/v1/targets
   ```

2. Проверьте что datasource настроен правильно в Grafana

3. Проверьте логи Grafana:
   ```bash
   sudo tail -f /var/log/grafana/grafana.log
   ```

### Метрики показывают нули

1. Убедитесь что amoCRM Health Monitor запущен:
   ```bash
   pm2 status amocrm-health-monitor
   ```

2. Проверьте что endpoint `/api/metrics` доступен:
   ```bash
   curl http://localhost:3001/api/metrics
   ```

### Slow dashboard load

1. Уменьшите time range (например, с 24h до 6h)
2. Увеличьте scrape interval в Prometheus
3. Добавьте caching для Grafana

## Полезные ссылки

- [Grafana Documentation](https://grafana.com/docs/)
- [Prometheus Query Language](https://prometheus.io/docs/prometheus/latest/querying/basics/)
- [Alert Rules](https://grafana.com/docs/grafana/latest/alerting/)

## Поддержка

При возникновении проблем:

1. Проверьте логи Prometheus: `journalctl -u prometheus`
2. Проверьте логи Grafana: `journalctl -u grafana-server`
3. Проверьте логи приложения: `pm2 logs amocrm-health-monitor`

