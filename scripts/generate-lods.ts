#!/usr/bin/env tsx
/**
 * Script para gerar LODs reais da Poltrona Guadalupe
 * Usa glTF Transform simplify() para redução de malhas
 */

import fs from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { simplify, weld, prune, dedup } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';

const GLB_PATH = '/Users/tiago/Downloads/Poltrona Guadalupe.glb';
const OUTPUT_DIR = '/tmp/poltrona-output';

interface LODConfig {
  level: number;
  ratio: number; // 0.0-1.0, fraction of triangles to keep
  error: number; // simplification error tolerance
}

const LOD_CONFIGS: LODConfig[] = [
  { level: 0, ratio: 1.0, error: 0.0 },   // LOD0 - Original (0-10m)
  { level: 1, ratio: 0.5, error: 0.0025 }, // LOD1 - 50% (10-50m)
  { level: 2, ratio: 0.25, error: 0.01 },  // LOD2 - 25% (50m+)
];

async function ensureOutputDir(): Promise<void> {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
}

async function generateLOD(
  inputPath: string,
  outputPath: string,
  config: LODConfig
): Promise<{ vertices: number; triangles: number; fileSize: number }> {
  const io = new NodeIO().setAllowNetwork(false);
  const buffer = fs.readFileSync(inputPath);
  const document = await io.readBinary(new Uint8Array(buffer));
  const root = document.getRoot();

  // Apply transforms: weld duplicate vertices, prune unused resources, dedup
  if (config.level > 0) {
    await document.transform(
      weld(), // Weld duplicate vertices
      prune(), // Remove unused resources
      dedup() // Deduplicate accessors and materials
    );

    // Apply simplification
    await document.transform(
      simplify({
        simplifier: MeshoptSimplifier,
        ratio: config.ratio,
        error: config.error,
      })
    );
  }

  // Count vertices and triangles after transformation
  const meshes = root.listMeshes();
  let totalVertices = 0;
  let totalTriangles = 0;

  for (const mesh of meshes) {
    for (const prim of mesh.listPrimitives()) {
      const position = prim.getAttribute('POSITION');
      if (position) {
        const count = position.getCount();
        totalVertices += count;
        totalTriangles += count / 3;
      }
    }
  }

  // Write the LOD file
  const outputBuffer = await io.writeBinary(document);
  fs.writeFileSync(outputPath, Buffer.from(outputBuffer));

  return {
    vertices: totalVertices,
    triangles: Math.floor(totalTriangles),
    fileSize: outputBuffer.byteLength,
  };
}

async function main() {
  console.log('🪑 Gerando LODs da Poltrona Guadalupe\n');
  console.log('='.repeat(60));

  await ensureOutputDir();

  const results: Array<{
    level: number;
    vertices: number;
    triangles: number;
    fileSize: number;
    path: string;
  }> = [];

  // Generate LOD0 (original with cleanup)
  console.log('\n📐 Gerando LOD0 (original + weld/prune/dedup)...');
  const lod0Path = path.join(OUTPUT_DIR, 'poltrona-lod0.glb');
  const lod0 = await generateLOD(GLB_PATH, lod0Path, LOD_CONFIGS[0]);
  results.push({ level: 0, ...lod0, path: lod0Path });
  console.log(`   ✓ ${lod0.vertices.toLocaleString()} vértices`);
  console.log(`   ✓ ${lod0.triangles.toLocaleString()} triângulos`);
  console.log(`   ✓ ${(lod0.fileSize / 1024 / 1024).toFixed(2)} MB`);

  // Generate LOD1
  console.log('\n📐 Gerando LOD1 (50% simplificação)...');
  const lod1Path = path.join(OUTPUT_DIR, 'poltrona-lod1.glb');
  const lod1 = await generateLOD(GLB_PATH, lod1Path, LOD_CONFIGS[1]);
  results.push({ level: 1, ...lod1, path: lod1Path });
  const lod1Reduction = ((1 - lod1.fileSize / lod0.fileSize) * 100).toFixed(1);
  console.log(`   ✓ ${lod1.vertices.toLocaleString()} vértices (${((lod1.vertices / lod0.vertices) * 100).toFixed(1)}%)`);
  console.log(`   ✓ ${lod1.triangles.toLocaleString()} triângulos`);
  console.log(`   ✓ ${(lod1.fileSize / 1024 / 1024).toFixed(2)} MB (${lod1Reduction}% redução)`);

  // Generate LOD2
  console.log('\n📐 Gerando LOD2 (25% simplificação)...');
  const lod2Path = path.join(OUTPUT_DIR, 'poltrona-lod2.glb');
  const lod2 = await generateLOD(GLB_PATH, lod2Path, LOD_CONFIGS[2]);
  results.push({ level: 2, ...lod2, path: lod2Path });
  const lod2Reduction = ((1 - lod2.fileSize / lod0.fileSize) * 100).toFixed(1);
  console.log(`   ✓ ${lod2.vertices.toLocaleString()} vértices (${((lod2.vertices / lod0.vertices) * 100).toFixed(1)}%)`);
  console.log(`   ✓ ${lod2.triangles.toLocaleString()} triângulos`);
  console.log(`   ✓ ${(lod2.fileSize / 1024 / 1024).toFixed(2)} MB (${lod2Reduction}% redução)`);

  // Also copy the original to master
  const masterPath = path.join(OUTPUT_DIR, 'poltrona-master.glb');
  fs.copyFileSync(GLB_PATH, masterPath);
  const masterStats = fs.statSync(masterPath);

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('\n✅ LODs gerados com sucesso!');
  console.log('\n📁 Arquivos criados:');
  console.log(`   ${masterPath}`);
  console.log(`   ${lod0Path}`);
  console.log(`   ${lod1Path}`);
  console.log(`   ${lod2Path}`);

  console.log('\n📊 Resumo dos LODs:');
  console.log('   ┌──────┬──────────────┬─────────────┬──────────────┬────────────┐');
  console.log('   │ LOD  │ Vértices     │ Triângulos  │ Tamanho      │ Redução    │');
  console.log('   ├──────┼──────────────┼─────────────┼──────────────┼────────────┤');

  for (const r of results) {
    const reduction = r.level === 0
      ? '—'
      : `${((1 - r.fileSize / results[0].fileSize) * 100).toFixed(1)}%`;
    console.log(
      `   │ LOD${r.level} │ ${(r.vertices.toLocaleString()).padStart(12)} │ ` +
      `${(r.triangles.toLocaleString()).padStart(11)} │ ` +
      `${((r.fileSize / 1024 / 1024).toFixed(2) + ' MB').padStart(12)} │ ` +
      `${reduction.padStart(10)} │`
    );
  }

  console.log('   └──────┴──────────────┴─────────────┴──────────────┴────────────┘');

  // Calculate bandwidth savings
  const savings = lod0.fileSize - lod2.fileSize;
  console.log(`\n💾 Economia de banda usando LOD2: ${(savings / 1024 / 1024).toFixed(2)} MB`);

  // Generate JSON metadata file
  const metadata = {
    asset: 'Poltrona Guadalupe',
    version: '1.0',
    lods: results.map((r) => ({
      level: r.level,
      url: `./${path.basename(r.path)}`,
      vertices: r.vertices,
      triangles: r.triangles,
      fileSize: r.fileSize,
      distance: [0, 10, 50][r.level],
      switchDistance: r.level === 0 ? 0 : r.level === 1 ? 10 : 50,
    })),
    masterFile: {
      url: './poltrona-master.glb',
      size: masterStats.size,
    },
  };

  const metadataPath = path.join(OUTPUT_DIR, 'metadata.json');
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
  console.log(`\n📋 Metadados salvos em: ${metadataPath}`);

  console.log('\n' + '='.repeat(60));
}

import path from 'node:path';
main().catch(console.error);
