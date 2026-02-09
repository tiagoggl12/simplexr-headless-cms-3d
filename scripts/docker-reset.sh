#!/bin/bash
# =============================================================================
# Docker Reset Script - Simplexr Headless CMS 3D
# =============================================================================
# WARNING: This script removes ALL containers, volumes, and images!
# It will delete all data!
#
# Usage: ./scripts/docker-reset.sh
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

echo ""
print_warning "=========================================="
print_warning "WARNING: This will DELETE ALL Docker data!"
print_warning "=========================================="
echo ""
print_status "This will remove:"
print_status "  - All containers"
print_status "  - All volumes (databases, files, etc.)"
print_status "  - All images"
echo ""
read -p "Are you sure you want to continue? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    print_status "Reset cancelled."
    exit 0
fi

print_status "Stopping and removing all containers..."
docker-compose -f docker/docker-compose.yml down -v

print_status "Removing all Docker images for this project..."
docker images "simplexr-*" -q | xargs -r docker rmi -f 2>/dev/null || true

print_status "Removing MinIO-related images..."
docker images "minio/*" -q | xargs -r docker rmi -f 2>/dev/null || true

print_status "Removing unused Docker objects..."
docker system prune -af --volumes

print_status "All Docker data has been reset."
print_status "=========================================="
