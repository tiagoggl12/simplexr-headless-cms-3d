# SimpleXR Headless CMS 3D - Features e Guia de Recriacao

## Objetivo do documento

Este documento descreve a solucao SimpleXR Headless CMS 3D em nivel suficiente para recria-la em outro ambiente. Ele consolida as funcionalidades presentes no backend, painel administrativo, modelo de dados, infraestrutura e integracoes.

A solucao e um DAM/CMS headless para ativos 3D, com GLB como arquivo mestre, APIs REST e GraphQL para administracao e entrega, processamento de derivados 3D, render manifests para viewers externos e painel administrativo React.

## Resumo da solucao

O sistema gerencia ativos 3D para e-commerce, catalogos digitais, visualizadores web, experiencias AR e pipelines de distribuicao omnichannel.

Principais responsabilidades:

- Cadastro e manutencao de ativos 3D com status operacional.
- Upload ou referencia de arquivos GLB/GLTF.
- Geracao de manifests de renderizacao para viewers 3D.
- Cadastro de presets de iluminacao HDRI e presets de camera/render.
- Variantes de material PBR por ativo.
- Processamento e metadados de KTX2, Draco, LOD, USDZ e thumbnails.
- Taxonomia por tags, categorias e colecoes.
- Campos customizados por tipo de ativo.
- Workflow editorial de revisao, aprovacao e publicacao.
- Exportacao multi-formato.
- Analytics de visualizacao, download e compartilhamento.
- Webhooks, eventos, versionamento e operacoes em lote.
- Integracao opcional com Manyfold.
- Painel admin web para operacao basica.

## Stack tecnica

Backend:

- Node.js com TypeScript em ESM.
- Fastify como servidor HTTP.
- Zod para validacao de payloads.
- Mercurius/GraphQL para API GraphQL.
- PostgreSQL via `pg`, quando `DATABASE_URL` esta configurado.
- Store em memoria para desenvolvimento/testes sem banco.
- Redis/BullMQ para filas de processamento quando habilitado.
- S3/MinIO para storage compativel com presigned upload.
- glTF-Transform, Draco, Blender, Puppeteer/Chromium e ferramentas KTX como base de processamento 3D.
- Vitest e Supertest para testes.

Frontend admin:

- React 18, TypeScript e Vite.
- React Router.
- TanStack React Query.
- Axios.
- Tailwind CSS.
- Zustand.
- React Hook Form e Zod.
- Three.js, React Three Fiber e Drei para visualizacao 3D.
- Lucide React para icones.

Infraestrutura local:

- Docker Compose com PostgreSQL, Redis e MinIO.
- Compose de desenvolvimento com backend, admin e infraestrutura.
- Compose opcional de Manyfold.

## Arquitetura funcional

Fluxo principal:

1. O operador cadastra ou envia um ativo 3D pelo painel admin ou API.
2. O backend cria um `Asset3D` com GLB/GLTF como master.
3. Servicos de processamento podem gerar derivados: KTX2, LODs, Draco, USDZ e thumbnails.
4. Presets de iluminacao e camera definem como o ativo sera renderizado.
5. O endpoint de viewer gera um render manifest com URLs, qualidade, variantes e configuracao de cena.
6. Aplicacoes externas consomem o manifest para renderizar o ativo em web, mobile, AR ou catalogos.
7. Analytics, tags, workflow, exportacoes e webhooks complementam a governanca do ativo.

Componentes principais:

- API Fastify: `src/app.ts`.
- Servidor: `src/server.ts`.
- Modelos TypeScript: `src/models.ts` e `src/models/*.ts`.
- Store em memoria: `src/store.ts`.
- Store PostgreSQL: `src/services/pg-store.ts`.
- GraphQL: `src/graphql/schema.graphql` e `src/graphql/resolvers.ts`.
- Painel admin: `admin/src/`.
- Docker: `docker/`.
- Prisma/schema alvo: `prisma/schema.prisma`.

## Modelo de dados principal

### Asset3D

Representa um ativo 3D.

Campos centrais:

- `id`: identificador UUID.
- `name`: nome do ativo.
- `masterUrl`: URL do GLB/GLTF mestre.
- `status`: `draft`, `processing`, `ready` ou `failed`.
- `createdAt` e `updatedAt`.
- `hasMaterialVariants`: indica variantes de material.
- `textureFormats`: formatos derivados, como KTX2/Basis.
- `lods`: niveis de LOD com URL, distancia, tamanho e contagem de vertices.
- `processingStatus`: status por etapa de processamento.
- `usdzUrl`: derivado USDZ para AR iOS.
- `thumbnails`: imagens geradas por angulo.

### MaterialVariant

Varia materiais PBR de um ativo.

Suporta:

- Texturas: albedo, normal, metallic, roughness, ambient occlusion e emissive.
- Valores escalares: `baseColor`, `metallic`, `roughness`.
- Status proprio: `draft`, `processing`, `ready`, `failed`.

### LightingPreset

Define ambiente de iluminacao.

Campos:

- `name`.
- `hdriUrl`.
- `exposure`.
- `intensity`.
- `tags`.

### RenderPreset

Combina ativo, iluminacao e camera.

Campos:

- `assetId`.
- `lightingPresetId`.
- `camera.position`.
- `camera.target`.
- `camera.fov`.

### Taxonomia

Entidades:

- `Tag`: nome, slug, cor, descricao e hierarquia por `parentId`.
- `Category`: nome, slug, icone, ordem e hierarquia.
- `Collection`: agrupamento de ativos por usuario, publico ou privado.

### Campos customizados

Entidades:

- `AssetType`: tipo de ativo com lista de campos customizados.
- `CustomFieldValue`: valor tipado por ativo e campo.

Tipos de campo:

- `text`.
- `number`.
- `date`.
- `select`.
- `boolean`.
- `json`.

### Workflow

Estados editoriais:

- `draft`.
- `review`.
- `approved`.
- `published`.
- `archived`.
- `deleted`.
- `rejected`.

Eventos guardam ativo, status anterior, status novo, usuario, nome, comentario e data.

### Exportacao

Formatos:

- `gltf`.
- `glb`.
- `obj`.
- `usdz`.
- `stl`.
- `fbx`.

Estados:

- `pending`.
- `processing`.
- `completed`.
- `failed`.
- `cancelled`.

### Analytics

Eventos e metricas:

- Views.
- Downloads.
- Shares.
- Series temporais.
- Popularidade.
- Trending.
- Duracao de visualizacao.
- Referrer, user agent e contexto de dispositivo.

## Features do backend

### Saude e infraestrutura

- `GET /health`: health check com status e timestamp.
- CORS habilitado para desenvolvimento.
- Servico de arquivos estaticos a partir de `public/`.
- Store em memoria quando `DATABASE_URL` nao esta definido.
- PostgreSQL quando `DATABASE_URL` esta definido.

### Autenticacao e autorizacao

Rotas sob `/auth` registradas por `registerAuthRoutes`.

Capacidades do servico:

- Registro de usuario.
- Login com senha.
- JWT access token.
- Refresh token.
- Logout.
- API keys.
- Roles: `admin`, `editor`, `viewer`.
- Permissoes por escopo.
- Middleware para JWT, API key, role e permissao.

Observacao: nem todas as rotas do backend aplicam middleware de auth obrigatorio; para recriacao em producao, definir politicas de protecao por endpoint.

### Assets 3D

Rotas principais:

- `POST /assets`: cria ativo com `name` e `masterUrl`.
- `GET /assets`: lista ativos com filtros `status`, `limit` e `offset`.
- `GET /assets/:id`: busca ativo.
- `PATCH /assets/:id`: atualiza `name` e/ou `status`.
- `DELETE /assets/:id`: remove ativo.

Comportamentos:

- Criacao inicia em `draft`.
- Listagem ordena por criacao descendente.
- Suporte a paginacao por offset/limit.

### Upload

Rotas:

- `POST /uploads/presign`: recebe `path` e retorna URL de upload e URL publica.

Implementacoes:

- `LocalStorageService` para stub/local.
- `S3StorageService` para S3/MinIO.

Uso esperado:

1. Cliente solicita presigned URL.
2. Cliente faz upload direto para storage.
3. Cliente cria asset apontando para a URL final.

### Viewer e render manifest

Rotas:

- `GET /viewer/assets/:assetId`: retorna dados basicos para viewer.
- `GET /viewer/presets?tag=...`: lista presets de iluminacao para viewer.
- `GET /viewer/assets/:assetId/render`: gera manifest de renderizacao.

Parametros de render:

- `preset`: pode ser render preset ou lighting preset.
- `variant`: variante de material.
- `device`: `mobile` ou `desktop`.
- `format`: `glb` ou `ktx2`.
- `maxLod`: limite de nivel LOD.
- `preferKtx2`: `true` ou `false`.

Capacidades do manifest:

- Resolve asset, iluminacao, camera, material e qualidade.
- Gera manifest default quando nao ha preset.
- Suporta perfil mobile/desktop.
- Suporta formatos derivados e LODs quando presentes.

### Presets de iluminacao

Rotas:

- `POST /presets/lighting`.
- `GET /presets/lighting`.
- `GET /viewer/presets`.
- `PATCH /presets/lighting/:id`.
- `DELETE /presets/lighting/:id`.

Campos:

- `name`.
- `hdriUrl`.
- `exposure`.
- `intensity`.
- `tags`.

### Presets de render

Rotas:

- `POST /presets/render`.
- `GET /presets/render`.
- `DELETE /presets/render/:id`.

Validacoes:

- O asset deve existir.
- O lighting preset deve existir.
- Camera deve conter `fov`, `position` e `target`.

Listagem:

- Pode filtrar por `assetId`.
- Enriquece resultado com nome do asset e nome do preset de iluminacao.

### Variantes de material PBR

Rotas:

- `POST /variants`.
- `GET /variants?assetId=...`.
- `GET /variants/:id`.
- `PATCH /variants/:id`.
- `DELETE /variants/:id`.

Validacoes:

- `assetId` obrigatorio na criacao/listagem.
- URLs de mapas devem ser validas.
- `baseColor` deve ser hexadecimal `#RRGGBB`.
- `metallic` e `roughness` entre 0 e 1.

### Compressao KTX2

Rotas expostas:

- `POST /assets/:id/ktx2/compress`.
- `GET /assets/:id/ktx2/status`.
- `DELETE /assets/:id/ktx2`.

Opcoes:

- `quality`: 1 a 10.
- `formats`: `ktx2` e/ou `basis`.
- `generateMipmaps`.

Estado atual:

- Endpoint marca status como `processing` e retorna 202.
- O servico `KTX2Processor` contem logica para extracao e compressao de texturas quando ferramentas externas estao disponiveis.
- Para producao, conectar a rota a fila/worker real.

### Geracao de LOD

Rotas:

- `POST /assets/:id/lods/generate`.
- `GET /assets/:id/lods`.
- `DELETE /assets/:id/lods/:level`.

Opcoes:

- Lista de niveis com `level`, `ratio`, `error` e `distance`.
- `applyWeld`.
- `applyPrune`.

Estado atual:

- Endpoint marca status como `processing` e retorna 202.
- `LODGenerator` implementa geracao com glTF-Transform/meshoptimizer quando disponivel.

### CDN

Rotas:

- `POST /cdn/purge`.
- `POST /assets/:id/cdn/purge`.
- `GET /cdn/status`.

Capacidades:

- Purge por URL.
- Purge por variantes do asset: master, KTX2 e LODs.
- Adaptadores para Cloudflare, CloudFront e endpoint customizado.

### Draco

Rotas:

- `POST /assets/:id/draco/compress`.
- `GET /draco/capabilities`.

Opcoes:

- `encodeSpeed`.
- `decodeSpeed`.
- `compressionLevel`.
- `applyWeld`.
- `applyPrune`.

Capacidades:

- Compressao GLB com Draco.
- Metadados de compressao.
- Checagem de ferramenta/CLI.

### Versionamento de assets

Rotas:

- `GET /assets/:id/versions`.
- `POST /assets/:id/versions/:version/rollback`.
- `GET /versions/statistics`.

Comportamentos:

- Snapshot automatico em eventos `asset.updated`.
- Remocao de versoes em `asset.deleted`.
- Rollback opcionalmente cria backup pre-rollback.

### Operacoes em lote

Rotas:

- `POST /batch/upload`.
- `GET /batch/operations/:id`.

Capacidades:

- Upload/criacao de multiplos assets.
- Opcoes de concorrencia e continuar em erro.
- Status por item e operacao.
- Emissao de eventos de conclusao/falha.

### Webhooks e eventos

Rotas:

- `POST /webhooks`.
- `GET /webhooks`.
- `DELETE /webhooks/:id`.
- `GET /events`.
- `GET /events/statistics`.

Capacidades:

- Cadastro de webhooks por lista de eventos.
- Segredo opcional para entrega.
- Historico de eventos.
- Estatisticas de eventos.
- Retry e entrega HTTP no servico.

### USDZ para AR

Rotas:

- `POST /assets/:id/usdz`.
- `GET /assets/:id/usdz`.

Capacidades:

- Conversao GLB para USDZ.
- Atualizacao de `asset.usdzUrl`.
- Suporte a ferramentas como `usdzip`, Python ou Blender, com fallback stub.

Uso:

- Entregar experiencia iOS AR Quick Look a partir do GLB master.

### Thumbnails

Rotas:

- `POST /assets/:id/thumbnails`.
- `GET /assets/:id/thumbnails`.

Opcoes:

- `angles`: `front`, `side`, `top`, `isometric`, `back`, `bottom`.
- `width` e `height`: 64 a 4096.
- `backgroundColor`: hexadecimal.
- `lighting`: `studio`, `outdoor`, `neutral`.

Capacidades do servico:

- Thumbnail unica.
- Multiplos angulos.
- Sequencia 360.
- Sprite sheet.
- Render com Blender quando disponivel.

### Busca

Rotas:

- `GET /search`.
- `GET /search/suggestions`.
- `GET /search/similar/:assetId`.
- `POST /search/spatial`.

Filtros/parametros:

- Texto livre `q`.
- Tags.
- Categorias.
- Status.
- Formato.
- Paginacao.
- Ordenacao por relevancia, nome, criacao ou atualizacao.
- Busca espacial por bounds 3D.

### Tags

Rotas:

- `POST /tags`.
- `GET /tags`.
- `GET /tags/:id`.
- `PATCH /tags/:id`.
- `DELETE /tags/:id`.
- `GET /assets/:id/tags`.
- `PUT /assets/:id/tags`.
- `POST /assets/:id/tags`.
- `DELETE /assets/:id/tags`.
- `GET /assets/:id/tags/suggestions`.
- `POST /tags/bulk`.
- `GET /tags/stats`.

Capacidades:

- Tags hierarquicas.
- Cores e descricoes.
- Associacao, substituicao e remocao de tags por asset.
- Operacoes bulk: add, remove e replace.
- Sugestoes automaticas.

### Categorias

Rotas:

- `POST /categories`.
- `GET /categories`.
- `GET /categories?tree=true`.
- `GET /categories/:id`.
- `PATCH /categories/:id`.
- `DELETE /categories/:id`.
- `GET /assets/:id/categories`.
- `POST /assets/:id/categories`.
- `DELETE /assets/:id/categories/:categoryId`.

Capacidades:

- Categorias hierarquicas.
- Ordem de exibicao.
- Icone.
- Associacao asset-categoria.

### Colecoes

Rotas:

- `POST /collections`.
- `GET /collections`.
- `GET /collections/:id`.
- `PATCH /collections/:id`.
- `DELETE /collections/:id`.
- `GET /collections/:id/assets`.
- `POST /collections/:id/assets`.
- `DELETE /collections/:id/assets`.

Capacidades:

- Colecoes por usuario.
- Colecoes publicas ou privadas.
- Asset de capa.
- Adicao e remocao de multiplos assets.

### Asset types e campos customizados

Rotas:

- `GET /asset-types`.
- `GET /asset-types/:id`.
- `POST /asset-types`.
- `PATCH /asset-types/:id`.
- `DELETE /asset-types/:id`.
- `POST /asset-types/:id/validate`.
- `GET /assets/:id/custom-fields`.
- `PATCH /assets/:id/custom-fields`.
- `PUT /assets/:id/custom-fields/bulk`.

Capacidades:

- Criar schemas de campos por tipo de asset.
- Ativar/desativar asset types.
- Validar payloads antes de salvar.
- Valores individuais ou em lote por ativo.
- Validacoes por min, max, pattern, minLength e maxLength.

### Workflow editorial

Rotas:

- `GET /workflow/assets/:id`.
- `GET /workflow/assets/:id/allowed-transitions`.
- `POST /workflow/assets/:id/status`.
- `POST /workflow/assets/:id/submit`.
- `POST /workflow/assets/:id/approve`.
- `POST /workflow/assets/:id/reject`.
- `POST /workflow/assets/:id/publish`.
- `POST /workflow/assets/:id/unpublish`.
- `POST /workflow/assets/:id/archive`.
- `POST /workflow/assets/:id/restore`.
- `GET /workflow/assets/:id/history`.
- `GET /workflow/statuses/:status`.
- `GET /workflow/awaiting-review`.
- `GET /workflow/statistics`.
- `GET /workflow/statuses`.

Capacidades:

- Transicoes validadas por estado atual.
- Permissoes por role: viewer, editor, admin.
- Historico de eventos.
- Comentarios por transicao.
- Atalhos para submit, approve, reject, publish, unpublish, archive e restore.

### Exportacao multi-formato

Rotas:

- `GET /exports/capabilities`.
- `GET /exports/capabilities/:format`.
- `GET /exports/statistics`.
- `POST /assets/:id/exports`.
- `GET /assets/:id/exports`.
- `GET /exports/:id`.
- `GET /exports/:id/download`.
- `DELETE /exports/:id`.
- `DELETE /exports/:id?cancel=true`.
- `POST /exports/:id/retry`.

Opcoes:

- Escala.
- Eixo vertical `y` ou `z`.
- Aplicar transforms.
- Buffers separados/embutidos.
- Draco.
- Formato de textura.
- Tamanho maximo de textura.
- Materiais, normals e UVs.
- Opcoes especificas para OBJ, USDZ, STL e FBX.
- Prioridade e webhook.

Observacao:

- A rota atual usa URL placeholder para `masterUrl` em export jobs. Em producao, deve buscar o asset real no store e recuperar o arquivo no storage.

### Analytics

Rotas:

- `GET /analytics/dashboard`.
- `GET /analytics/summary`.
- `GET /analytics/popular`.
- `GET /analytics/trending`.
- `GET /analytics/unviewed`.
- `GET /analytics/assets/:id/metrics`.
- `GET /analytics/assets/:id/timeseries`.
- `POST /analytics/assets/:id/view`.
- `POST /analytics/assets/:id/download`.
- `POST /analytics/assets/:id/share`.
- `GET /analytics/statistics`.
- `POST /analytics/cleanup`.

Capacidades:

- Registro de views com sessao, duracao, referrer, user agent e contexto.
- Registro de downloads por formato.
- Registro de compartilhamentos por plataforma.
- Metricas por ativo.
- Series temporais por hora, dia, semana, mes ou ano.
- Popularidade, trending e resumo global.
- Limpeza por retencao em dias.

### GraphQL

Endpoint:

- `/graphql`.

Recursos:

- GraphiQL habilitado.
- Queries para assets, asset individual, tags, categorias, colecoes e asset types.
- Mutations para criar, atualizar e deletar asset.
- Mutation para disparar exportacao.
- Mutations para criar colecao, adicionar/remover ativo de colecao.

Tipos GraphQL incluem:

- `Asset3D`.
- `MaterialVariant`.
- `RenderPreset`.
- `LightingPreset`.
- `Tag`.
- `Category`.
- `Collection`.
- `AssetType`.
- `CustomFieldValue`.
- `ExportJob`.

### Integracao Manyfold

Rotas:

- `GET /manyfold/status`.
- `POST /manyfold/test`.
- `GET /manyfold/models`.
- `GET /manyfold/models/:id`.
- `GET /manyfold/collections`.
- `POST /manyfold/collections`.
- `GET /manyfold/creators`.
- `POST /manyfold/creators`.
- `POST /manyfold/import`.
- `POST /manyfold/import/bulk`.
- `POST /manyfold/export`.
- `GET /manyfold/sync`.
- `GET /manyfold/sync/:id`.
- `DELETE /manyfold/sync/:id`.
- `GET /manyfold/sync/history`.

Configuracao:

- `MANYFOLD_BASE_URL`.
- `MANYFOLD_CLIENT_ID`.
- `MANYFOLD_CLIENT_SECRET`.

Capacidades:

- OAuth2 client credentials para acessar Manyfold.
- Listagem de modelos, colecoes e criadores.
- Criacao de colecoes e criadores.
- Importacao de modelos Manyfold para SimpleXR.
- Importacao em lote filtrada por criador, colecao e formatos.
- Exportacao SimpleXR para Manyfold como job enfileirado/placeholder.
- Mapeamento e historico de sincronizacao.

## Features do painel administrativo

Aplicacao em `admin/`, servida por Vite em desenvolvimento.

Rotas do painel:

- `/`: Dashboard.
- `/assets`: Lista de assets.
- `/assets/new`: Cadastro manual de asset.
- `/assets/:id`: Detalhe do asset.
- `/lighting`: Presets de iluminacao.
- `/renders`: Presets de render.
- `/uploads`: Upload de arquivos GLB/GLTF.

### Dashboard

Mostra:

- Total de assets.
- Assets em `draft`.
- Assets `ready`.
- Assets `processing`.
- Assets `failed`.
- Presets de iluminacao.
- Presets de render.
- Assets recentes.

### Listagem de assets

Recursos:

- Grid/lista.
- Busca client-side por nome.
- Filtro por status.
- Paginacao.
- Excluir asset com confirmacao.
- Status badge.
- Navegacao para detalhe.

### Cadastro de asset

Campos:

- Nome.
- URL master.

Comportamento:

- Valida formulario com Zod.
- Cria asset via API.
- Redireciona para lista/detalhe.

### Detalhe de asset

Recursos:

- Exibe dados do asset.
- Edicao de nome e status.
- Listagem de presets de iluminacao.
- Area de visualizacao/uso com viewer API.

### Uploads

Recursos:

- Drag and drop.
- Input de arquivos.
- Aceita `.glb` e `.gltf`.
- Limite de 100 MB por arquivo.
- Presigned upload.
- Cria asset apos upload.
- Status por arquivo: pendente, enviando, sucesso, erro.
- Limpar concluidos.

### Lighting

Recursos:

- Criar, editar e deletar presets de iluminacao.
- Campos de HDRI, exposure, intensity e tags.
- Filtro por tag.

### Renders

Recursos:

- Criar e deletar render presets.
- Selecionar asset e lighting preset.
- Configurar camera: FOV, position e target.

## Infraestrutura e ambientes

### Desenvolvimento local simples

Backend:

```bash
npm install
npm run dev
```

Admin:

```bash
cd admin
npm install
npm run dev
```

Sem `DATABASE_URL`, o backend usa store em memoria.

### Infraestrutura Docker

Subir infraestrutura:

```bash
docker compose -f docker/docker-compose.yml up -d
```

Servicos:

- PostgreSQL: porta `5432`.
- Redis: porta `6379`.
- MinIO: porta `9000`.
- MinIO Console: porta `9001`.

### Stack full dev

```bash
docker compose -f docker/docker-compose.dev.yml up --build
```

Servicos:

- Backend: `http://localhost:3000`.
- Admin: `http://localhost:5174`.
- PostgreSQL.
- Redis.
- MinIO.

### Manyfold local

```bash
docker compose -f docker/docker-compose.yml -f docker/docker-compose.manyfold.yml up -d
```

Manyfold UI:

- `http://localhost:3214`.

Passos:

1. Criar usuario admin no primeiro acesso.
2. Criar OAuth application no Manyfold.
3. Configurar `MANYFOLD_BASE_URL`, `MANYFOLD_CLIENT_ID` e `MANYFOLD_CLIENT_SECRET`.
4. Testar com `POST /manyfold/test`.

## Variaveis de ambiente

Servidor:

- `PORT`.
- `HOST`.
- `NODE_ENV`.
- `JWT_SECRET`.

Banco:

- `DATABASE_URL`.

Storage:

- `STORAGE_TYPE`.
- `STORAGE_BASE_URL`.
- `S3_ENDPOINT`.
- `S3_BUCKET`.
- `S3_REGION`.
- `S3_ACCESS_KEY` ou `AWS_ACCESS_KEY_ID`.
- `S3_SECRET_KEY` ou `AWS_SECRET_ACCESS_KEY`.
- `S3_PUBLIC_ENDPOINT`.

Redis:

- `REDIS_HOST`.
- `REDIS_PORT`.
- `REDIS_PASSWORD`.

Uploads:

- `UPLOAD_DIR`.
- `MAX_FILE_SIZE`.

Processamento:

- `BLENDER_PATH`.
- `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD`.
- `PUPPETEER_EXECUTABLE_PATH`.

Manyfold:

- `MANYFOLD_BASE_URL`.
- `MANYFOLD_CLIENT_ID`.
- `MANYFOLD_CLIENT_SECRET`.

## Requisitos para recriar em outro ambiente

### Obrigatorios

- Node.js compativel com TypeScript/ESM.
- npm.
- Backend Fastify.
- Frontend Vite/React.
- Uma estrategia de persistencia:
  - Memoria para prototipo/teste.
  - PostgreSQL para ambiente persistente.
- Storage de arquivos:
  - MinIO/S3 para producao ou ambiente integrado.
  - Stub/local para desenvolvimento rapido.

### Recomendados para producao

- PostgreSQL gerenciado.
- Redis para filas.
- Bucket S3 ou compativel.
- CDN com purge configurado.
- Workers separados para processamento pesado.
- Blender instalado para thumbnails/USDZ fallback.
- Ferramentas KTX2/toktx para texturas.
- Ferramentas Draco.
- Observabilidade de logs e metricas.
- Auth obrigatoria nos endpoints administrativos.
- Validacao de tamanho/tipo de arquivo no storage e backend.

### Opcionais

- Manyfold self-hosted.
- Cloudflare ou CloudFront para CDN.
- Prisma como camada ORM futura, usando `prisma/schema.prisma` como referencia.

## Checklist de recriacao

1. Criar projeto backend TypeScript ESM com Fastify.
2. Implementar modelos `Asset3D`, `LightingPreset`, `RenderPreset` e `MaterialVariant`.
3. Implementar store em memoria para desenvolvimento.
4. Implementar store PostgreSQL com tabelas equivalentes ao schema Prisma/SQL.
5. Criar rotas CRUD de assets.
6. Criar presigned upload para storage local/S3.
7. Criar CRUD de lighting presets.
8. Criar CRUD de render presets.
9. Criar variantes de material PBR.
10. Criar servico de render manifest com suporte a device, format, LOD, KTX2 e variant.
11. Criar endpoints de viewer.
12. Adicionar GraphQL com tipos principais.
13. Adicionar autenticacao JWT/API key e roles.
14. Adicionar tags, categorias e colecoes.
15. Adicionar asset types e campos customizados.
16. Adicionar workflow editorial e historico.
17. Adicionar analytics de views/downloads/shares.
18. Adicionar export jobs multi-formato.
19. Adicionar webhooks/eventos.
20. Adicionar batch upload.
21. Adicionar versionamento e rollback.
22. Adicionar servicos de processamento: KTX2, LOD, Draco, USDZ e thumbnails.
23. Conectar processamento a Redis/BullMQ e workers.
24. Criar painel admin React com dashboard, assets, upload, lighting e renders.
25. Criar Docker Compose com backend, admin, PostgreSQL, Redis e MinIO.
26. Adicionar compose opcional de Manyfold.
27. Escrever testes de rotas e servicos equivalentes aos testes em `tests/`.
28. Rodar build e suite de testes.

## Estado de maturidade por feature

Prontas para uso basico:

- CRUD de assets.
- Upload presign.
- Lighting presets.
- Render presets.
- Viewer asset e render manifest.
- Material variants.
- Tags, categorias e colecoes em memoria/servico.
- Custom fields em servico.
- Workflow em servico.
- Analytics em servico.
- Painel admin basico.
- GraphQL basico.

Parcialmente implementadas ou dependentes de ambiente:

- PostgreSQL: existe `PgStore`, mas validar schema/migrations para todas as entidades antes de producao.
- KTX2: rota marca processamento; servico tecnico existe, depende de ferramentas e fila.
- LOD: rota marca processamento; gerador existe, depende de meshoptimizer/glTF-Transform.
- USDZ: conversor existe com multiplos backends e fallback.
- Thumbnails: gerador existe, depende de Blender/Chromium conforme caminho usado.
- Exportacao: jobs e simulacao existem; producao deve buscar `masterUrl` real e processar arquivo.
- Manyfold: integracao existe e depende de OAuth/configuracao externa.
- Redis/BullMQ: servico de fila existe, mas nem todas as rotas usam workers reais.

Pontos a endurecer antes de producao:

- Aplicar autenticao/autorizacao nas rotas administrativas.
- Persistir todas as entidades V4/V5 no PostgreSQL.
- Substituir placeholders de exportacao por storage real.
- Executar processamento pesado fora do processo HTTP.
- Adicionar limites de upload e validacao MIME no storage.
- Configurar secrets fortes e rotacao de API keys.
- Adicionar migrations completas para tags, colecoes, workflow, analytics e exports.
- Adicionar observabilidade e alertas.

## Comandos de validacao

Backend:

```bash
npm run build
npm test
```

Admin:

```bash
cd admin
npm run build
```

Docker:

```bash
docker compose -f docker/docker-compose.yml up -d
docker compose -f docker/docker-compose.dev.yml up --build
```

Health check:

```bash
curl http://localhost:3000/health
```

GraphQL:

```bash
open http://localhost:3000/graphql
```

Manyfold:

```bash
curl -X POST http://localhost:3000/manyfold/test
```

## Referencias de codigo

- Backend principal: `src/app.ts`.
- Server bootstrap: `src/server.ts`.
- Modelos principais: `src/models.ts`.
- Modelos V4/V5: `src/models/`.
- Store em memoria: `src/store.ts`.
- Store PostgreSQL: `src/services/pg-store.ts`.
- Render manifest: `src/services/render-manifest.ts`.
- Processamento: `src/services/processing.ts`.
- KTX2: `src/services/ktx-processor.ts`.
- LOD: `src/services/lod-generator.ts`.
- Draco: `src/services/draco-compression.ts`.
- USDZ: `src/services/usdz-converter.ts`.
- Thumbnails: `src/services/thumbnail-generator.ts`.
- Tags/categorias/colecoes: `src/services/tags.service.ts`.
- Custom fields: `src/services/custom-fields.service.ts`.
- Workflow: `src/services/workflow.service.ts`.
- Exportacao: `src/services/export.service.ts`.
- Analytics: `src/services/analytics.service.ts`.
- Manyfold: `src/services/manyfold-sync.service.ts` e `src/routes/manyfold.routes.ts`.
- GraphQL: `src/graphql/schema.graphql`.
- Admin: `admin/src/`.
- Docker: `docker/`.
- Schema Prisma: `prisma/schema.prisma`.
