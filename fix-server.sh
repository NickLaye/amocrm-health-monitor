#!/bin/bash

# Quick fix script for server issues

SERVER="root@amohealth.duckdns.org"
DEPLOY_PATH="/root/Health Check amoCRM"

echo "Fixing server issues..."
echo ""

# Copy local .env to server if exists
if [ -f ".env" ]; then
    echo "📤 Uploading .env file to server..."
    scp .env "$SERVER:$DEPLOY_PATH/"
    echo "✅ .env uploaded"
else
    echo "❌ .env file not found locally"
    echo "⚠️  You need to create .env file. Use .env.example as template"
    exit 1
fi

# Fix nginx config and restart backend
ssh "$SERVER" << 'ENDSSH'
    cd "/root/Health Check amoCRM/current"
    
    # Copy .env to current directory
    if [ -f "../.env" ]; then
        cp ../.env .env
        echo "✅ .env copied to current directory"
    fi
    
    # Fix nginx config  
    echo "🔧 Fixing Nginx configuration..."
    sudo cp nginx.conf /etc/nginx/sites-available/amohealth
    sudo nginx -t && sudo systemctl reload nginx
    echo "✅ Nginx fixed and reloaded"
    
    # Restart backend
    echo "🔄 Restarting backend..."
    pm2 restart amocrm-health-monitor
    pm2 save
    
    echo ""
    echo "Waiting 5 seconds..."
    sleep 5
    
    echo "📊 PM2 Status:"
    pm2 list
    
    echo ""
    echo "📋 Application logs:"
    pm2 logs amocrm-health-monitor --lines 15 --nostream || true
ENDSSH

echo ""
echo "✅ Server fixed!"
echo ""

# Test endpoints
echo "🧪 Testing endpoints..."
curl -k -s https://amohealth.duckdns.org/health | head -5
echo ""
echo ""
echo "Visit: https://amohealth.duckdns.org"

