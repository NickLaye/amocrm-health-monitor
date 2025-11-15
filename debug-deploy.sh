#!/bin/bash

# Debug and Fix Deployment Script
# This script connects to the server and diagnoses/fixes deployment issues

set -e

# Configuration
SERVER="${DEPLOY_SERVER:-root@amohealth.duckdns.org}"
DEPLOY_PATH="/root/Health Check amoCRM"

echo "==========================================="
echo "Debug and Fix Deployment on Server"
echo "==========================================="
echo ""

# Check SSH connection
echo "1. Checking SSH connection..."
if ! ssh -o ConnectTimeout=5 "$SERVER" "echo 'Connected successfully'" 2>/dev/null; then
    echo "❌ Cannot connect to server. Please check SSH keys or use:"
    echo "   export DEPLOY_SERVER=root@amohealth.duckdns.org"
    exit 1
fi
echo "✅ SSH connection successful"
echo ""

# Get server status
echo "2. Checking server status..."
ssh "$SERVER" << 'ENDSSH'
    echo "Current directory structure:"
    ls -la "/root/Health Check amoCRM/" 2>/dev/null || echo "Deploy path not found"
    echo ""
    
    echo "Current directory files:"
    ls -la "/root/Health Check amoCRM/current" 2>/dev/null || echo "Current directory not found"
    echo ""
    
    echo "PM2 status:"
    pm2 list
    echo ""
    
    echo "PM2 logs (last 30 lines):"
    pm2 logs amocrm-health-monitor --lines 30 --nostream 2>/dev/null || echo "No logs available"
    echo ""
    
    echo "Backend port check:"
    netstat -tulpn | grep 3001 || echo "Port 3001 not listening"
    echo ""
    
    echo ".env file status:"
    if [ -f "/root/Health Check amoCRM/.env" ]; then
        echo "✅ .env file exists"
        echo "Environment variables (sanitized):"
        cat "/root/Health Check amoCRM/.env" | grep -E "^[A-Z_]+" | sed 's/=.*/=***/' | head -10
    else
        echo "❌ .env file NOT found"
    fi
    echo ""
    
    echo "Frontend files:"
    ls -la "/root/Health Check amoCRM/current/client-build" 2>/dev/null | head -10 || echo "Frontend build not found"
    echo ""
    
    echo "Nginx status:"
    systemctl status nginx | grep Active || echo "Cannot check Nginx status"
    echo ""
    
    echo "Nginx error logs (last 20 lines):"
    tail -20 /var/log/nginx/amocrm-health-error.log 2>/dev/null || echo "No error logs"
ENDSSH

echo ""
echo "3. Attempting to fix issues..."
echo ""

# Fix deployment
ssh "$SERVER" << ENDSSH
    set -e
    
    cd "${DEPLOY_PATH}"
    
    # Check if current directory exists and has files
    if [ ! -d "current" ] || [ ! -f "current/package.json" ]; then
        echo "❌ Current directory is missing or incomplete"
        echo "Attempting to redeploy..."
        
        if [ -f "deploy.tar.gz" ]; then
            echo "Found deploy.tar.gz, extracting..."
            rm -rf current
            tar -xzf deploy.tar.gz
            mv deploy current
            echo "✅ Extracted deployment files"
        else
            echo "❌ No deploy.tar.gz found. Please run full deployment."
            exit 1
        fi
    fi
    
    cd current
    
    # Check .env file
    if [ ! -f ".env" ]; then
        if [ -f "../.env" ]; then
            echo "Copying .env from parent directory..."
            cp ../.env .env
            echo "✅ .env file copied"
        else
            echo "⚠️  WARNING: .env file not found. Application may not start correctly."
            echo "Please create .env file manually or copy it from local machine."
        fi
    else
        echo "✅ .env file exists"
    fi
    
    # Install dependencies if node_modules is missing
    if [ ! -d "node_modules" ]; then
        echo "Installing dependencies..."
        npm install --production
        echo "✅ Dependencies installed"
    fi
    
    # Fix frontend permissions
    if [ -d "client-build" ]; then
        echo "Fixing frontend file permissions..."
        chmod -R 755 client-build
        echo "✅ Frontend permissions fixed"
    fi
    
    # Update Nginx config
    if [ -f "nginx.conf" ]; then
        echo "Updating Nginx configuration..."
        sudo cp nginx.conf /etc/nginx/sites-available/amohealth
        sudo ln -sf /etc/nginx/sites-available/amohealth /etc/nginx/sites-enabled/
        sudo nginx -t && sudo systemctl reload nginx
        echo "✅ Nginx configuration updated and reloaded"
    fi
    
    # Restart PM2
    echo "Restarting application with PM2..."
    pm2 delete amocrm-health-monitor 2>/dev/null || true
    
    if [ -f "ecosystem.config.js" ]; then
        pm2 start ecosystem.config.js
        echo "✅ Started with ecosystem.config.js"
    else
        pm2 start server/index.js --name amocrm-health-monitor --time
        echo "✅ Started with direct PM2 command"
    fi
    
    pm2 save
    
    echo ""
    echo "Waiting 5 seconds for application to start..."
    sleep 5
    
    echo ""
    echo "Final PM2 status:"
    pm2 list
    
    echo ""
    echo "Application logs:"
    pm2 logs amocrm-health-monitor --lines 10 --nostream || true
ENDSSH

echo ""
echo "4. Testing endpoints..."
echo ""

# Test health endpoint
echo "Testing /health endpoint..."
if response=$(curl -k -s -o /dev/null -w "%{http_code}" https://amohealth.duckdns.org/health 2>&1); then
    if [ "$response" = "200" ]; then
        echo "✅ Health endpoint: OK ($response)"
    else
        echo "⚠️  Health endpoint: $response"
    fi
else
    echo "❌ Health endpoint: Failed to connect"
fi

# Test main page
echo "Testing main page..."
if response=$(curl -k -s -o /dev/null -w "%{http_code}" https://amohealth.duckdns.org/ 2>&1); then
    if [ "$response" = "200" ]; then
        echo "✅ Main page: OK ($response)"
    else
        echo "⚠️  Main page: $response"
    fi
else
    echo "❌ Main page: Failed to connect"
fi

echo ""
echo "==========================================="
echo "✅ Debug and fix process completed!"
echo "==========================================="
echo ""
echo "Visit: https://amohealth.duckdns.org"
echo ""

