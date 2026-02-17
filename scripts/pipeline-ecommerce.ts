#!/usr/bin/env tsx
/**
 * Pipeline Completo V3 - EcommerceTeste03
 * 
 * Etapas:
 * 1. Análise do GLB (malhas, texturas, vértices, triângulos)
 * 2. Geração de LODs reais (meshoptimizer simplify)
 * 3. Simulação de compressão KTX2
 * 4. Compressão Draco real (KHR_draco_mesh_compression)
 * 5. Geração do RenderManifest V2
 * 6. Relatório final
 */

import fs from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { weld, prune, dedup, simplify, draco } from '@gltf-transform/functions';
import { KHRDracoMeshCompression } from '@gltf-transform/extensions';
import { MeshoptSimplifier } from 'meshoptimizer';
import draco3d from 'draco3dgltf';

// ──────────────────────────────────────────────────────────────
// Config
// ──────────────────────────────────────────────────────────────

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, '..');
const GLB_PATH = path.join(PROJECT_ROOT, 'sample', 'EcommerceTeste03.glb');
const OUTPUT_DIR = '/tmp/ecommerce-v3-output';
const ASSET_SLUG = 'ecommerce-teste03';
const ASSET_NAME = 'EcommerceTeste03';

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

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

function ensureDir(dir: string): void {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function formatBytes(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / 1024 / 1024).toFixed(2) + ' MB';
}

function formatNumber(num: number): string {
    return num.toLocaleString('pt-BR');
}

function pad(str: string, len: number): string {
    return str.padStart(len);
}

function elapsed(start: number): string {
    return ((performance.now() - start) / 1000).toFixed(2) + 's';
}

// ──────────────────────────────────────────────────────────────
// Step 1 – Analyse GLB
// ──────────────────────────────────────────────────────────────

interface GLBAnalysis {
    fileSize: number;
    version: string;
    textures: Array<{ name: string; width: number; height: number; format: string }>;
    meshes: Array<{ name: string; vertices: number; triangles: number }>;
    totalVertices: number;
    totalTriangles: number;
    materials: number;
    animations: number;
}

async function analyzeGLB(filePath: string): Promise<GLBAnalysis> {
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
            }
            const indices = prim.getIndices();
            if (indices) {
                meshTriangles += indices.getCount() / 3;
            } else if (prim.getAttribute('POSITION')) {
                meshTriangles += prim.getAttribute('POSITION')!.getCount() / 3;
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
        materials: root.listMaterials().length,
        animations: root.listAnimations().length,
    };
}

// ──────────────────────────────────────────────────────────────
// Step 2 – Generate LODs
// ──────────────────────────────────────────────────────────────

interface LODResult {
    level: number;
    distance: number;
    url: string;
    filePath: string;
    vertices: number;
    triangles: number;
    fileSize: number;
    elapsed: string;
}

async function generateLOD(
    inputPath: string,
    config: LODConfig
): Promise<LODResult> {
    const t0 = performance.now();
    const io = new NodeIO().setAllowNetwork(false);
    const buffer = fs.readFileSync(inputPath);
    const document = await io.readBinary(new Uint8Array(buffer));

    // Always clean up the mesh
    await document.transform(
        weld({ tolerance: 0.001 }),
        prune(),
        dedup()
    );

    // Simplify for LOD1 and above
    if (config.level > 0) {
        await document.transform(
            simplify({ simplifier: MeshoptSimplifier, ratio: config.ratio, error: config.error })
        );
    }

    // Count post-transform geometry
    const root = document.getRoot();
    let vertices = 0;
    let triangles = 0;

    for (const mesh of root.listMeshes()) {
        for (const prim of mesh.listPrimitives()) {
            const position = prim.getAttribute('POSITION');
            if (position) vertices += position.getCount();
            const indices = prim.getIndices();
            if (indices) {
                triangles += indices.getCount() / 3;
            } else if (position) {
                triangles += position.getCount() / 3;
            }
        }
    }

    const fileName = `${ASSET_SLUG}-lod${config.level}.glb`;
    const outputPath = path.join(OUTPUT_DIR, fileName);
    const outputBuffer = await io.writeBinary(document);
    fs.writeFileSync(outputPath, Buffer.from(outputBuffer));

    return {
        level: config.level,
        distance: config.distance,
        url: `https://cdn.simplexr.com/assets/${ASSET_SLUG}/${fileName}`,
        filePath: outputPath,
        vertices,
        triangles: Math.floor(triangles),
        fileSize: outputBuffer.byteLength,
        elapsed: elapsed(t0),
    };
}

// ──────────────────────────────────────────────────────────────
// Step 3b – Draco Compression (real)
// ──────────────────────────────────────────────────────────────

interface DracoResult {
    level: number;
    filePath: string;
    url: string;
    originalSize: number;
    compressedSize: number;
    reductionPercent: number;
    elapsed: string;
}

async function compressWithDraco(
    lodResult: LODResult
): Promise<DracoResult> {
    const t0 = performance.now();

    // Create IO with Draco extension registered
    const io = new NodeIO()
        .setAllowNetwork(false)
        .registerExtensions([KHRDracoMeshCompression])
        .registerDependencies({
            'draco3d.encoder': await draco3d.createEncoderModule(),
            'draco3d.decoder': await draco3d.createDecoderModule(),
        });

    // Read the LOD file
    const buffer = fs.readFileSync(lodResult.filePath);
    const document = await io.readBinary(new Uint8Array(buffer));

    // Apply Draco compression transform
    await document.transform(
        draco({
            method: 'edgebreaker',
            encodeSpeed: 5,
            decodeSpeed: 5,
            quantizePosition: 14,
            quantizeNormal: 10,
            quantizeColor: 8,
            quantizeTexcoord: 12,
            quantizeGeneric: 12,
        })
    );

    // Write the compressed file
    const fileName = `${ASSET_SLUG}-lod${lodResult.level}.draco.glb`;
    const outputPath = path.join(OUTPUT_DIR, fileName);
    const outputBuffer = await io.writeBinary(document);
    fs.writeFileSync(outputPath, Buffer.from(outputBuffer));

    const compressedSize = outputBuffer.byteLength;
    const reductionPercent = ((1 - compressedSize / lodResult.fileSize) * 100);

    return {
        level: lodResult.level,
        filePath: outputPath,
        url: `https://cdn.simplexr.com/assets/${ASSET_SLUG}/${fileName}`,
        originalSize: lodResult.fileSize,
        compressedSize,
        reductionPercent,
        elapsed: elapsed(t0),
    };
}

// ──────────────────────────────────────────────────────────────
// Step 5 – RenderManifest V2
// ──────────────────────────────────────────────────────────────

function createRenderManifest(info: GLBAnalysis, lods: LODResult[], dracoResults: DracoResult[]) {
    return {
        version: '2.0',
        generatedAt: new Date().toISOString(),
        manifest: {
            asset: {
                id: ASSET_SLUG,
                name: ASSET_NAME,
                masterUrl: `https://cdn.simplexr.com/assets/${ASSET_SLUG}/master.glb`,
                formats: {
                    primary: lods[0].url,
                    lods: lods.map((lod) => {
                        const dracoLod = dracoResults.find(d => d.level === lod.level);
                        return {
                            level: lod.level,
                            url: lod.url,
                            dracoUrl: dracoLod?.url,
                            distance: lod.distance,
                            vertices: lod.vertices,
                            triangles: lod.triangles,
                            fileSize: lod.fileSize,
                            dracoFileSize: dracoLod?.compressedSize,
                        };
                    }),
                },
                capabilities: {
                    ktx2: false,
                    draco: true,
                    lods: true,
                    materialVariants: false,
                },
                draco: {
                    method: 'edgebreaker',
                    quantization: {
                        position: 14,
                        normal: 10,
                        color: 8,
                        texcoord: 12,
                    },
                },
                metadata: {
                    vertices: info.totalVertices,
                    triangles: info.totalTriangles,
                    textures: info.textures.length,
                    materials: info.materials,
                    animations: info.animations,
                    originalSize: info.fileSize,
                },
            },
            quality: {
                profile: 'high',
                shadows: true,
                antialiasing: 'msaa',
                toneMappingExposure: 1.0,
            },
            camera: {
                default: {
                    position: { x: 0, y: 1, z: 3 },
                    target: { x: 0, y: 0.5, z: 0 },
                    fov: 45,
                    near: 0.1,
                    far: 1000,
                },
            },
            lighting: {
                preset: 'studio',
                hdri: 'https://cdn.simplexr.com/hdri/studio-soft.hdr',
                exposure: 1.0,
                intensity: 1.2,
            },
        },
    };
}

// ──────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────

async function main() {
    const t0 = performance.now();

    console.log('');
    console.log('╔══════════════════════════════════════════════════════════════════╗');
    console.log('║  🛍️  EcommerceTeste03 – Pipeline V3 Completo                     ║');
    console.log('║  SimpleXR Headless 3D DAM                                        ║');
    console.log('╚══════════════════════════════════════════════════════════════════╝');
    console.log('');

    // Validate input
    if (!fs.existsSync(GLB_PATH)) {
        console.error(`❌ Arquivo não encontrado: ${GLB_PATH}`);
        process.exit(1);
    }
    ensureDir(OUTPUT_DIR);

    // ════════════════════════════════════════
    // STEP 1 – Análise do GLB
    // ════════════════════════════════════════
    console.log('📊 STEP 1: Análise do Arquivo GLB');
    console.log('─'.repeat(64));

    const info = await analyzeGLB(GLB_PATH);

    console.log(`   Arquivo:     ${path.basename(GLB_PATH)}`);
    console.log(`   Tamanho:     ${formatBytes(info.fileSize)}`);
    console.log(`   Versão glTF: ${info.version}`);
    console.log(`   Malhas:      ${info.meshes.length}`);
    console.log(`   Materiais:   ${info.materials}`);
    console.log(`   Animações:   ${info.animations}`);
    console.log(`   Vértices:    ${formatNumber(info.totalVertices)}`);
    console.log(`   Triângulos:  ${formatNumber(info.totalTriangles)}`);
    console.log(`   Texturas:    ${info.textures.length}`);

    if (info.textures.length > 0) {
        console.log('\n   🎨 Texturas:');
        for (const tex of info.textures) {
            const memMB = (tex.width * tex.height * 4 / 1024 / 1024).toFixed(2);
            console.log(`      • ${tex.name}: ${tex.width}×${tex.height} ${tex.format} (~${memMB} MB GPU)`)
        }
    }

    if (info.meshes.length > 0) {
        console.log('\n   📐 Malhas:');
        for (const mesh of info.meshes) {
            console.log(`      • ${mesh.name}: ${formatNumber(mesh.vertices)} vértices, ${formatNumber(mesh.triangles)} triângulos`);
        }
    }

    // ════════════════════════════════════════
    // STEP 2 – Geração de LODs
    // ════════════════════════════════════════
    console.log('\n\n📐 STEP 2: Geração de LODs (meshoptimizer)');
    console.log('─'.repeat(64));

    const lodResults: LODResult[] = [];

    for (const config of LOD_CONFIGS) {
        console.log(`\n   ${config.name}`);
        console.log('   ' + '─'.repeat(60));

        const result = await generateLOD(GLB_PATH, config);
        lodResults.push(result);

        const vertexPct = ((result.vertices / info.totalVertices) * 100).toFixed(1);
        const sizeReduction = ((1 - result.fileSize / info.fileSize) * 100).toFixed(1);

        console.log(`   Vértices:   ${formatNumber(result.vertices)} (${vertexPct}% do original)`);
        console.log(`   Triângulos: ${formatNumber(result.triangles)}`);
        console.log(`   Tamanho:    ${formatBytes(result.fileSize)} (−${sizeReduction}%)`);
        console.log(`   Tempo:      ${result.elapsed}`);
    }

    // Copy master file
    const masterPath = path.join(OUTPUT_DIR, `${ASSET_SLUG}-master.glb`);
    fs.copyFileSync(GLB_PATH, masterPath);
    console.log(`\n   ✓ Master copiado: ${masterPath}`);

    // ════════════════════════════════════════
    // STEP 3 – KTX2 (simulado)
    // ════════════════════════════════════════
    console.log('\n\n🎨 STEP 3: KTX2 Texture Compression (simulado)');
    console.log('─'.repeat(64));

    if (info.textures.length === 0) {
        console.log('   ⚠️  Nenhuma textura encontrada – KTX2 não aplicável.');
    } else {
        console.log('   ⚠️  KTX2 requer Basis Universal transcoder (não instalado)');
        console.log('   Simulando compressão de texturas...\n');

        const ktx2Ratio = 0.25;
        const ktx2Size = Math.floor(info.fileSize * ktx2Ratio);
        const ktx2Reduction = ((1 - ktx2Ratio) * 100).toFixed(1);

        console.log(`   Tamanho original:    ${formatBytes(info.fileSize)}`);
        console.log(`   Tamanho estimado:    ${formatBytes(ktx2Size)}`);
        console.log(`   Redução estimada:    ${ktx2Reduction}%`);
    }

    // ════════════════════════════════════════
    // STEP 4 – Draco Compression (real)
    // ════════════════════════════════════════
    console.log('\n\n🗜️  STEP 4: Draco Mesh Compression (KHR_draco_mesh_compression)');
    console.log('─'.repeat(64));

    const dracoResults: DracoResult[] = [];

    for (const lodResult of lodResults) {
        console.log(`\n   LOD${lodResult.level} → Draco`);
        console.log('   ' + '─'.repeat(60));

        const dracoResult = await compressWithDraco(lodResult);
        dracoResults.push(dracoResult);

        console.log(`   Original:    ${formatBytes(dracoResult.originalSize)}`);
        console.log(`   Draco:       ${formatBytes(dracoResult.compressedSize)}`);
        console.log(`   Redução:     ${dracoResult.reductionPercent.toFixed(1)}%`);
        console.log(`   Tempo:       ${dracoResult.elapsed}`);
    }

    // Also compress the master file with Draco
    console.log(`\n   Master → Draco`);
    console.log('   ' + '─'.repeat(60));
    const masterDracoT0 = performance.now();
    const masterDracoIo = new NodeIO()
        .setAllowNetwork(false)
        .registerExtensions([KHRDracoMeshCompression])
        .registerDependencies({
            'draco3d.encoder': await draco3d.createEncoderModule(),
            'draco3d.decoder': await draco3d.createDecoderModule(),
        });
    const masterBuffer = fs.readFileSync(GLB_PATH);
    const masterDoc = await masterDracoIo.readBinary(new Uint8Array(masterBuffer));
    await masterDoc.transform(
        draco({ method: 'edgebreaker', encodeSpeed: 5, decodeSpeed: 5, quantizePosition: 14, quantizeNormal: 10, quantizeColor: 8, quantizeTexcoord: 12 })
    );
    const masterDracoPath = path.join(OUTPUT_DIR, `${ASSET_SLUG}-master.draco.glb`);
    const masterDracoBuffer = await masterDracoIo.writeBinary(masterDoc);
    fs.writeFileSync(masterDracoPath, Buffer.from(masterDracoBuffer));
    const masterDracoReduction = ((1 - masterDracoBuffer.byteLength / masterBuffer.byteLength) * 100).toFixed(1);
    console.log(`   Original:    ${formatBytes(masterBuffer.byteLength)}`);
    console.log(`   Draco:       ${formatBytes(masterDracoBuffer.byteLength)}`);
    console.log(`   Redução:     ${masterDracoReduction}%`);
    console.log(`   Tempo:       ${elapsed(masterDracoT0)}`);

    // ════════════════════════════════════════
    // STEP 5 – RenderManifest V2
    // ════════════════════════════════════════
    console.log('\n\n📋 STEP 5: RenderManifest V2');
    console.log('─'.repeat(64));

    const manifest = createRenderManifest(info, lodResults, dracoResults);
    const manifestPath = path.join(OUTPUT_DIR, 'render-manifest-v2.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    console.log(`   ✓ Schema versão:      ${manifest.version}`);
    console.log(`   ✓ Asset:              ${manifest.manifest.asset.name}`);
    console.log(`   ✓ LODs disponíveis:   ${manifest.manifest.asset.formats.lods.length}`);
    console.log(`   ✓ Capabilities:       LODs=${manifest.manifest.asset.capabilities.lods}, Draco=${manifest.manifest.asset.capabilities.draco}`);
    console.log(`   ✓ Arquivo:            ${manifestPath}`);

    // ════════════════════════════════════════
    // SUMMARY
    // ════════════════════════════════════════
    console.log('\n\n╔══════════════════════════════════════════════════════════════════╗');
    console.log('║  ✅ PIPELINE V3 CONCLUÍDO                                        ║');
    console.log('╚══════════════════════════════════════════════════════════════════╝\n');

    // Files generated
    console.log('📁 Arquivos Gerados:');
    console.log('   ' + '─'.repeat(60));
    console.log(`   ${masterPath}`);
    console.log(`   ${masterDracoPath}`);
    for (const lod of lodResults) {
        console.log(`   ${lod.filePath}`);
    }
    for (const dr of dracoResults) {
        console.log(`   ${dr.filePath}`);
    }
    console.log(`   ${manifestPath}`);

    // LOD Table
    console.log('\n📊 Tabela de LODs:');
    console.log('   ┌──────┬──────────────┬─────────────┬──────────────┬────────────┬──────────┐');
    console.log('   │ LOD  │ Vértices     │ Triângulos  │ Tamanho      │ Redução    │ Dist.    │');
    console.log('   ├──────┼──────────────┼─────────────┼──────────────┼────────────┼──────────┤');

    for (const lod of lodResults) {
        const reduction = lod.level === 0
            ? '—'
            : `${((1 - lod.fileSize / lodResults[0].fileSize) * 100).toFixed(1)}%`;
        console.log(
            `   │ LOD${lod.level} │ ${pad(formatNumber(lod.vertices), 12)} │ ` +
            `${pad(formatNumber(lod.triangles), 11)} │ ` +
            `${pad(formatBytes(lod.fileSize), 12)} │ ` +
            `${pad(reduction, 10)} │ ` +
            `${pad(lod.distance + 'm+', 8)} │`
        );
    }
    console.log('   └──────┴──────────────┴─────────────┴──────────────┴────────────┴──────────┘');

    // Draco table
    console.log('\n🗜️  Tabela Draco:');
    console.log('   ┌──────┬──────────────┬──────────────┬────────────┬──────────┐');
    console.log('   │ LOD  │ Sem Draco    │ Com Draco    │ Redução    │ Tempo    │');
    console.log('   ├──────┼──────────────┼──────────────┼────────────┼──────────┤');

    for (const dr of dracoResults) {
        console.log(
            `   │ LOD${dr.level} │ ${pad(formatBytes(dr.originalSize), 12)} │ ` +
            `${pad(formatBytes(dr.compressedSize), 12)} │ ` +
            `${pad(dr.reductionPercent.toFixed(1) + '%', 10)} │ ` +
            `${pad(dr.elapsed, 8)} │`
        );
    }
    console.log('   └──────┴──────────────┴──────────────┴────────────┴──────────┘');

    // Bandwidth savings
    const bestDraco = dracoResults[dracoResults.length - 1];
    const savings = info.fileSize - bestDraco.compressedSize;
    const savingsPercent = ((savings / info.fileSize) * 100).toFixed(1);
    console.log(`\n💾 Economia total (LOD2+Draco vs original): ${formatBytes(savings)} (${savingsPercent}%)`);
    console.log(`🚀 Carregamento até ${savingsPercent}% mais rápido com LOD2+Draco`);

    // CDN URLs
    console.log('\n🌐 CDN URLs:');
    console.log('   ' + '─'.repeat(60));
    console.log(`   Master:       https://cdn.simplexr.com/assets/${ASSET_SLUG}/master.glb`);
    console.log(`   Master+Draco: https://cdn.simplexr.com/assets/${ASSET_SLUG}/${ASSET_SLUG}-master.draco.glb`);
    for (const lod of lodResults) {
        const dr = dracoResults.find(d => d.level === lod.level);
        console.log(`   LOD${lod.level}:         ${lod.url}`);
        if (dr) console.log(`   LOD${lod.level}+Draco:   ${dr.url}`);
    }

    // Cache headers
    console.log('\n⚡ Cache Headers:');
    console.log('   ' + '─'.repeat(60));
    console.log('   LOD0/1/2: Cache-Control: public, max-age=31536000, immutable');
    console.log('   Manifest: Cache-Control: public, max-age=60, stale-while-revalidate=300');

    // Viewer usage
    console.log('\n📖 Como usar no viewer:');
    console.log('   ' + '─'.repeat(60));
    console.log(`   fetch("/viewer/assets/${ASSET_SLUG}/render?maxLod=2")`);
    console.log('     .then(r => r.json())');
    console.log('     .then(manifest => {');
    console.log('       // Viewer recebe LODs configurados');
    console.log('       // Troca automática baseada em distância da câmera');
    console.log('     });');

    // Total time
    console.log(`\n⏱️  Tempo total: ${elapsed(t0)}`);
    console.log('\n' + '═'.repeat(64));
    console.log('');
}

main().catch((err) => {
    console.error('❌ Erro no pipeline:', err);
    process.exit(1);
});
