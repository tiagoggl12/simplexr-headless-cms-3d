#!/bin/bash
# Backup Script - Backup all Docker volumes
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="backups/$TIMESTAMP"

mkdir -p "$BACKUP_DIR"

echo "Backing up PostgreSQL..."
docker exec simplexr-postgres pg_dump -U dam dam > "$BACKUP_DIR/postgres.sql"

echo "Backing up Redis..."
docker exec simplexr-redis redis-cli BGSAVE
sleep 5
docker cp simplexr-redis:/data/appendonly.aof "$BACKUP_DIR/redis.aof" 2>/dev/null || true

echo "Backing up MinIO..."
docker cp simplexr-minio:/data "$BACKUP_DIR/minio_data" 2>/dev/null || true

echo "Backup complete: $BACKUP_DIR"
