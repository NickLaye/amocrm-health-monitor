#!/bin/bash

# Quick Deploy Script для amohealth.duckdns.org
# Этот скрипт копирует проект на сервер и запускает его
#
# ТРЕБУЕТСЯ НАСТРОЙКА:
# 1. Установите SSH-ключи для беспарольного доступа к серверу (рекомендуется):
#    ssh-copy-id root@your-server-ip
#
# 2. Или установите переменные окружения (не рекомендуется):
#    export DEPLOY_SERVER="root@your-server-ip"
#    export DEPLOY_PASSWORD="your_password"
#
# 3. Убедитесь что .env файл существует локально или на сервере
#    Создайте его на основе .env.example
#
# Использование:
#    ./QUICK_DEPLOY.sh

set -e  # Остановиться при любой ошибке

SERVER="${DEPLOY_SERVER:-root@your-server-ip}"
# Use SSH keys instead of password for security
# Set DEPLOY_PASSWORD only if you must use password authentication
SSH_CMD="ssh -o StrictHostKeyChecking=no"
RSYNC_SSH="ssh -o StrictHostKeyChecking=no"

# If DEPLOY_PASSWORD is set, use sshpass (not recommended)
if [ -n "$DEPLOY_PASSWORD" ]; then
    SSH_CMD="sshpass -p '$DEPLOY_PASSWORD' ssh -o StrictHostKeyChecking=no"
    RSYNC_SSH="sshpass -p '$DEPLOY_PASSWORD' ssh -o StrictHostKeyChecking=no"
fi
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
    --exclude 'client/dist' \
    --exclude '.git' \
    --exclude '*.db' \
    --exclude '*.log' \
    --exclude '.DS_Store' \
    "$LOCAL_PATH/" "$SERVER:$PROJECT_PATH/"

echo "✓ Проект скопирован"
echo ""

# Копирование .env файла на сервер (если существует локально)
echo "Копирование .env файла..."
if [ -f ".env" ]; then
    rsync -avz -e "$RSYNC_SSH" .env "$SERVER:$PROJECT_PATH/"
    echo "✓ .env файл скопирован с локальной машины"
else
    echo "⚠ Файл .env не найден локально"
    echo "⚠ Убедитесь, что .env файл существует на сервере: $PROJECT_PATH/.env"
    echo "⚠ Или создайте его вручную на основе .env.example"
fi
echo ""

# Установка зависимостей
echo "Установка зависимостей..."
$SSH_CMD $SERVER "cd '$PROJECT_PATH' && npm install --production"
$SSH_CMD $SERVER "cd '$PROJECT_PATH/client' && npm install"

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

