#!/bin/bash
# =============================================================================
# Docker Logs Script - Simplexr Headless CMS 3D
# =============================================================================
# View logs from Docker containers.
#
# Usage: ./scripts/docker-logs.sh [OPTIONS] [SERVICE]
#   -f    Follow log output
#   -t    Show timestamps
#   -n    Number of lines to show (default: 100)
#
# Examples:
#   ./scripts/docker-logs.sh              # All logs, last 100 lines
#   ./scripts/logs.sh -f                  # Follow all logs
#   ./scripts/docker-logs.sh backend       # Backend logs only
#   ./scripts/docker-logs.sh -f postgres  # Follow postgres logs
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

# Colors for output
GREEN='\033[0;32m'
NC='\033[0m'

print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

# Default options
FOLLOW=false
TIMESTAMPS=false
LINES=100
SERVICE=""

# Parse arguments
while getopts "ftn:" opt; do
    case $opt in
        f)
            FOLLOW=true
            ;;
        t)
            TIMESTAMPS=true
            ;;
        n)
            LINES=$OPTARG
            ;;
        \?)
            echo "Invalid option: -$OPTARG"
            exit 1
            ;;
    esac
done

# Remaining arguments are service names
shift $((OPTIND - 1))
if [ $# -gt 0 ]; then
    SERVICE="$1"
fi

# Build command
COMMAND="docker-compose -f docker/docker-compose.yml logs --tail=$LINES"

if [ "$FOLLOW" = true ]; then
    COMMAND="$COMMAND --follow"
fi

if [ "$TIMESTAMPS" = true ]; then
    COMMAND="$COMMAND --timestamps"
fi

if [ -n "$SERVICE" ]; then
    COMMAND="$COMMAND $SERVICE"
fi

print_status "Viewing logs..."
eval "$COMMAND"
