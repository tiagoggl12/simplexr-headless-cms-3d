# Docker Deployment Guide

## Quick Start

```bash
# Start infrastructure
docker compose -f docker/docker-compose.yml up -d

# Start development services
docker compose -f docker/docker-compose.dev.yml up -d
```

## Services

| Service | Port | Description |
|---------|------|-------------|
| Backend | 3001 | API server |
| Admin | 5174 | Frontend admin |
| PostgreSQL | 5432 | Database |
| Redis | 6379 | Job queues |
| MinIO | 9000 | S3 storage |
| MinIO Console | 9001 | Storage UI |

## Credentials

- **Admin**: admin@simplexr.dev / admin123
- **PostgreSQL**: dam / dam
- **MinIO**: minioadmin / minioadmin_secret

## Management Commands

```bash
# View logs
docker logs simplexr-backend-dev

# Restart service
docker restart simplexr-backend-dev

# Stop all
docker compose -f docker/docker-compose.yml down
```
