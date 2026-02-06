# SimpleXR Headless CMS 3D DAM

## Documentação Completa

**Versão:** V1/V2
**Status:** Produção
**Licença:** MIT

---

## Índice

1. [Conceito](#conceito)
2. [Arquitetura](#arquitetura)
3. [Modelo de Dados](#modelo-de-dados)
4. [API Endpoints](#api-endpoints)
5. [Pipeline de Processamento](#pipeline-de-processamento)
6. [Serviços](#serviços)
7. [Configuração](#configuração)
8. [Desenvolvimento](#desenvolvimento)

---

## Conceito

### O que é um Headless CMS DAM para 3D?

Um **Digital Asset Management (DAM)** Headless para 3D é um sistema backend que gerencia, processa e distribui ativos 3D sem fornecer uma interface frontend própria. Ele expõe APIs que podem ser consumidas por qualquer aplicação (web, mobile, VR/AR).

### Por que "Headless"?

- **Separação de responsabilidades:** O backend foca em gestão e processamento de ativos
- **Omnichannel:** O mesmo ativo serve websites, apps, AR/VR, games
- **Flexibilidade:** Frontends podem ser construídos com qualquer tecnologia

### O Problema que Resolve

No e-commerce tradicional, produtos são representados por fotos estáticas. Com o crescimento do AR (Apple AR Quick Look, Android AR Core) e visualizadores 3D web (Three.js, Babylon.js), há necessidade de:

1. **Formatos múltiplos:** GLB para web, USDZ para iOS AR
2. **Otimização:** Modelos 3D devem ser leves para carregar rápido
3. **Variantes:** Mesmo produto em cores/materiais diferentes
4. **Iluminação:** Preview consistente em diferentes ambientes
5. **Thumbnails:** Imagens estáticas para catálogos

### Abordagem GLB Master

```
┌─────────────────────────────────────────────────────────────────┐
│                    GLB MASTER (Source of Truth)                 │
├─────────────────────────────────────────────────────────────────┤
│  Upload → Validate → Normalize → Optimize                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
    ┌─────────┐        ┌──────────┐        ┌──────────────┐
    │   USDZ  │        │ Thumbnails│       │ Optimized GLB│
    │ (iOS AR)│        │ (per preset)       │   (Viewer)   │
    └─────────┘        └──────────┘        └──────────────┘
```

**GLB (glTF Binary)** é escolhido como formato master porque:
- Eficiente e compacto (binário)
- Suporta PBR materials
- Amplamente suportado por web/mobile
- Pode ser convertido para outros formatos

---

## Arquitetura

### Visão Geral

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              CLIENTE                                    │
│  (Admin Panel, E-commerce Site, Mobile App, AR Viewer)                  │
└──────────────────────────────────────┬──────────────────────────────────┘
                                       │ HTTP/REST API
                                       ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           API LAYER (Fastify)                           │
│  /assets /variants /presets /uploads /viewer/*                          │
└──────────────────────────────┬─────────────────────────────────────────┘
                               │
        ┌──────────────────────┼──────────────────────┐
        ▼                      ▼                      ▼
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│   STORE      │      │   STORAGE    │      │    QUEUE     │
│              │      │              │      │              │
│ PostgreSQL   │      │ S3 / MinIO   │      │ Redis/BullMQ │
│ ou Memory    │      │              │      │              │
└──────────────┘      └──────────────┘      └──────────────┘
                                                    │
                                                    ▼
                                         ┌──────────────────┐
                                         │  WORKERS         │
                                         │  (glTF-Transform)│
                                         │  - Validate      │
                                         │  - Optimize      │
                                         │  - Convert USDZ  │
                                         │  - Thumbnails    │
                                         └──────────────────┘
```

### Stack Tecnológico

| Camada | Tecnologia |
|--------|------------|
| API Framework | Fastify |
| Linguagem | TypeScript 5.x |
| Banco de Dados | PostgreSQL (opcional: in-memory) |
| Storage | S3 / MinIO (presigned URLs) |
| Queue | Redis + BullMQ |
| Processamento 3D | glTF-Transform, Blender |
| Testes | Vitest |
| Build | tsc |

---

## Modelo de Dados

### Entidades Principais

#### Asset3D

Representa um ativo 3D completo (ex: um produto de e-commerce).

```typescript
interface Asset3D {
  id: string;           // UUID
  name: string;         // Nome descritivo
  masterUrl: string;    // URL do GLB master
  status: AssetStatus;  // draft | processing | ready | failed
  createdAt: Date;
  updatedAt: Date;
}
```

#### MaterialVariant

Representa uma variação de material para um ativo (ex: cores diferentes).

```typescript
interface MaterialVariant {
  id: string;
  assetId: string;      // Referência para Asset3D

  // Identificação
  name: string;         // Ex: "Vermelho", "Azul Marinho"

  // Texturas PBR
  albedoMapUrl?: string;      // Mapa de cor base
  normalMapUrl?: string;      // Mapa de normais
  metallicMapUrl?: string;    // Mapa de metalidade
  roughnessMapUrl?: string;   // Mapa de aspereza
  aoMapUrl?: string;          // Ambient Occlusion
  emissiveMapUrl?: string;    // Mapa emissivo

  // Valores escalares PBR
  baseColor?: string;   // #RRGGBB hex
  metallic?: number;    // 0.0 - 1.0
  roughness?: number;   // 0.0 - 1.0

  status: MaterialVariantStatus;
  createdAt: Date;
}
```

**Workflow PBR (Physically Based Rendering):**

```
Albedo (cor) + Normal (geometria) + Metallic (metal/não-metal)
+ Roughness (aspereza) + AO (oclusão) → Realismo
```

#### LightingPreset

Configuração de iluminação para renderização.

```typescript
interface LightingPreset {
  id: string;
  name: string;         // Ex: "Studio", "Outdoor", "Showroom"
  hdriUrl: string;      // URL do ambiente HDRI (.hdr)
  exposure: number;     // 1.0 = padrão
  intensity: number;    // Multiplicador de intensidade
  tags: string[];       // ["studio", "product", "interior"]
  createdAt: Date;
}
```

#### RenderPreset

Combina ativo + iluminação + câmera para uma view específica.

```typescript
interface RenderPreset {
  id: string;
  assetId: string;
  lightingPresetId: string;

  // Configuração de câmera
  cameraConfig: {
    position: [number, number, number];  // [x, y, z]
    target: [number, number, number];    // Ponto de foco
    fov: number;                         // Field of view
  };

  createdAt: Date;
}
```

#### RenderManifest

Configuração resolveda para o viewer (schema versionado).

```typescript
interface RenderManifest {
  version: string;      // "1.0"
  manifest: {
    asset: {
      id: string;
      name: string;
      url: string;
      format: "glb";
    };
    material?: {        // Opcional, se variante selecionada
      id: string;
      name: string;
      pbr: {
        albedoMap?: string;
        normalMap?: string;
        metallicMap?: string;
        roughnessMap?: string;
        aoMap?: string;
        emissiveMap?: string;
        baseColor?: string;
        metallic?: number;
        roughness?: number;
      };
    };
    lighting: {
      id: string;
      name: string;
      hdri: string;
      exposure: number;
      intensity: number;
    };
    camera: {
      position: [number, number, number];
      target: [number, number, number];
      fov: number;
    };
    quality: {
      shadows: boolean;
      antialiasing: string;
      tonemapping: string;
    };
  };
}
```

---

## API Endpoints

### Gestão de Ativos

```
POST   /assets
       Body: { name, masterUrl }
       → Cria novo Asset3D com status "draft"

GET    /assets
       Query: ?status=ready&limit=20&offset=0
       → Lista ativos com filtros e paginação

GET    /assets/:id
       → Detalhes do ativo

PATCH  /assets/:id
       Body: { name?, status? }
       → Atualiza ativo

DELETE /assets/:id
       → Remove ativo (CASCADE: render presets, variants)
```

### Variantes de Material

```
POST   /variants
       Body: {
         assetId, name,
         albedoMapUrl?, normalMapUrl?,
         metallicMapUrl?, roughnessMapUrl?,
         aoMapUrl?, emissiveMapUrl?,
         baseColor?, metallic?, roughness?
       }
       → Cria nova variante

GET    /variants/:id
       → Detalhes da variante

GET    /variants
       Query: ?assetId=:assetId (obrigatório)
       → Lista variantes do ativo

PATCH  /variants/:id
       → Atualiza variante

DELETE /variants/:id
       → Remove variante
```

### Presets de Iluminação

```
POST   /presets/lighting
       Body: { name, hdriUrl, exposure?, intensity?, tags? }
       → Cria preset de iluminação

GET    /presets/lighting/:id
       → Detalhes do preset

PATCH  /presets/lighting/:id
       → Atualiza preset

DELETE /presets/lighting/:id
       → Remove preset
```

### Presets de Render

```
POST   /presets/render
       Body: {
         assetId, lightingPresetId,
         cameraConfig: { position, target, fov }
       }
       → Cria preset de render

GET    /presets/render
       Query: ?assetId=:assetId
       → Lista presets do ativo

DELETE /presets/render/:id
       → Remove preset
```

### Uploads

```
POST   /uploads/presign
       Body: { path }
       → Gera URL presignada para upload direto ao storage
       Response: { url, fileUrl }
```

### Viewer (Delivery)

```
GET    /viewer/assets/:assetId
       → Info do ativo para viewer

GET    /viewer/assets/:assetId/render
       Query: ?preset=:presetId&variant=:variantId&device=mobile|desktop
       → RenderManifest completo para viewer

GET    /viewer/presets
       Query: ?tag=:tag
       → Lista presets de iluminação (usado no viewer)
```

---

## Pipeline de Processamento

### Fluxo Completo

```
┌─────────────────────────────────────────────────────────────────────────┐
│  1. UPLOAD                                                              │
│     Cliente solicita URL presignada → Faz upload direto para S3/MinIO   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  2. VALIDATE                                                            │
│     Verifica: formato GLB válido, tamanho, estrutura                   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  3. NORMALIZE                                                           │
│     Blender headless:                                                  │
│     - Triangula geometria                                               │
│     - Merge by distance                                                 │
│     - Scale correto (meters)                                            │
│     - Up axis correto (Y)                                               │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  4. OPTIMIZE                                                            │
│     glTF-Transform CLI:                                                 │
│     - Remove unused materials                                           │
│     - Merge duplicate materials                                         │
│     - Quantize attributes (reduz precisão)                              │
│     - Compress Draco (opcional)                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  5. CONVERT USDZ                                                        │
│     glTF-Transform: glb → usdz para iOS AR Quick Look                   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  6. THUMBNAILS                                                          │
│     Por cada LightingPreset:                                           │
│     - Renderiza imagem do modelo                                        │
│     - Salva no storage                                                 │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  7. PUBLISH                                                             │
│     Atualiza status para "ready"                                        │
│     Disponibiliza URLs finais                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Jobs na Fila

| Tipo | Descrição | Payload |
|------|-----------|---------|
| `process-glb` | Pipeline completo | `{ assetId, glbUrl }` |
| `generate-usdz` | Conversão para USDZ | `{ assetId, glbUrl }` |
| `generate-thumbnail` | Thumbnail por preset | `{ assetId, glbUrl, lightingPresetId }` |
| `optimize-model` | Otimização GLB | `{ assetId, glbUrl }` |

---

## Serviços

### StorageService

Abstração para armazenamento de arquivos. Duas implementações:

#### LocalStorageService
- Stub para desenvolvimento
- Gera URLs presignadas falsas
- Útil para testes

#### S3StorageService
- Integração real com S3 ou MinIO
- Gera URLs presignadas com AWS SDK
- Upload/delete de arquivos

```typescript
interface PresignedUpload {
  url: string;      // URL para upload (temporária, assinada)
  fileUrl: string;  // URL pública final
}

// Uso
const { url, fileUrl } = await storage.presignUpload('assets/model.glb');
// Cliente faz PUT para url
// Resultado acessível em fileUrl
```

**Por que Presigned URLs?**
- Cliente faz upload direto para S3, não passa pelo servidor
- Reduz carga no backend
- S3 lida com uploads grandes eficientemente

### QueueService

Gerenciamento de jobs assíncronos. Duas implementações:

#### InMemoryQueue
- Fila simples em memória
- Para desenvolvimento/testes
- Não persiste entre restarts

#### RedisQueueService
- BullMQ + Redis para produção
- Jobs persistem
- Workers podem ser processos separados
- Retries automáticos
- Dashboard do Bull Board

### Store

Persistência de dados. Duas implementações:

#### MemoryStore
- Maps em memória
- Zero configuração
- Perfeito para protótipos

#### PgStore
- PostgreSQL com connection pooling
- Migrações automáticas
- Foreign keys com CASCADE
- Queries em SQL puro (sem ORM)

**Auto-detecção:**
```typescript
const store = DATABASE_URL
  ? new PgStore(DATABASE_URL)
  : new MemoryStore();
```

### RenderManifestService

Gera configuração resolveda para viewers.

```typescript
const manifest = await renderManifestService.generate({
  assetId: 'abc-123',
  materialVariantId: 'var-1',    // opcional
  lightingPresetId: 'light-2',   // opcional, tem default
  renderPresetId: 'render-3',    // opcional
  device: 'mobile'               // ou 'desktop'
});
```

**Priority:**
1. RenderPreset (override completo)
2. LightingPreset standalone
3. Defaults builtin

### ProcessingService

Pipeline de processamento 3D com glTF-Transform.

```typescript
await processingService.runPipeline(assetId, glbUrl);
// Executa: validate → optimize → usdz → thumbnails
```

---

## Configuração

### Variáveis de Ambiente

```bash
# Server
PORT=3000
HOST=0.0.0.0

# Database (opcional, usa memória se não definido)
DATABASE_URL=postgresql://user:pass@localhost:5432/dbname

# Storage S3/MinIO
S3_ENDPOINT=http://localhost:9000
S3_PUBLIC_ENDPOINT=http://localhost:9000
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=minio
AWS_SECRET_ACCESS_KEY=minio123
S3_BUCKET=dam-assets

# Redis/BullMQ (opcional, usa memória se não definido)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
```

### Docker Compose

```bash
docker compose -f docker/docker-compose.yml up
```

Inicia:
- PostgreSQL 15
- Redis 7
- MinIO (S3 compatible)

---

## Desenvolvimento

### Setup

```bash
# Clone
git clone https://github.com/tiagoggl12/simplexr-headless-cms-3d.git
cd simplexr-headless-cms-3d

# Instala
npm install

# Dev
npm run dev

# Testes
npm test
npm run test:watch

# Build
npm run build
npm start
```

### Estrutura de Arquivos

```
src/
├── app.ts                 # API Fastify + rotas
├── server.ts              # Server entry point
├── models.ts              # Interfaces de dados
├── store.ts               # MemoryStore
├── db.ts                  # PostgreSQL connection pool
├── services/
│   ├── storage.ts         # LocalStorageService
│   ├── s3-storage.ts      # S3StorageService
│   ├── queue.ts           # InMemoryQueue
│   ├── redis-queue.ts     # RedisQueueService
│   ├── processing.ts      # ProcessingService
│   ├── render-manifest.ts # RenderManifestService
│   └── pg-store.ts        # PgStore
└── types.ts               # Tipos Zod para validação

tests/
├── integration.test.ts    # Testes E2E da API
├── assets.test.ts         # Testes de assets
├── variants.test.ts       # Testes de variantes
├── render-manifest.test.ts# Testes de manifest
├── database.test.ts       # Testes de PgStore
├── services.test.ts       # Testes dos serviços
└── uploads.test.ts        # Testes de upload

admin/                      # Painel React (separado)
└── src/
    ├── pages/
    ├── components/
    └── lib/
```

### Exemplos de Uso

#### Criar Ativo

```bash
curl -X POST http://localhost:3000/assets \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Sofá Moderno",
    "masterUrl": "s3://bucket/assets/sofa.glb"
  }'
```

#### Upload com Presigned URL

```bash
# 1. Solicita URL
curl -X POST http://localhost:3000/uploads/presign \
  -H "Content-Type: application/json" \
  -d '{"path": "assets/model.glb"}'

# Response: { "url": "...", "fileUrl": "..." }

# 2. Upload direto (cliente faz isso)
curl -X PUT "{url}" \
  -H "Content-Type: model/gltf-binary" \
  --data-binary @model.glb
```

#### Render Manifest

```bash
curl "http://localhost:3000/viewer/assets/abc-123/render?preset=light-1&device=desktop"

# Response:
{
  "version": "1.0",
  "manifest": {
    "asset": { "id": "abc-123", "name": "Sofá", "url": "...", "format": "glb" },
    "lighting": { "hdri": "...", "exposure": 1, "intensity": 1 },
    "camera": { "position": [0, 1, 3], "target": [0, 0, 0], "fov": 45 },
    "quality": { "shadows": true, "antialiasing": "fxaa", "tonemapping": "aces" }
  }
}
```

---

## Roadmap

| Versão | Status | Features |
|--------|--------|----------|
| V0 | ✅ | CRUD Assets, Storage/Queue stubs |
| V1 | ✅ | MaterialVariants, PgStore, RenderManifest |
| V2 | ✅ | Quality profiles, device detection |
| V3 | 🔄 | KTX2 textures, LODs, CDN integration |
| V4 | ⏳ | WebAssembly processing, real-time thumbnails |

---

## Licença

MIT License - Ver LICENSE para detalhes.

---

**SimpleXR** - Headless CMS 3D DAM para E-commerce
