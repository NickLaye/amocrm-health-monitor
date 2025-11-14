#!/bin/bash

echo "========================================="
echo "amoCRM Health Monitor - Installation"
echo "========================================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo -e "${YELLOW}Node.js is not installed. Please install Node.js 16+ first.${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Node.js found:${NC} $(node --version)"
echo ""

# Install backend dependencies
echo "Installing backend dependencies..."
npm install

if [ $? -ne 0 ]; then
    echo -e "${YELLOW}Failed to install backend dependencies${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Backend dependencies installed${NC}"
echo ""

# Install frontend dependencies
echo "Installing frontend dependencies..."
cd client
npm install

if [ $? -ne 0 ]; then
    echo -e "${YELLOW}Failed to install frontend dependencies${NC}"
    exit 1
fi

cd ..
echo -e "${GREEN}✓ Frontend dependencies installed${NC}"
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "Creating .env file from template..."
    cp .env.example .env
    echo -e "${GREEN}✓ .env file created${NC}"
    echo -e "${YELLOW}⚠ Please edit .env file and add your credentials!${NC}"
else
    echo -e "${GREEN}✓ .env file already exists${NC}"
fi

echo ""
echo "========================================="
echo -e "${GREEN}Installation completed!${NC}"
echo "========================================="
echo ""
echo "Next steps:"
echo "1. Edit .env file with your amoCRM credentials"
echo "2. Run 'npm run dev' to start in development mode"
echo "3. Or run 'npm start' for production mode"
echo ""

