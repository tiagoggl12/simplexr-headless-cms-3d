#!/bin/bash
# Restore Script - Restore from backup
if [ -z "$1" ]; then
    echo "Usage: $0 <backup_timestamp>"
    exit 1
fi

BACKUP_DIR="backups/$1"
if [ ! -d "$BACKUP_DIR" ]; then
    echo "Backup not found: $BACKUP_DIR"
    exit 1
fi

echo "Restoring PostgreSQL..."
if [ -f "$BACKUP_DIR/postgres.sql" ]; then
    docker exec -i simplexr-postgres psql -U dam -d dam < "$BACKUP_DIR/postgres.sql"
fi

echo "Restore complete!"
