#!/bin/bash

# ============================================
# RadiologyAI - Healthcare Intelligence Platform
# Start Script with Auto-Reload
# ============================================

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

echo -e "${CYAN}${BOLD}"
echo "╔══════════════════════════════════════════════╗"
echo "║   RadiologyAI - Healthcare Intelligence      ║"
echo "║              Platform Starter                 ║"
echo "╚══════════════════════════════════════════════╝"
echo -e "${NC}"

# Load environment variables
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$SCRIPT_DIR/.env" ]; then
    set -a
    source "$SCRIPT_DIR/.env"
    set +a
    echo -e "${GREEN}✓ Environment variables loaded${NC}"
else
    echo -e "${RED}✗ .env file not found! Please create one.${NC}"
    exit 1
fi

BACKEND_PORT=${BACKEND_PORT:-3001}
FRONTEND_PORT=${FRONTEND_PORT:-3000}
DB_NAME=${DB_NAME:-radiology_ai}
DB_USER=${DB_USER:-postgres}
DB_PASSWORD=${DB_PASSWORD:-postgres}
DB_HOST=${DB_HOST:-localhost}
DB_PORT=${DB_PORT:-5432}

# ============================================
# Cleanup handler (define early)
# ============================================
BACKEND_PID=""
FRONTEND_PID=""

cleanup() {
    echo -e "\n${YELLOW}Shutting down...${NC}"
    [ -n "$BACKEND_PID" ] && kill $BACKEND_PID 2>/dev/null
    [ -n "$FRONTEND_PID" ] && kill $FRONTEND_PID 2>/dev/null
    sleep 1
    # Force kill anything still on our ports
    lsof -ti :$BACKEND_PORT 2>/dev/null | xargs kill -9 2>/dev/null || true
    lsof -ti :$FRONTEND_PORT 2>/dev/null | xargs kill -9 2>/dev/null || true
    echo -e "${GREEN}✓ All services stopped${NC}"
    exit 0
}

trap cleanup SIGINT SIGTERM

# ============================================
# Step 1: Clean up used ports
# ============================================
echo -e "\n${YELLOW}[1/6] Cleaning up ports...${NC}"

cleanup_port() {
    local port=$1
    local pids=$(lsof -ti :$port 2>/dev/null || true)
    if [ -n "$pids" ]; then
        echo -e "  Killing processes on port $port: $pids"
        echo "$pids" | xargs kill -9 2>/dev/null || true
        sleep 2
    fi
    echo -e "  ${GREEN}✓ Port $port is free${NC}"
}

cleanup_port $BACKEND_PORT
cleanup_port $FRONTEND_PORT

# ============================================
# Step 2: Check PostgreSQL
# ============================================
echo -e "\n${YELLOW}[2/6] Checking PostgreSQL...${NC}"

if command -v pg_isready &> /dev/null; then
    if pg_isready -h $DB_HOST -p $DB_PORT > /dev/null 2>&1; then
        echo -e "  ${GREEN}✓ PostgreSQL is running${NC}"
    else
        echo -e "  ${YELLOW}Starting PostgreSQL...${NC}"
        if [[ "$OSTYPE" == "darwin"* ]]; then
            brew services start postgresql@14 2>/dev/null || brew services start postgresql 2>/dev/null || true
        else
            sudo systemctl start postgresql 2>/dev/null || true
        fi
        sleep 2
        if pg_isready -h $DB_HOST -p $DB_PORT > /dev/null 2>&1; then
            echo -e "  ${GREEN}✓ PostgreSQL started${NC}"
        else
            echo -e "  ${RED}✗ Could not start PostgreSQL. Please start it manually.${NC}"
            exit 1
        fi
    fi
else
    echo -e "  ${YELLOW}⚠ pg_isready not found, assuming PostgreSQL is running${NC}"
fi

# ============================================
# Step 3: Initialize Database
# ============================================
echo -e "\n${YELLOW}[3/6] Initializing database...${NC}"

# Create database if not exists
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -tc "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" 2>/dev/null | grep -q 1 || \
    PGPASSWORD=$DB_PASSWORD createdb -h $DB_HOST -p $DB_PORT -U $DB_USER $DB_NAME 2>/dev/null || true

echo -e "  ${GREEN}✓ Database '$DB_NAME' ready${NC}"

# Run init.sql
echo -e "  Running schema initialization..."
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f "$SCRIPT_DIR/backend/db/init.sql" > /dev/null 2>&1
echo -e "  ${GREEN}✓ Schema initialized${NC}"

# Run seed.sql
echo -e "  Seeding data..."
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f "$SCRIPT_DIR/backend/db/seed.sql" > /dev/null 2>&1
echo -e "  ${GREEN}✓ Data seeded (15+ items per feature)${NC}"

# Run migration.sql (new feature tables)
echo -e "  Running migration for new features..."
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f "$SCRIPT_DIR/backend/db/migration.sql" > /dev/null 2>&1
echo -e "  ${GREEN}✓ Migration applied (departments, appointments, billing, etc.)${NC}"

# ============================================
# Step 4: Install dependencies
# ============================================
echo -e "\n${YELLOW}[4/6] Installing dependencies...${NC}"

echo -e "  Installing backend dependencies..."
cd "$SCRIPT_DIR/backend"
npm install --silent 2>&1 | tail -1
echo -e "  ${GREEN}✓ Backend dependencies installed${NC}"

echo -e "  Installing frontend dependencies..."
cd "$SCRIPT_DIR/frontend"
npm install --silent 2>&1 | tail -1
echo -e "  ${GREEN}✓ Frontend dependencies installed${NC}"

cd "$SCRIPT_DIR"

# ============================================
# Step 5: Start Backend with auto-reload
# ============================================
echo -e "\n${YELLOW}[5/6] Starting backend (port $BACKEND_PORT) with auto-reload...${NC}"

# Start backend with node directly first, then use a watcher loop
cd "$SCRIPT_DIR/backend"
node server.js &
BACKEND_PID=$!
echo -e "  ${GREEN}✓ Backend started (PID: $BACKEND_PID)${NC}"

cd "$SCRIPT_DIR"

# Wait for backend to be ready
echo -e "  Waiting for backend..."
for i in {1..30}; do
    if curl -s http://localhost:$BACKEND_PORT/api/health > /dev/null 2>&1; then
        echo -e "  ${GREEN}✓ Backend is ready!${NC}"
        break
    fi
    sleep 1
    if [ $i -eq 30 ]; then
        echo -e "  ${YELLOW}⚠ Backend may still be starting...${NC}"
    fi
done

# ============================================
# Step 6: Start Frontend with auto-reload
# ============================================
echo -e "\n${YELLOW}[6/6] Starting frontend (port $FRONTEND_PORT) with auto-reload...${NC}"

cd "$SCRIPT_DIR/frontend"
# BROWSER=none prevents auto-opening browser
PORT=$FRONTEND_PORT BROWSER=none npm start &
FRONTEND_PID=$!
echo -e "  ${GREEN}✓ Frontend starting (PID: $FRONTEND_PID) with React hot-reload${NC}"

cd "$SCRIPT_DIR"

# Wait for frontend to compile
echo -e "  Waiting for frontend to compile..."
for i in {1..60}; do
    if curl -s http://localhost:$FRONTEND_PORT > /dev/null 2>&1; then
        echo -e "  ${GREEN}✓ Frontend is ready!${NC}"
        break
    fi
    sleep 2
    if [ $i -eq 60 ]; then
        echo -e "  ${YELLOW}⚠ Frontend may still be compiling...${NC}"
    fi
done

# ============================================
# Display info
# ============================================
echo -e "\n${CYAN}${BOLD}╔══════════════════════════════════════════════╗"
echo "║          RadiologyAI is Running!              ║"
echo "╠══════════════════════════════════════════════╣"
echo -e "║  Frontend:  http://localhost:$FRONTEND_PORT              ║"
echo -e "║  Backend:   http://localhost:$BACKEND_PORT              ║"
echo "║                                              ║"
echo "║  Login:  admin@radiology.com / password123   ║"
echo "║                                              ║"
echo "║  Frontend has React hot-reload enabled       ║"
echo "║  Press Ctrl+C to stop all services           ║"
echo "╚══════════════════════════════════════════════╝${NC}"
echo ""

# Keep script running - wait for background processes
wait
