# Docker Deployment Guide - Simplexr Headless CMS 3D

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Quick Start](#quick-start)
3. [Project Structure](#project-structure)
4. [Environment Configuration](#environment-configuration)
5. [Running the Application](#running-the-application)
6. [Managing Containers](#managing-containers)
7. [Development Mode](#development-mode)
8. [Production Deployment](#production-deployment)
9. [Health Checks](#health-checks)
10. [Troubleshooting](#troubleshooting)

---

## Prerequisites

Before you begin, ensure you have the following installed:

- **Docker Engine** 20.10+ 
- **Docker Compose** 2.0+ 
- **Git** (to clone the repository)

Verify your installation:

```bash
docker --version
docker-compose --version
```

---

## Quick Start

### 1. Clone and Navigate

```bash
git clone <repository-url>
cd simplexr-headless-cms-3d
```

### 2. Configure Environment

```bash
# Copy environment template
cp docker/envs/.env.development .env

# Review and modify as needed
nano .env
```

### 3. Start All Services

```bash
# Using the convenience script
./scripts/docker-up.sh -b

# Or directly with docker-compose
docker-compose -f docker/docker-compose.yml up -d --build
```

### 4. Verify Installation

```bash
# Check container status
docker-compose -f docker/docker-compose.yml ps

# View logs
./scripts/docker-logs.sh
```

### 5. Access the Application

| Service | URL | Credentials |
|---------|-----|-------------|
| Admin UI | http://localhost:8080 | - |
| API | http://localhost:3000 | - |
| MinIO Console | http://localhost:9001 | minio / minio123 |

---

## Project Structure

```
simplexr-headless-cms-3d/
├── docker/
│   ├── docker-compose.yml          # Main orchestration file
│   ├── .dockerignore               # Docker ignore rules
│   ├── backend/
│   │   ├── Dockerfile             # Production backend image
│   │   └── Dockerfile.dev         # Development backend image
│   ├── admin/
│   │   ├── Dockerfile             # Production admin image
│   │   ├── Dockerfile.dev         # Development admin image
│   │   └── nginx.conf             # Nginx configuration
│   ├── minio/
│   │   └── init.sh                # MinIO initialization script
│   └── envs/
│       ├── .env.development       # Development environment
│       ├── .env.staging           # Staging environment
│       └── .env.production       # Production environment
├── scripts/
│   ├── docker-up.sh               # Start containers
│   ├── docker-down.sh             # Stop containers
│   └── docker-logs.sh             # View logs
└── docs/
    ├── DOCKER-DEPLOYMENT.md       # This file
    └── plans/
        └── docker-containerization-plan.md
```

---

## Environment Configuration

### Development Environment

For local development:

```bash
cp docker/envs/.env.development .env
```

Key settings:
- `USE_REAL_SERVICES=false` - Uses in-memory stubs
- Services accessible at `localhost`

### Staging Environment

For pre-production testing:

```bash
cp docker/envs/.env.staging .env.staging
docker-compose -f docker/docker-compose.yml --env-file .env.staging up -d
```

### Production Environment

For production deployment:

```bash
cp docker/envs/.env.production .env.production
# Edit and set all required environment variables
docker-compose -f docker/docker-compose.yml --env-file .env.production up -d --build
```

---

## Running the Application

### Start All Services

```bash
# Detached mode (recommended)
docker-compose -f docker/docker-compose.yml up -d

# With build
docker-compose -f docker/docker-compose.yml up -d --build

# Fresh start (removes existing containers and volumes)
docker-compose -f docker/docker-compose.yml down -v
docker-compose -f docker/docker-compose.yml up -d --build
```

### Start Specific Service

```bash
# Start only backend
docker-compose -f docker/docker-compose.yml up -d backend

# Start backend and database only
docker-compose -f docker/docker-compose.yml up -d backend postgres
```

### View Logs

```bash
# All services
docker-compose -f docker/docker-compose.yml logs -f

# Specific service
docker-compose -f docker/docker-compose.yml logs -f backend

# Last 50 lines
docker-compose -f docker/docker-compose.yml logs --tail=50
```

---

## Managing Containers

### Stop Services

```bash
# Stop all services
docker-compose -f docker/docker-compose.yml down

# Stop and remove volumes (data loss!)
docker-compose -f docker/docker-compose.yml down -v

# Stop and remove images
docker-compose -f docker/docker-compose.yml down --rmi all
```

### Restart Services

```bash
# Restart all
docker-compose -f docker/docker-compose.yml restart

# Restart specific service
docker-compose -f docker/docker-compose.yml restart backend
```

### Scale Services

```bash
# Scale backend to 3 instances
docker-compose -f docker/docker-compose.yml up -d --scale backend=3
```

---

## Development Mode

### Using Development Dockerfiles

```bash
# Build with development images
docker-compose -f docker/docker-compose.yml -f docker/docker-compose.override.yml up -d --build
```

### Hot Reload Configuration

For development, you can mount source directories for hot reload:

```yaml
# docker-compose.override.yml
services:
  backend:
    volumes:
      - ./src:/app/src
      - ./prisma:/app/prisma
  admin:
    volumes:
      - ./admin/src:/app/admin/src
```

---

## Production Deployment

### Security Checklist

- [ ] Use strong, unique passwords for all services
- [ ] Enable TLS/SSL for all endpoints
- [ ] Use managed database services (Cloud SQL, RDS, etc.)
- [ ] Use managed Redis (ElastiCache, Memorystore, etc.)
- [ ] Use cloud storage (S3, GCS, etc.) instead of MinIO
- [ ] Set up proper firewall rules
- [ ] Enable audit logging
- [ ] Use secrets management (Vault, AWS Secrets Manager, etc.)

### Production docker-compose.override.yml

Create `docker-compose.prod.yml`:

```yaml
version: '3.9'

services:
  backend:
    deploy:
      replicas: 2
      resources:
        limits:
          cpus: '2'
          memory: 2G
        reservations:
          cpus: '1'
          memory: 1G
    environment:
      - NODE_ENV=production
      - USE_REAL_SERVICES=true
    restart_policy:
      condition: on-failure
      delay: 5s
      max_attempts: 3

  admin:
    deploy:
      replicas: 1
    environment:
      - NODE_ENV=production
```

Deploy with production settings:

```bash
docker-compose -f docker/docker-compose.yml -f docker/docker-compose.prod.yml up -d --build
```

---

## Health Checks

All services include health checks that verify:

| Service | Health Endpoint | Check |
|---------|----------------|-------|
| Backend | `http://localhost:3000/health` | HTTP 200 response |
| Admin | `http://localhost:80/health` | HTTP 200 response |
| PostgreSQL | `pg_isready` | Database connection |
| Redis | `redis-cli ping` | PING response |
| MinIO | `http://localhost:9000/minio/health/live` | MinIO health |

### View Health Status

```bash
# All containers
docker-compose -f docker/docker-compose.yml ps

# Specific container
docker inspect simplexr-backend --format='{{.State.Health.Status}}'
```

---

## Troubleshooting

### Container Fails to Start

```bash
# Check logs
docker-compose -f docker/docker-compose.yml logs backend

# Check container events
docker events --filter container=simplexr-backend
```

### Database Connection Issues

```bash
# Test database connection
docker exec -it simplexr-postgres psql -U dam -d dam

# Check database health
docker exec -it simplexr-postgres pg_isready -U dam
```

### Redis Connection Issues

```bash
# Test Redis connection
docker exec -it simplexr-redis redis-cli ping

# Check Redis logs
docker exec -it simplexr-redis redis-cli info
```

### MinIO Issues

```bash
# Check MinIO logs
docker logs simplexr-minio

# Access MinIO directly
docker exec -it simplexr-minio mc admin info myminio
```

### Clear All Data and Start Fresh

```bash
# Stop all containers and remove volumes
docker-compose -f docker/docker-compose.yml down -v

# Remove all images (optional)
docker system prune -a

# Rebuild and start
docker-compose -f docker/docker-compose.yml up -d --build
```

---

## Good Docker Practices Implemented

### 1. Multi-Stage Builds

```dockerfile
# Build stage
FROM node:20-alpine AS builder
RUN npm ci && npm run build

# Production stage
FROM node:20-alpine
COPY --from=builder /app/dist ./dist
```

### 2. Non-Root Users

```dockerfile
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs
USER nodejs
```

### 3. Health Checks

```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 10s
```

### 4. Resource Limits

```yaml
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 2G
```

### 5. Layer Caching Optimization

- Dependencies installed before source code
- Static assets at the end
- Multi-line commands combined

---

## Useful Commands

```bash
# View resource usage
docker stats

# View container processes
docker top simplexr-backend

# Execute command in container
docker exec -it simplexr-backend sh

# Copy files from container
docker cp simplexr-backend:/app/logs ./logs

# View network configuration
docker network inspect simplexr-headless-cms-3d_simplexr-network
```
