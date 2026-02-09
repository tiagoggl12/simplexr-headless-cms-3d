# Plano de Containerização Docker - Simplexr Headless CMS 3D

## Visão Geral da Arquitetura

```mermaid
graph TB
    subgraph "Frontend Admin"
        A[React + Vite<br/>Porta 5173]
    end
    
    subgraph "Backend API"
        B[Node.js + Fastify<br/>Porta 3000]
    end
    
    subgraph "Infraestrutura"
        C[(PostgreSQL<br/>Porta 5432)]
        D[(Redis<br/>Porta 6379)]
        E[(MinIO/S3<br/>Portas 9000-9001)]
    end
    
    A -->|HTTP REST| B
    B -->|TCP| C
    B -->|TCP| D
    B -->|S3 API| E
    
    F[Upload de Assets] --> E
    E --> G[CDN Cache]
```

## Componentes do Sistema

| Componente | Tecnologia | Descrição | Porta |
|------------|------------|-----------|-------|
| backend | Node.js + Fastify | API principal do CMS | 3000 |
| admin | React + Vite | Interface de administração | 5173 |
| postgres | PostgreSQL 16 | Banco de dados relacional | 5432 |
| redis | Redis 7 | Filas de processamento (BullMQ) | 6379 |
| minio | MinIO | Storage compatível com S3 | 9000, 9001 |
| mc | MinIO Client | Client CLI para operações S3 | - |

## Estrutura de Arquivos Docker

```
docker/
├── docker-compose.yml          # Orquestração principal
├── docker-compose.override.yml # Overrides para desenvolvimento
├── docker-compose.prod.yml     # Configurações de produção
├── .dockerignore
├── backend/
│   ├── Dockerfile              # Imagem do backend
│   └── Dockerfile.dev          # Imagem para desenvolvimento
├── admin/
│   ├── Dockerfile              # Imagem do frontend admin
│   └── Dockerfile.dev          # Imagem para desenvolvimento
├── minio/
│   └── init.sh                # Script de inicialização do MinIO
└── envs/
    ├── .env.example           # Template de variáveis
    ├── .env.development       # Desenvolvimento local
    ├── .env.staging           # Ambiente de staging
    └── .env.production        # Ambiente de produção
```

---

## Tasks de Implementação

### Phase 1: Configurações Base
- [ ] Criar `.dockerignore` unificado para backend e admin
- [ ] Criar `docker/backend/Dockerfile` com multi-stage build
- [ ] Criar `docker/backend/Dockerfile.dev` para desenvolvimento
- [ ] Criar `docker/admin/Dockerfile` com multi-stage build
- [ ] Criar `docker/admin/Dockerfile.dev` para desenvolvimento

### Phase 2: Docker Compose Expandido
- [ ] Expandir `docker-compose.yml` com todos os serviços
- [ ] Configurar rede bridge para comunicação entre containers
- [ ] Configurar volumes para persistência de dados
- [ ] Adicionar health checks para cada serviço
- [ ] Configurar política de restart

### Phase 3: Scripts de Inicialização
- [ ] Criar script `docker/minio/init.sh` para setup de buckets
- [ ] Criar script `scripts/docker-up.sh` para iniciar ambiente
- [ ] Criar script `scripts/docker-down.sh` para parar ambiente
- [ ] Criar script `scripts/docker-logs.sh` para visualização de logs
- [ ] Criar script `scripts/docker-reset.sh` para reset completo

### Phase 4: Documentação
- [ ] Criar `docs/DOCKER-DEPLOYMENT.md` com guia completo
- [ ] Documentar variáveis de ambiente por ambiente
- [ ] Documentar comandos de gerenciamento
- [ ] Adicionar seção de boas práticas Docker

---

## Boas Práticas Docker Implementadas

### 1. Multi-Stage Builds

#### Backend Dockerfile
```dockerfile
# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

# Stage 2: Runtime
FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY dist ./dist
EXPOSE 3000
CMD ["node", "dist/server.js"]
```

#### Admin Dockerfile
```dockerfile
# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Runtime - Nginx
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY docker/admin/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

### 2. Health Checks

```yaml
services:
  backend:
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 10s

  postgres:
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U dam -d dam"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  minio:
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
      interval: 30s
      timeout: 20s
      retries: 3
```

### 3. Separação de Camadas (Layer Caching)

- Cada COPY em Dockerfile cria nova camada
- Dependências instaladas antes do código fonte
- Arquivos modificados com maior frequência no final do COPY

### 4. Variáveis de Ambiente por Ambiente

#### Desenvolvimento
```env
NODE_ENV=development
USE_REAL_SERVICES=false
DATABASE_URL=postgresql://dam:dam@postgres:5432/dam
REDIS_HOST=redis
S3_ENDPOINT=http://minio:9000
```

#### Produção
```env
NODE_ENV=production
USE_REAL_SERVICES=true
DATABASE_URL=postgresql://${DB_USER}:${DB_PASS}@postgres:5432/${DB_NAME}
REDIS_HOST=redis
S3_ENDPOINT=https://${S3_ENDPOINT}
AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}
AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}
```

---

## Variáveis de Ambiente

| Variável | Desenvolvimento | Produção | Descrição |
|----------|-----------------|----------|-----------|
| NODE_ENV | development | production | Ambiente de execução |
| PORT | 3000 | 3000 | Porta do backend |
| HOST | 0.0.0.0 | 0.0.0.0 | Host do backend |
| USE_REAL_SERVICES | false | true | Usar serviços reais |
| DATABASE_URL | postgresql://dam:dam@postgres:5432/dam | postgresql://${DB_USER}:${DB_PASS}@postgres:5432/${DB_NAME} | URL do PostgreSQL |
| REDIS_HOST | redis | redis | Host do Redis |
| REDIS_PORT | 6379 | 6379 | Porta do Redis |
| S3_ENDPOINT | http://minio:9000 | https://${S3_ENDPOINT} | Endpoint S3 |
| S3_BUCKET | dam-assets | ${S3_BUCKET} | Nome do bucket |
| AWS_ACCESS_KEY_ID | minio | ${AWS_ACCESS_KEY_ID} | AWS Access Key |
| AWS_SECRET_ACCESS_KEY | minio123 | ${AWS_SECRET_ACCESS_KEY} | AWS Secret Key |
| S3_PUBLIC_ENDPOINT | http://localhost:9000 | ${CDN_URL} | Endpoint público |

---

## Comandos de Gerenciamento

### Desenvolvimento Local
```bash
# Iniciar todos os serviços
docker-compose -f docker/docker-compose.yml up -d

# Ver logs
docker-compose -f docker/docker-compose.yml logs -f

# Parar todos os serviços
docker-compose -f docker/docker-compose.yml down

# Reset completo (remove volumes)
docker-compose -f docker/docker-compose.yml down -v
```

### Produção
```bash
# Build e start
docker-compose -f docker/docker-compose.yml -f docker/docker-compose.prod.yml up -d --build

# Escalabilidade
docker-compose -f docker/docker-compose.yml -f docker/docker-compose.prod.yml up -d --scale backend=3
```

---

## Fluxo de Inicialização

```mermaid
sequenceDiagram
    participant User
    participant Docker
    participant Postgres
    participant Redis
    participant MinIO
    participant Backend
    participant Admin
    
    User->>Docker: docker-compose up
    Docker->>Postgres: Start container
    Postgres->>Postgres: Initialize DB
    Docker->>Redis: Start container
    Redis->>Redis: Initialize
    Docker->>MinIO: Start container
    MinIO->>MinIO: Create buckets
    Note over MinIO: Wait for health check
    Docker->>Backend: Start container
    Backend->>Postgres: Run migrations
    Backend->>Backend: Start server
    Docker->>Admin: Start container
    Admin->>Nginx: Serve static files
    User->>Admin: Access http://localhost:5173
    User->>Backend: API calls http://localhost:3000
```
