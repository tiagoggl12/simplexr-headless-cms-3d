import { describe, it, expect, beforeAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { KTX2Processor } from '../src/services/ktx-processor.js';
import { DracoCompressor } from '../src/services/draco-compression.js';
import { LODGenerator } from '../src/services/lod-generator.js';
import { USDZConverter } from '../src/services/usdz-converter.js';
import { ThumbnailGenerator } from '../src/services/thumbnail-generator.js';
import { NodeIO } from '@gltf-transform/core';

const TEST_GLB_PATH = join(process.cwd(), 'tests/fixtures/poltrona-guadalupe.glb');
const FILE_URL = `file://${TEST_GLB_PATH}`;

describe('Poltrona Guadalupe - Real Asset Tests', () => {
  let glbBuffer: Buffer;
  let io: NodeIO;

  beforeAll(async () => {
    glbBuffer = await readFile(TEST_GLB_PATH);
    io = new NodeIO().setAllowNetwork(false);
    console.log(`\n========================================`);
    console.log(`Poltrona Guadalupe Test File`);
    console.log(`Path: ${TEST_GLB_PATH}`);
    console.log(`Size: ${(glbBuffer.length / 1024 / 1024).toFixed(2)} MB`);
    console.log(`========================================\n`);
  });

  describe('File Analysis', () => {
    it('should be a valid GLB file', () => {
      const magic = glbBuffer.subarray(0, 4).toString('ascii');
      expect(magic).toBe('glTF');
    });

    it('should have valid glTF version', () => {
      const version = glbBuffer.readUInt32LE(4);
      expect(version).toBe(2);
    });

    it('should be parseable by glTF-Transform', async () => {
      const document = await io.readBinary(new Uint8Array(glbBuffer));
      const root = document.getRoot();

      expect(root).toBeDefined();
    });
  });

  describe('Mesh and Texture Analysis', () => {
    it('should report mesh and texture information', async () => {
      const document = await io.readBinary(new Uint8Array(glbBuffer));
      const root = document.getRoot();

      const meshes = root.listMeshes();
      const textures = root.listTextures();
      const materials = root.listMaterials();
      const scenes = root.listScenes();
      const nodes = root.listNodes();

      let totalVertices = 0;
      let totalTriangles = 0;

      for (const mesh of meshes) {
        for (const primitive of mesh.listPrimitives()) {
          const position = primitive.getAttribute('POSITION');
          if (position) {
            totalVertices += position.getCount();
            totalTriangles += position.getCount() / 3;
          }
        }
      }

      console.log('\n┌─────────────────────────────────────────────┐');
      console.log('│     POLTRONA GUADALUPE - ASSET INFO      │');
      console.log('├─────────────────────────────────────────────┤');
      console.log(`│ File Size:     ${(glbBuffer.length / 1024 / 1024).toFixed(2).padEnd(8)} MB              │`);
      console.log(`│ Scenes:        ${scenes.length.toString().padEnd(8)}                 │`);
      console.log(`│ Nodes:         ${nodes.length.toString().padEnd(8)}                 │`);
      console.log(`│ Meshes:        ${meshes.length.toString().padEnd(8)}                 │`);
      console.log(`│ Materials:     ${materials.length.toString().padEnd(8)}                 │`);
      console.log(`│ Textures:      ${textures.length.toString().padEnd(8)}                 │`);
      console.log('├─────────────────────────────────────────────┤');
      console.log(`│ Vertices:      ${totalVertices.toLocaleString().padEnd(8)}            │`);
      console.log(`│ Triangles:     ${Math.floor(totalTriangles).toLocaleString().padEnd(8)}            │`);
      console.log('└─────────────────────────────────────────────┘\n');

      expect(meshes.length).toBeGreaterThan(0);
    });

    it('should report texture details', async () => {
      const document = await io.readBinary(new Uint8Array(glbBuffer));
      const root = document.getRoot();
      const textures = root.listTextures();

      console.log('Texture Details:');
      console.log('┌─────────────────────────────────────────────────────────────┐');

      if (textures.length === 0) {
        console.log('│ No textures found in model                                  │');
      } else {
        for (let i = 0; i < textures.length; i++) {
          const texture = textures[i];
          const name = texture.getName() || `Texture ${i}`;
          const size = texture.getSize();
          const mimeType = texture.getMimeType() || 'unknown';

          const width = size?.[0] || 0;
          const height = size?.[1] || 0;
          const pixels = (width * height) / 1000000;

          console.log(`│ [${i}] ${name.substring(0, 30).padEnd(30)} ${mimeType.padEnd(10)} ${width}x${height} (${pixels.toFixed(2)}MP) │`);
        }
      }
      console.log('└─────────────────────────────────────────────────────────────┘\n');
    });
  });

  describe('KTX2 Processor', () => {
    it('should analyze the file for KTX2 compression', async () => {
      const processor = new KTX2Processor();

      const metadata = await processor.extractTextureMetadata(FILE_URL);
      const cliInfo = await processor.getCLIInfo();

      console.log('\n┌─────────────────────────────────────────────┐');
      console.log('│         KTX2 COMPRESSION ANALYSIS         │');
      console.log('├─────────────────────────────────────────────┤');
      console.log(`│ Textures found: ${metadata.length.toString().padEnd(26)}│`);
      console.log(`│ toktx CLI available: ${cliInfo.toktx.toString().padEnd(20)}│`);
      console.log(`│ toktx version: ${cliInfo.version || 'N/A'}│`);
      console.log('└─────────────────────────────────────────────┘');

      for (const tex of metadata) {
        console.log(`  - ${tex.name}: ${tex.width}x${tex.height} (${tex.format})`);
      }
      console.log('');

      expect(metadata).toBeDefined();
    });

    it('should validate KTX2 magic bytes', () => {
      const processor = new KTX2Processor();

      // Valid KTX2 magic bytes: «KTX 20»\r\n\x1a\n
      const validKTX2 = Buffer.from([
        0xAB, 0x4B, 0x54, 0x58, 0x20, 0x32, 0xBB, 0x0D, 0x0A, 0x1A, 0x0A,
      ]);

      const isValid = processor.validateKTX2(validKTX2);
      expect(isValid).toBe(true);

      // Invalid should fail
      const invalid = Buffer.from([0x00, 0x01, 0x02, 0x03]);
      expect(processor.validateKTX2(invalid)).toBe(false);
    });
  });

  describe('Draco Compression', () => {
    it('should analyze compression options for the model', async () => {
      const compressor = new DracoCompressor();
      const capabilities = await compressor.getCapabilities();

      // Get model stats
      const document = await io.readBinary(new Uint8Array(glbBuffer));
      const root = document.getRoot();
      const meshes = root.listMeshes();

      let vertexCount = 0;
      let triangleCount = 0;

      for (const mesh of meshes) {
        for (const primitive of mesh.listPrimitives()) {
          const position = primitive.getAttribute('POSITION');
          if (position) {
            vertexCount += position.getCount();
            triangleCount += position.getCount() / 3;
          }
        }
      }

      const recommendedLevel = compressor.getRecommendedCompressionLevel(vertexCount, triangleCount);
      const validation = compressor.validateOptions({ compressionLevel: recommendedLevel });

      console.log('\n┌─────────────────────────────────────────────┐');
      console.log('│        DRACO COMPRESSION ANALYSIS         │');
      console.log('├─────────────────────────────────────────────┤');
      console.log(`│ Vertices: ${vertexCount.toLocaleString().padEnd(30)}│`);
      console.log(`│ Triangles: ${Math.floor(triangleCount).toLocaleString().padEnd(29)}│`);
      console.log('├─────────────────────────────────────────────┤');
      console.log(`│ CLI Available: ${capabilities.cliAvailable.toString().padEnd(23)}│`);
      console.log(`| JS Module Available: ${capabilities.jsModuleAvailable.toString().padEnd(20)}|`);
      console.log(`│ Method: ${capabilities.method.padEnd(32)}│`);
      console.log('├─────────────────────────────────────────────┤');
      console.log(`│ Recommended Level: ${recommendedLevel.toString().padEnd(23)}│`);
      console.log(`│ Options Valid: ${validation.valid.toString().padEnd(25)}│`);
      console.log('└─────────────────────────────────────────────┘\n');

      expect(validation.valid).toBe(true);
    });

    it('should check if file is Draco-encoded', () => {
      const compressor = new DracoCompressor();
      const isEncoded = compressor.isDracoEncoded(glbBuffer);

      console.log(`File is Draco-encoded: ${isEncoded}`);
      expect(typeof isEncoded).toBe('boolean');
    });
  });

  describe('LOD Generation', () => {
    it('should calculate LOD recommendations', async () => {
      const generator = new LODGenerator();

      // Get model stats
      const document = await io.readBinary(new Uint8Array(glbBuffer));
      const root = document.getRoot();
      const meshes = root.listMeshes();

      let vertexCount = 0;
      let triangleCount = 0;

      for (const mesh of meshes) {
        for (const primitive of mesh.listPrimitives()) {
          const position = primitive.getAttribute('POSITION');
          if (position) {
            vertexCount += position.getCount();
            triangleCount += position.getCount() / 3;
          }
        }
      }

      const maxLOD = generator.getRecommendedMaxLOD({
        isMobile: false,
        gpuTier: 'high',
        memoryGB: 16,
      });

      console.log('\n┌─────────────────────────────────────────────┐');
      console.log('│           LOD GENERATION ANALYSIS          │');
      console.log('├─────────────────────────────────────────────┤');
      console.log(`│ Original Vertices: ${vertexCount.toLocaleString().padEnd(21)}│`);
      console.log(`│ Original Triangles: ${Math.floor(triangleCount).toLocaleString().padEnd(20)}│`);
      console.log('├─────────────────────────────────────────────┤');
      console.log(`│ Recommended Max LOD: ${maxLOD.toString().padEnd(23)}│`);
      console.log('├─────────────────────────────────────────────┤');

      // Show LOD level breakdown
      const configs = [
        { level: 0, ratio: 1.0, distance: 0 },
        { level: 1, ratio: 0.5, distance: 10 },
        { level: 2, ratio: 0.25, distance: 50 },
      ];

      for (const config of configs) {
        const lodVertices = Math.floor(vertexCount * config.ratio);
        const lodTriangles = Math.floor(triangleCount * config.ratio);
        const estFileSize = generator.estimateFileSize(glbBuffer.length, config.ratio);
        console.log(`│ LOD${config.level}: ${lodVertices.toLocaleString().padEnd(10)}v ${lodTriangles.toLocaleString().padEnd(10)}t @${config.distance}m  │`);
      }

      console.log('└─────────────────────────────────────────────┘\n');

      expect(vertexCount).toBeGreaterThan(0);
    });
  });

  describe('USDZ Conversion', () => {
    it('should check conversion tool availability', async () => {
      const converter = new USDZConverter();

      const toolsAvailable = await converter.checkToolsAvailable();

      console.log('\n┌─────────────────────────────────────────────┐');
      console.log('│         USDZ CONVERSION TOOLS             │');
      console.log('├─────────────────────────────────────────────┤');
      console.log(`│ usdzo CLI: ${toolsAvailable.usdzo ? 'Available'.padEnd(22) : 'Not Available'.padEnd(22)}│`);
      console.log(`│ Python USD: ${toolsAvailable.python ? 'Available'.padEnd(20) : 'Not Available'.padEnd(20)}│`);
      console.log(`│ Blender: ${toolsAvailable.blender ? 'Available'.padEnd(23) : 'Not Available'.padEnd(23)}│`);
      console.log('└─────────────────────────────────────────────┘\n');

      expect(toolsAvailable).toBeDefined();
    });
  });

  describe('Thumbnail Generator', () => {
    it('should calculate thumbnail generation specs', () => {
      const generator = new ThumbnailGenerator();

      const angles: Array<{ angle: string; position: string }> = [
        { angle: 'front', position: 'x:0, y:0.5, z:3' },
        { angle: 'side', position: 'x:3, y:0.5, z:0' },
        { angle: 'isometric', position: 'x:2, y:2, z:2' },
      ];

      console.log('\n┌─────────────────────────────────────────────┐');
      console.log('│       THUMBNAIL GENERATION SPECS           │');
      console.log('├─────────────────────────────────────────────┤');

      angles.forEach(({ angle, position }) => {
        console.log(`│ ${angle.padEnd(12)}: ${position.padEnd(28)}│`);
      });

      console.log('├─────────────────────────────────────────────┤');
      console.log(`│ Default Size: 512x512                        │`);
      console.log(`│ Default Quality: 85 (JPEG)                   │`);
      console.log(`│ Default Background: #f0f0f0                 │`);
      console.log('└─────────────────────────────────────────────┘\n');
    });
  });

  describe('Quality Profiles', () => {
    it('should show quality profile recommendations', async () => {
      const document = await io.readBinary(new Uint8Array(glbBuffer));
      const root = document.getRoot();
      const meshes = root.listMeshes();
      const textures = root.listTextures();

      let vertexCount = 0;
      for (const mesh of meshes) {
        for (const primitive of mesh.listPrimitives()) {
          const position = primitive.getAttribute('POSITION');
          if (position) {
            vertexCount += position.getCount();
          }
        }
      }

      const fileSizeMB = glbBuffer.length / 1024 / 1024;

      console.log('\n┌─────────────────────────────────────────────────────────────┐');
      console.log('│                 QUALITY PROFILE RECOMMENDATIONS             │');
      console.log('├─────────────────────────────────────────────────────────────┤');

      const profiles = [
        {
          name: 'Low (Mobile)',
          vertexBudget: 50000,
          textureRes: 1024,
          useDraco: true,
          useKTX2: true,
          maxLOD: 1,
        },
        {
          name: 'Medium (Tablet)',
          vertexBudget: 150000,
          textureRes: 2048,
          useDraco: true,
          useKTX2: true,
          maxLOD: 2,
        },
        {
          name: 'High (Desktop)',
          vertexBudget: 500000,
          textureRes: 4096,
          useDraco: false,
          useKTX2: false,
          maxLOD: 2,
        },
      ];

      for (const profile of profiles) {
        const recommended = vertexCount <= profile.vertexBudget ? '✓' : '↓';
        console.log(`│ ${profile.name.padEnd(20)} │ ${recommended}  │ V: ${profile.vertexBudget.toLocaleString()}  │ T: ${profile.textureRes}px  │`);
      }

      console.log('├─────────────────────────────────────────────────────────────┤');
      console.log(`│ Current Asset: ${fileSizeMB.toFixed(2)} MB, ${vertexCount.toLocaleString()} vertices, ${textures.length} textures        │`);
      console.log('└─────────────────────────────────────────────────────────────┘\n');
    });
  });

  describe('Device Capability Detection', () => {
    it('should detect capabilities for different devices', () => {
      const ktx2 = new KTX2Processor();

      const userAgents = [
        { name: 'Chrome Desktop', ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
        { name: 'Safari iOS', ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1' },
        { name: 'Firefox Desktop', ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0' },
        { name: 'Samsung Mobile', ua: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36' },
      ];

      console.log('\n┌─────────────────────────────────────────────────────────────┐');
      console.log('│              DEVICE CAPABILITY DETECTION                   │');
      console.log('├─────────────────────────────────────────────────────────────┤');
      console.log('│ Device                 │ Browser │ KTX2 │ Basis │ GPU      │');
      console.log('├─────────────────────────────────────────────────────────────┤');

      for (const { name, ua } of userAgents) {
        const caps = ktx2.detectCapabilities(ua);
        const ktx2Support = caps.supportsKtx2 ? '✓' : '✗';
        const basisSupport = caps.supportsBasis ? '✓' : '✗';
        console.log(`│ ${name.padEnd(22)} │ ${caps.browser.padEnd(7)} │ ${ktx2Support}   │  ${basisSupport}   │ ${caps.gpu.padEnd(8)} │`);
      }

      console.log('└─────────────────────────────────────────────────────────────┘\n');
    });
  });

  describe('Compression Estimates', () => {
    it('should estimate compression ratios', async () => {
      const document = await io.readBinary(new Uint8Array(glbBuffer));
      const root = document.getRoot();
      const textures = root.listTextures();
      const meshes = root.listMeshes();

      let totalVertices = 0;
      for (const mesh of meshes) {
        for (const primitive of mesh.listPrimitives()) {
          const position = primitive.getAttribute('POSITION');
          if (position) {
            totalVertices += position.getCount();
          }
        }
      }

      const originalSize = glbBuffer.length;

      console.log('\n┌─────────────────────────────────────────────────────────────┐');
      console.log('│              COMPRESSION ESTIMATES                          │');
      console.log('├─────────────────────────────────────────────────────────────┤');

      const estimates = [
        {
          method: 'Draco Geometry',
          ratio: 0.1,
          description: '10:1 compression for mesh data',
        },
        {
          method: 'KTX2 Textures',
          ratio: 0.3,
          description: '70% reduction for textures',
        },
        {
          method: 'Combined (Draco + KTX2)',
          ratio: 0.2,
          description: 'Both optimizations applied',
        },
      ];

      console.log(`│ Original Size: ${(originalSize / 1024 / 1024).toFixed(2)} MB (${originalSize.toLocaleString()} bytes)          │`);
      console.log('├─────────────────────────────────────────────────────────────┤');

      for (const est of estimates) {
        const compressedSize = Math.floor(originalSize * est.ratio);
        const savings = originalSize - compressedSize;
        const percentSavings = ((1 - est.ratio) * 100).toFixed(1);
        console.log(`│ ${est.method.padEnd(25)} │ ${(compressedSize / 1024 / 1024).toFixed(2)} MB │ ${percentSavings}% │ ${est.description.padEnd(25)} │`);
      }

      console.log('└─────────────────────────────────────────────────────────────┘\n');
    });
  });
});
