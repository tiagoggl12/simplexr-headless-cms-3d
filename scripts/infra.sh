#!/bin/bash
# Docker Infra Script - Manage infrastructure services
set -e

case "$1" in
  up)
    echo "Starting infrastructure services..."
    docker compose -f docker/docker-compose.yml up -d
    ;;
  down)
    echo "Stopping infrastructure services..."
    docker compose -f docker/docker-compose.yml down
    ;;
  restart)
    echo "Restarting infrastructure services..."
    docker compose -f docker/docker-compose.yml restart
    ;;
  logs)
    echo "Showing logs..."
    docker compose -f docker/docker-compose.yml logs -f
    ;;
  status)
    docker ps --filter "name=simplexr"
    ;;
  *)
    echo "Usage: $0 {up|down|restart|logs|status}"
    exit 1
    ;;
esac
