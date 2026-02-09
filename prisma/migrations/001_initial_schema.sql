-- Initial schema for simplexr-headless-cms-3d
-- Executed manually since the app uses pg directly

-- Enum types
CREATE TYPE "AssetStatus" AS ENUM ('draft', 'processing', 'ready', 'failed');
CREATE TYPE "MaterialVariantStatus" AS ENUM ('draft', 'processing', 'ready', 'failed');
CREATE TYPE "WorkflowStatus" AS ENUM ('draft', 'review', 'approved', 'published', 'archived', 'deleted', 'rejected');
CREATE TYPE "ExportFormat" AS ENUM ('gltf', 'glb', 'obj', 'usdz', 'stl', 'fbx');
CREATE TYPE "ExportStatus" AS ENUM ('pending', 'processing', 'completed', 'failed', 'cancelled');

-- Asset3D table
CREATE TABLE IF NOT EXISTS "Asset3D" (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    "masterUrl" TEXT NOT NULL,
    "status" "AssetStatus" NOT NULL,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    "hasMaterialVariants" BOOLEAN,
    "textureFormats" JSONB,
    "lods" JSONB,
    "processingStatus" JSONB,
    "usdzUrl" TEXT,
    "thumbnails" JSONB
);

CREATE INDEX IF NOT EXISTS "Asset3D_status_idx" ON "Asset3D"("status");
CREATE INDEX IF NOT EXISTS "Asset3D_createdAt_idx" ON "Asset3D"("createdAt");

-- LightingPreset table
CREATE TABLE IF NOT EXISTS "LightingPreset" (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    "hdriUrl" TEXT NOT NULL,
    exposure FLOAT NOT NULL,
    intensity FLOAT NOT NULL,
    tags TEXT[],
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- RenderPreset table
CREATE TABLE IF NOT EXISTS "RenderPreset" (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    "assetId" TEXT NOT NULL REFERENCES "Asset3D"(id) ON DELETE CASCADE,
    "lightingPresetId" TEXT NOT NULL REFERENCES "LightingPreset"(id) ON DELETE CASCADE,
    camera JSONB NOT NULL,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS "RenderPreset_assetId_idx" ON "RenderPreset"("assetId");

-- MaterialVariant table
CREATE TABLE IF NOT EXISTS "MaterialVariant" (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    "assetId" TEXT NOT NULL REFERENCES "Asset3D"(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    "albedoMapUrl" TEXT,
    "normalMapUrl" TEXT,
    "metallicMapUrl" TEXT,
    "roughnessMapUrl" TEXT,
    "aoMapUrl" TEXT,
    "emissiveMapUrl" TEXT,
    "baseColor" TEXT,
    metallic FLOAT,
    roughness FLOAT,
    status "MaterialVariantStatus" NOT NULL,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS "MaterialVariant_assetId_idx" ON "MaterialVariant"("assetId");

-- AssetType table
CREATE TABLE IF NOT EXISTS "AssetType" (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    icon TEXT,
    fields JSONB NOT NULL,
    "isActive" BOOLEAN DEFAULT true,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- CustomFieldValue table
CREATE TABLE IF NOT EXISTS "CustomFieldValue" (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    "assetId" TEXT NOT NULL REFERENCES "Asset3D"(id) ON DELETE CASCADE,
    "assetTypeId" TEXT REFERENCES "AssetType"(id) ON DELETE SET NULL,
    "fieldId" TEXT NOT NULL,
    value JSONB NOT NULL,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    UNIQUE("assetId", "fieldId")
);

CREATE INDEX IF NOT EXISTS "CustomFieldValue_assetId_idx" ON "CustomFieldValue"("assetId");
CREATE INDEX IF NOT EXISTS "CustomFieldValue_fieldId_idx" ON "CustomFieldValue"("fieldId");

-- WorkflowEvent table
CREATE TABLE IF NOT EXISTS "WorkflowEvent" (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    "assetId" TEXT NOT NULL REFERENCES "Asset3D"(id) ON DELETE CASCADE,
    "fromStatus" "WorkflowStatus" NOT NULL,
    "toStatus" "WorkflowStatus" NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT,
    comment TEXT,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS "WorkflowEvent_assetId_idx" ON "WorkflowEvent"("assetId");
CREATE INDEX IF NOT EXISTS "WorkflowEvent_createdAt_idx" ON "WorkflowEvent"("createdAt");

-- ExportJob table
CREATE TABLE IF NOT EXISTS "ExportJob" (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    "assetId" TEXT NOT NULL REFERENCES "Asset3D"(id) ON DELETE CASCADE,
    format "ExportFormat" NOT NULL,
    options JSONB NOT NULL,
    status "ExportStatus" DEFAULT 'pending' NOT NULL,
    progress INT DEFAULT 0 NOT NULL,
    "resultUrl" TEXT,
    "resultFiles" JSONB,
    "fileSize" INT,
    error TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    "startedAt" TIMESTAMP WITH TIME ZONE,
    "completedAt" TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS "ExportJob_assetId_status_idx" ON "ExportJob"("assetId", "status");
CREATE INDEX IF NOT EXISTS "ExportJob_status_idx" ON "ExportJob"("status");
CREATE INDEX IF NOT EXISTS "ExportJob_createdAt_idx" ON "ExportJob"("createdAt");

-- AssetView table
CREATE TABLE IF NOT EXISTS "AssetView" (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    "assetId" TEXT NOT NULL REFERENCES "Asset3D"(id) ON DELETE CASCADE,
    "userId" TEXT,
    "sessionId" TEXT,
    duration INT,
    referrer TEXT,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    context JSONB,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS "AssetView_assetId_createdAt_idx" ON "AssetView"("assetId", "createdAt");
CREATE INDEX IF NOT EXISTS "AssetView_userId_idx" ON "AssetView"("userId");
CREATE INDEX IF NOT EXISTS "AssetView_sessionId_idx" ON "AssetView"("sessionId");

-- AssetDownload table
CREATE TABLE IF NOT EXISTS "AssetDownload" (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    "assetId" TEXT NOT NULL,
    format TEXT,
    "userId" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS "AssetDownload_assetId_idx" ON "AssetDownload"("assetId");
CREATE INDEX IF NOT EXISTS "AssetDownload_createdAt_idx" ON "AssetDownload"("createdAt");

-- AssetShare table
CREATE TABLE IF NOT EXISTS "AssetShare" (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    "assetId" TEXT NOT NULL,
    platform TEXT NOT NULL,
    "userId" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS "AssetShare_assetId_idx" ON "AssetShare"("assetId");
CREATE INDEX IF NOT EXISTS "AssetShare_createdAt_idx" ON "AssetShare"("createdAt");

-- Tag table
CREATE TABLE IF NOT EXISTS "Tag" (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE,
    color TEXT,
    description TEXT,
    "parentId" TEXT REFERENCES "Tag"(id) ON DELETE SET NULL,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS "Tag_slug_idx" ON "Tag"("slug");

-- AssetTag table
CREATE TABLE IF NOT EXISTS "AssetTag" (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    "assetId" TEXT NOT NULL REFERENCES "Asset3D"(id) ON DELETE CASCADE,
    "tagId" TEXT NOT NULL REFERENCES "Tag"(id) ON DELETE CASCADE,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    UNIQUE("assetId", "tagId")
);

CREATE INDEX IF NOT EXISTS "AssetTag_assetId_idx" ON "AssetTag"("assetId");
CREATE INDEX IF NOT EXISTS "AssetTag_tagId_idx" ON "AssetTag"("tagId");

-- Category table
CREATE TABLE IF NOT EXISTS "Category" (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    icon TEXT,
    "parentId" TEXT REFERENCES "Category"(id) ON DELETE SET NULL,
    "order" INT DEFAULT 0 NOT NULL,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS "Category_slug_idx" ON "Category"("slug");
CREATE INDEX IF NOT EXISTS "Category_order_idx" ON "Category"("order");

-- AssetCategory table
CREATE TABLE IF NOT EXISTS "AssetCategory" (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    "assetId" TEXT NOT NULL REFERENCES "Asset3D"(id) ON DELETE CASCADE,
    "categoryId" TEXT NOT NULL REFERENCES "Category"(id) ON DELETE CASCADE,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    UNIQUE("assetId", "categoryId")
);

CREATE INDEX IF NOT EXISTS "AssetCategory_assetId_idx" ON "AssetCategory"("assetId");
CREATE INDEX IF NOT EXISTS "AssetCategory_categoryId_idx" ON "AssetCategory"("categoryId");

-- Collection table
CREATE TABLE IF NOT EXISTS "Collection" (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    "coverAssetId" TEXT,
    "isPublic" BOOLEAN DEFAULT false,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS "Collection_userId_idx" ON "Collection"("userId");
CREATE INDEX IF NOT EXISTS "Collection_slug_idx" ON "Collection"("slug");

-- CollectionAsset table
CREATE TABLE IF NOT EXISTS "CollectionAsset" (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    "collectionId" TEXT NOT NULL REFERENCES "Collection"(id) ON DELETE CASCADE,
    "assetId" TEXT NOT NULL REFERENCES "Asset3D"(id) ON DELETE CASCADE,
    "order" INT DEFAULT 0 NOT NULL,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    UNIQUE("collectionId", "assetId")
);

CREATE INDEX IF NOT EXISTS "CollectionAsset_collectionId_idx" ON "CollectionAsset"("collectionId");
CREATE INDEX IF NOT EXISTS "CollectionAsset_assetId_idx" ON "CollectionAsset"("assetId");
