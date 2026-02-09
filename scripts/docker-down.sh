#!/bin/bash
# =============================================================================
# Docker Stop Script - Simplexr Headless CMS 3D
# =============================================================================
# Stops and optionally removes all Docker containers.
#
# Usage: ./scripts/docker-down.sh [OPTIONS]
#   -v    Also remove volumes (data will be lost!)
#   -r    Also remove images
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

print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

# Default options
REMOVE_VOLUMES=false
REMOVE_IMAGES=false

# Parse arguments
while getopts "vr" opt; do
    case $opt in
        v)
            REMOVE_VOLUMES=true
            ;;
        r)
            REMOVE_IMAGES=true
            ;;
        \?)
            echo "Invalid option: -$OPTARG"
            exit 1
            ;;
    esac
done

print_status "Stopping Simplexr CMS 3D Docker containers..."

# Stop and remove containers
if [ "$REMOVE_VOLUMES" = true ]; then
    print_warning "Removing volumes - all data will be lost!"
    docker-compose -f docker/docker-compose.yml down -v
else
    docker-compose -f docker/docker-compose.yml down
fi

# Remove images if requested
if [ "$REMOVE_IMAGES" = true ]; then
    print_warning "Removing Docker images..."
    docker images "simplexr-*" -q | xargs -r docker rmi -f
    docker images "minio/*" -q | xargs -r docker rmi -f
    docker images "postgres:*" -q | xargs -r docker rmi -f
    docker images "redis:*" -q | xargs -r docker rmi -f
fi

print_status "All containers stopped."
print_status "=========================================="
