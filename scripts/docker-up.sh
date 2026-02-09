#!/bin/bash
# =============================================================================
# Docker Start Script - Simplexr Headless CMS 3D
# =============================================================================
# Starts all Docker containers for the application.
#
# Usage: ./scripts/docker-up.sh [OPTIONS]
#   -d    Run in detached mode (default)
#   -b    Build images before starting
#   -v    Remove volumes before starting (fresh start)
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Default options
DETACH=true
BUILD=false
FRESH=false

# Parse arguments
while getopts "bdv" opt; do
    case $opt in
        b)
            BUILD=true
            ;;
        d)
            DETACH=true
            ;;
        v)
            FRESH=true
            ;;
        \?)
            print_error "Invalid option: -$OPTARG"
            exit 1
            ;;
    esac
done

print_status "Starting Simplexr CMS 3D Docker containers..."

# Check if Docker is running
if ! docker info &> /dev/null; then
    print_error "Docker is not running. Please start Docker first."
    exit 1
fi

# Stop and remove existing containers if fresh start
if [ "$FRESH" = true ]; then
    print_warning "Fresh start requested - removing existing containers and volumes..."
    docker-compose -f docker/docker-compose.yml down -v || true
fi

# Build images if requested
if [ "$BUILD" = true ]; then
    print_status "Building Docker images..."
    docker-compose -f docker/docker-compose.yml build --no-cache
fi

# Start services
if [ "$DETACH" = true ]; then
    print_status "Starting containers in detached mode..."
    docker-compose -f docker/docker-compose.yml up -d
else
    print_status "Starting containers in foreground mode..."
    docker-compose -f docker/docker-compose.yml up
fi

# Wait for services to be healthy
print_status "Waiting for services to be healthy..."
sleep 10

# Check service health
print_status "Checking service health..."

SERVICES=("backend" "admin" "postgres" "redis" "minio")
for service in "${SERVICES[@]}"; do
    container_name="simplexr-$service"
    if docker ps --format '{{.Names}}' | grep -q "$container_name"; then
        status=$(docker inspect --format='{{.State.Status}}' "$container_name" 2>/dev/null || echo "unknown")
        if [ "$status" = "running" ]; then
            print_status "$service is running"
        else
            print_warning "$service is $status"
        fi
    fi
done

print_status ""
print_status "=========================================="
print_status "Simplexr CMS 3D is starting!"
print_status "=========================================="
print_status "Admin UI: http://localhost:8080"
print_status "API:      http://localhost:3000"
print_status "MinIO:    http://localhost:9000"
print_status "MinIO UI: http://localhost:9001"
print_status ""
print_status "To view logs: docker-compose -f docker/docker-compose.yml logs -f"
print_status "=========================================="
