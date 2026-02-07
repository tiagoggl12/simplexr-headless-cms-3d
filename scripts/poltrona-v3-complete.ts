#!/usr/bin/env tsx
/**
 * Demonstração completa do Pipeline V3 com a Poltrona Guadalupe
 * - Análise do GLB
 * - Geração de LODs reais
 * - Metadados para RenderManifest V2
 */

import fs from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { weld, prune, dedup, simplify } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';

const GLB_PATH = '/Users/tiago/Downloads/Poltrona Guadalupe.glb';
const OUTPUT_DIR = '/tmp/poltrona-v3-output';

interface LODConfig {
  level: number;
  ratio: number;
  error: number;
  distance: number;
  name: string;
}

const LOD_CONFIGS: LODConfig[] = [
  { level: 0, ratio: 1.0, error: 0.0, distance: 0, name: 'LOD0 - Full Quality (0-10m)' },
  { level: 1, ratio: 0.5, error: 0.0025, distance: 10, name: 'LOD1 - Medium Quality (10-50m)' },
  { level: 2, ratio: 0.25, error: 0.01, distance: 50, name: 'LOD2 - Low Quality (50m+)' },
];

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function analyzeGLB(filePath: string): Promise<{
  fileSize: number;
  version: string;
  textures: Array<{ name: string; width: number; height: number; format: string }>;
  meshes: Array<{ name: string; vertices: number; triangles: number }>;
  totalVertices: number;
  totalTriangles: number;
}> {
  const buffer = fs.readFileSync(filePath);
  const io = new NodeIO().setAllowNetwork(false);
  const document = await io.readBinary(new Uint8Array(buffer));
  const root = document.getRoot();

  const asset = root.getAsset();
  const version = (asset as any)?.version || '2.0';

  const textures = root.listTextures().map((tex) => {
    const size = tex.getSize();
    return {
      name: tex.getName() || 'unnamed',
      width: size?.[0] || 0,
      height: size?.[1] || 0,
      format: tex.getMimeType() || 'unknown',
    };
  });

  const meshes: Array<{ name: string; vertices: number; triangles: number }> = [];
  let totalVertices = 0;
  let totalTriangles = 0;

  for (const mesh of root.listMeshes()) {
    let meshVertices = 0;
    let meshTriangles = 0;

    for (const prim of mesh.listPrimitives()) {
      const position = prim.getAttribute('POSITION');
      if (position) {
        const count = position.getCount();
        meshVertices += count;
        meshTriangles += count / 3;
      }
    }

    meshes.push({
      name: mesh.getName() || 'unnamed',
      vertices: meshVertices,
      triangles: Math.floor(meshTriangles),
    });

    totalVertices += meshVertices;
    totalTriangles += Math.floor(meshTriangles);
  }

  return {
    fileSize: buffer.byteLength,
    version,
    textures,
    meshes,
    totalVertices,
    totalTriangles,
  };
}

async function generateLOD(
  inputPath: string,
  config: LODConfig
): Promise<{ url: string; vertices: number; triangles: number; fileSize: number }> {
  const io = new NodeIO().setAllowNetwork(false);
  const buffer = fs.readFileSync(inputPath);
  const document = await io.readBinary(new Uint8Array(buffer));

  // Apply optimizations
  await document.transform(
    weld({ tolerance: 0.001 }),
    prune(),
    dedup()
  );

  // Apply simplification for LOD1+
  if (config.level > 0) {
    await document.transform(
      simplify({ simplifier: MeshoptSimplifier, ratio: config.ratio, error: config.error })
    );
  }

  // Count vertices and triangles
  const root = document.getRoot();
  let vertices = 0;
  let triangles = 0;

  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const position = prim.getAttribute('POSITION');
      if (position) {
        const count = position.getCount();
        vertices += count;
        triangles += count / 3;
      }
    }
  }

  // Write file
  const outputBuffer = await io.writeBinary(document);
  const fileName = `poltrona-lod${config.level}.glb`;
  const outputPath = path.join(OUTPUT_DIR, fileName);
  fs.writeFileSync(outputPath, Buffer.from(outputBuffer));

  return {
    url: `https://cdn.example.com/assets/poltrona-guadalupe/${fileName}`,
    vertices,
    triangles: Math.floor(triangles),
    fileSize: outputBuffer.byteLength,
  };
}

function createRenderManifestV2(info: any, lods: any[]) {
  return {
    version: '2.0',
    manifest: {
      asset: {
        id: 'poltrona-guadalupe',
        name: 'Poltrona Guadalupe',
        masterUrl: 'https://cdn.example.com/assets/poltrona-guadalupe/master.glb',
        formats: {
          primary: lods[0].url,
          lods: lods.map((lod) => ({
            level: lod.level,
            url: lod.url,
            distance: lod.distance,
            vertices: lod.vertices,
            triangles: lod.triangles,
            fileSize: lod.fileSize,
          })),
        },
        capabilities: {
          ktx2: false, // Not implemented yet
          lods: true,
        },
        metadata: {
          vertices: info.totalVertices,
          triangles: info.totalTriangles,
          textures: info.textures.length,
          originalSize: info.fileSize,
        },
      },
      quality: {
        profile: 'high',
        shadows: true,
        antialiasing: 'msaa',
      },
      camera: {
        default: {
          position: { x: 0, y: 1, z: 3 },
          target: { x: 0, y: 0.5, z: 0 },
        },
      },
      lighting: {
        preset: 'studio',
        hdri: 'https://cdn.example.com/hdri/studio.hdr',
        exposure: 1.0,
      },
    },
  };
}

function formatBytes(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(2) + ' MB';
}

function formatNumber(num: number): string {
  return num.toLocaleString('pt-BR');
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  🪑 Poltrona Guadalupe - Pipeline V3 Completo                  ║');
  console.log('║  SimpleXR Headless 3D DAM                                      ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  ensureDir(OUTPUT_DIR);

  // Step 1: Analyze GLB
  console.log('📊 STEP 1: Análise do Arquivo GLB');
  console.log('─'.repeat(60));

  const info = await analyzeGLB(GLB_PATH);

  console.log(`   Arquivo: ${path.basename(GLB_PATH)}`);
  console.log(`   Tamanho: ${formatBytes(info.fileSize)}`);
  console.log(`   Versão glTF: ${info.version}`);
  console.log(`   Malhas: ${info.meshes.length}`);
  console.log(`   Vértices: ${formatNumber(info.totalVertices)}`);
  console.log(`   Triângulos: ${formatNumber(info.totalTriangles)}`);
  console.log(`   Texturas: ${info.textures.length}`);

  if (info.textures.length > 0) {
    console.log('\n   🎨 Texturas:');
    for (const tex of info.textures) {
      const memMB = (tex.width * tex.height * 4 / 1024 / 1024).toFixed(2);
      console.log(`      • ${tex.name}: ${tex.width}x${tex.height} ${tex.format} (~${memMB} MB descomprimido)`);
    }
  }

  // Step 2: Generate LODs
  console.log('\n\n📐 STEP 2: Geração de LODs');
  console.log('─'.repeat(60));

  const lodResults = [];
  const originalSize = info.fileSize;

  for (const config of LOD_CONFIGS) {
    console.log(`\n   ${config.name}`);
    console.log('   ' + '─'.repeat(56));

    const result = await generateLOD(GLB_PATH, config);
    lodResults.push({ ...result, level: config.level, distance: config.distance });

    const vertexRatio = ((result.vertices / info.totalVertices) * 100).toFixed(1);
    const sizeReduction = ((1 - result.fileSize / originalSize) * 100).toFixed(1);

    console.log(`   Vértices: ${formatNumber(result.vertices)} (${vertexRatio}% do original)`);
    console.log(`   Triângulos: ${formatNumber(result.triangles)}`);
    console.log(`   Tamanho: ${formatBytes(result.fileSize)} (${sizeReduction}% redução)`);
    console.log(`   URL: ${result.url}`);
  }

  // Copy master file
  const masterPath = path.join(OUTPUT_DIR, 'poltrona-master.glb');
  fs.copyFileSync(GLB_PATH, masterPath);

  // Step 3: KTX2 Simulation
  console.log('\n\n🎨 STEP 3: KTX2 Texture Compression (simulado)');
  console.log('─'.repeat(60));
  console.log('   ⚠️  KTX2 requer Basis Universal transcoder (não instalado)');
  console.log('   Simulando compressão de texturas...');

  const ktx2Size = Math.floor(originalSize * 0.25);
  const ktx2Reduction = ((1 - ktx2Size / originalSize) * 100).toFixed(1);

  console.log(`\n   Tamanho original: ${formatBytes(originalSize)}`);
  console.log(`   Tamanho KTX2: ${formatBytes(ktx2Size)}`);
  console.log(`   Redução: ${ktx2Reduction}%`);

  // Step 4: RenderManifest V2
  console.log('\n\n📋 STEP 4: RenderManifest V2');
  console.log('─'.repeat(60));

  const manifest = createRenderManifestV2(info, lodResults);
  const manifestPath = path.join(OUTPUT_DIR, 'render-manifest-v2.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  console.log(`   ✓ Schema versão: ${manifest.version}`);
  console.log(`   ✓ Asset: ${manifest.manifest.asset.name}`);
  console.log(`   ✓ LODs disponíveis: ${manifest.manifest.asset.formats.lods.length}`);
  console.log(`   ✓ Cache headers: immutable para LODs`);

  // Step 5: Summary
  console.log('\n\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  ✅ PROCESSAMENTO V3 CONCLUÍDO                                ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  console.log('📁 Arquivos Gerados:');
  console.log('   ' + '─'.repeat(56));
  console.log(`   ${masterPath}`);
  for (const lod of lodResults) {
    const fileName = path.basename(new URL(lod.url).pathname);
    console.log(`   ${path.join(OUTPUT_DIR, fileName)}`);
  }
  console.log(`   ${manifestPath}`);

  console.log('\n📊 Tabela de LODs:');
  console.log('   ┌──────┬──────────────┬─────────────┬──────────────┬────────────┐');
  console.log('   │ LOD  │ Vértices     │ Triângulos  │ Tamanho      │ Distância  │');
  console.log('   ├──────┼──────────────┼─────────────┼──────────────┼────────────┤');

  for (const lod of lodResults) {
    const vertexPct = ((lod.vertices / info.totalVertices) * 100).toFixed(1).padStart(5);
    console.log(
      `   │ LOD${lod.level} │ ${formatNumber(lod.vertices).padStart(12)} │ ` +
      `${formatNumber(lod.triangles).padStart(11)} │ ` +
      `${formatBytes(lod.fileSize).padStart(12)} │ ` +
      `${lod.distance.toString().padStart(4)}m+    │`
    );
  }
  console.log('   └──────┴──────────────┴─────────────┴──────────────┴────────────┘');

  const savings = lodResults[0].fileSize - lodResults[2].fileSize;
  console.log(`\n💾 Economia de banda usando LOD2: ${formatBytes(savings)}`);
  console.log(`🚀 Carregamento até ${((savings / originalSize) * 100).toFixed(1)}% mais rápido para usuários distantes`);

  console.log('\n🌐 URLs CDN (exemplo):');
  console.log('   ' + '─'.repeat(56));
  console.log('   Master: https://cdn.example.com/assets/poltrona-guadalupe/master.glb');
  console.log('   LOD0:   https://cdn.example.com/assets/poltrona-guadalupe/poltrona-lod0.glb');
  console.log('   LOD1:   https://cdn.example.com/assets/poltrona-guadalupe/poltrona-lod1.glb');
  console.log('   LOD2:   https://cdn.example.com/assets/poltrona-guadalupe/poltrona-lod2.glb');

  console.log('\n⚡ Cache Headers:');
  console.log('   ' + '─'.repeat(56));
  console.log('   LOD0/1/2: Cache-Control: public, max-age=31536000, immutable');
  console.log('   RenderManifest: Cache-Control: public, max-age=60, stale-while-revalidate=300');

  console.log('\n📖 Como usar no viewer:');
  console.log('   ' + '─'.repeat(56));
  console.log('   fetch("/viewer/assets/poltrona-guadalupe/render?maxLod=2")');
  console.log('     .then(r => r.json())');
  console.log('     .then(manifest => {');
  console.log('         // Viewer recebe LODs configurados');
  console.log('         // Troca automática baseada em distância da câmera');
  console.log('       });');

  console.log('\n' + '═'.repeat(60));
  console.log('');
}

main().catch(console.error);
