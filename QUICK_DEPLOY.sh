#!/bin/bash

# Quick Deploy Script для amohealth.duckdns.org
# Этот скрипт копирует проект на сервер и запускает его

set -e  # Остановиться при любой ошибке

SERVER="root@77.73.71.242"
PASSWORD="eNhQk38N3nJZyTq506"
SSH_CMD="sshpass -p '$PASSWORD' ssh -o StrictHostKeyChecking=no"
RSYNC_SSH="sshpass -p '$PASSWORD' ssh -o StrictHostKeyChecking=no"
PROJECT_PATH="/root/Health Check amoCRM"
LOCAL_PATH="/Users/nicklaye/Desktop/Cursor Projects/Health Check amoCRM"

echo "========================================="
echo "Quick Deploy to amohealth.duckdns.org"
echo "========================================="
echo ""

# Проверка подключения к серверу
echo "Проверка подключения к серверу..."
$SSH_CMD -o ConnectTimeout=5 $SERVER "echo 'Сервер доступен'" || {
    echo "Ошибка: Не удалось подключиться к серверу"
    exit 1
}

echo "✓ Сервер доступен"
echo ""

# Копирование проекта
echo "Копирование проекта на сервер..."
rsync -avz --delete -e "$RSYNC_SSH" \
    --exclude 'node_modules' \
    --exclude 'client/node_modules' \
    --exclude 'client/build' \
    --exclude '.git' \
    --exclude '*.db' \
    --exclude '*.log' \
    --exclude '.DS_Store' \
    "$LOCAL_PATH/" "$SERVER:$PROJECT_PATH/"

echo "✓ Проект скопирован"
echo ""

# Создание .env файла
echo "Создание .env файла..."
$SSH_CMD $SERVER "cat > '$PROJECT_PATH/.env' << 'ENVEOF'
# amoCRM Configuration
AMOCRM_DOMAIN=skillssales.amocrm.ru
AMOCRM_ACCESS_TOKEN=eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImp0aSI6IjcyOWY4OWQ0MWIzYWU5ZTgwYWM3MjJmYzNmZGJmNTEwMWU1YjA1YmI4NDY1ZTM2YWJkM2RhYTY5NDYyYzI3MTI4ZTE3YmE2NGQzMDY1YTBmIn0.eyJhdWQiOiIwZmI4YmU4Ni00YmMyLTRhN2ItYmEwNi02MDNiOWM0NjVlNjciLCJqdGkiOiI3MjlmODlkNDFiM2FlOWU4MGFjNzIyZmMzZmRiZjUxMDFlNWIwNWJiODQ2NWUzNmFiZDNkYWE2OTQ2MmMyNzEyOGUxN2JhNjRkMzA2NWEwZiIsImlhdCI6MTc2Mjg0NjcxNSwibmJmIjoxNzYyODQ2NzE1LCJleHAiOjE3NjI5MzMxMTUsInN1YiI6IjY5NzYwOTAiLCJncmFudF90eXBlIjoiIiwiYWNjb3VudF9pZCI6MjkyMzIzNzksImJhc2VfZG9tYWluIjoiYW1vY3JtLnJ1IiwidmVyc2lvbiI6Miwic2NvcGVzIjpbInB1c2hfbm90aWZpY2F0aW9ucyIsImZpbGVzIiwiY3JtIiwiZmlsZXNfZGVsZXRlIiwibm90aWZpY2F0aW9ucyJdLCJoYXNoX3V1aWQiOiIyOGQ4MGYzNi0xNzU5LTQ0MzYtYjc1Ni1lNGYzMzJlOTg2ZDkiLCJ1c2VyX2ZsYWdzIjowLCJhcGlfZG9tYWluIjoiYXBpLWEuYW1vY3JtLnJ1In0.a5btf0244P3_ltK9wVXbEQgpW24RUX1xkMW7sU3nBB8kl0V7SWodJvlPERa1TLrlxSH5hiDZTOlkvEvkTM8fQpBASDhDwj9kTDV5o6Pj8qb5LVaiuSeStRAOfznmYfGnDI1CrMCwLFlGeXgsrC1dX8ClC3bp0iLnlCXQMXgog8PtCGrIyfq4hPoR4mihNxEHOojpyIywLtsCrk9W-rF1rakPE_XIfX7yA56T0XIY3XKpK1hZvf-Deywkanh2PbnB_RjzDtzq8rQFVMLhukRgrNrdMCmAj1YvbcZwA4V4fU6z93UhVc4WooFgttRa5nW05EA8L11z1r1QruxP_Ypawg

# Mattermost Webhook
MATTERMOST_WEBHOOK_URL=https://mm-time.skyeng.tech/hooks/tcc1zn8tgigs5bzofr8t5xoi6r

# Monitoring Settings
CHECK_INTERVAL=30000
TIMEOUT_THRESHOLD=10000

# Server Configuration
PORT=3001
NODE_ENV=production
ENVEOF
"

echo "✓ .env файл создан"
echo ""

# Установка зависимостей
echo "Установка зависимостей..."
$SSH_CMD $SERVER "cd '$PROJECT_PATH' && npm install --production"
$SSH_CMD $SERVER "cd '$PROJECT_PATH/client' && npm install --production"

echo "✓ Зависимости установлены"
echo ""

# Сборка frontend
echo "Сборка frontend..."
$SSH_CMD $SERVER "cd '$PROJECT_PATH/client' && npm run build"

echo "✓ Frontend собран"
echo ""

# Проверка PM2
echo "Проверка PM2..."
PM2_RUNNING=$($SSH_CMD $SERVER "pm2 list | grep -c amocrm-health-monitor || true")

if [ "$PM2_RUNNING" -gt "0" ]; then
    echo "Перезапуск приложения..."
    $SSH_CMD $SERVER "cd '$PROJECT_PATH' && pm2 restart ecosystem.config.js"
else
    echo "Запуск приложения..."
    $SSH_CMD $SERVER "cd '$PROJECT_PATH' && pm2 start ecosystem.config.js"
    $SSH_CMD $SERVER "pm2 save"
fi

echo "✓ Приложение запущено"
echo ""

# Настройка Nginx (если нужно)
echo "Проверка Nginx..."
NGINX_CONFIGURED=$($SSH_CMD $SERVER "[ -f /etc/nginx/sites-enabled/amohealth ] && echo 'yes' || echo 'no'")

if [ "$NGINX_CONFIGURED" = "no" ]; then
    echo "Настройка Nginx..."
    $SSH_CMD $SERVER "cp '$PROJECT_PATH/nginx.conf' /etc/nginx/sites-available/amohealth"
    $SSH_CMD $SERVER "ln -sf /etc/nginx/sites-available/amohealth /etc/nginx/sites-enabled/"
    $SSH_CMD $SERVER "nginx -t && systemctl reload nginx"
    echo "✓ Nginx настроен"
else
    echo "✓ Nginx уже настроен"
fi

echo ""
echo "========================================="
echo "✓ Деплой завершен успешно!"
echo "========================================="
echo ""
echo "Дашборд доступен по адресу:"
echo "🌐 https://amohealth.duckdns.org"
echo ""
echo "Полезные команды:"
echo "  pm2 logs amocrm-health-monitor    # Логи"
echo "  pm2 status                         # Статус"
echo "  pm2 restart amocrm-health-monitor # Перезапуск"
echo ""

