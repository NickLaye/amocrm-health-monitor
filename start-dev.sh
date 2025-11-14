#!/bin/bash

echo "Starting amoCRM Health Monitor in development mode..."
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "Error: .env file not found!"
    echo "Please run ./install.sh first or create .env from .env.example"
    exit 1
fi

# Start backend in background
echo "Starting backend server..."
npm run dev &
BACKEND_PID=$!

# Wait a bit for backend to start
sleep 3

# Start frontend
echo "Starting frontend development server..."
cd client
npm start

# When frontend stops, also stop backend
kill $BACKEND_PID

