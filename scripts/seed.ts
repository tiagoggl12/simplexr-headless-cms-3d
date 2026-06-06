#!/usr/bin/env tsx
/**
 * Seed script — populates a running SimpleXR API with sample data for the team:
 * 3D assets, lighting presets, and render presets.
 *
 * Idempotent: assets and lighting presets are matched by name, and render
 * presets by (asset + lighting preset), so re-running never creates
 * duplicates. Each sample's GLB is copied into `public/` so the backend's
 * static server can serve it at `<API_BASE>/<file>`.
 *
 * Usage:
 *   npm run seed                 # seeds against http://localhost:3000
 *   API_BASE=http://host:3000 npm run seed
 *
 * The dev store is in-memory, so re-run this after restarting the backend.
 *
 * NOTE: HDRI URLs are placeholders pointing at the team's intended CDN path.
 * Replace HDRI_BASE / the files there with real .hdr assets when available.
 */

import fs from 'node:fs';
import path from 'node:path';

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, '..');
const PUBLIC_DIR = path.join(PROJECT_ROOT, 'public');

const API_BASE = process.env.API_BASE ?? 'http://localhost:3000';
const HDRI_BASE = process.env.HDRI_BASE ?? 'https://cdn.simplexr.local/hdri';

type AssetStatus = 'draft' | 'processing' | 'ready' | 'failed';
type Vec3 = [number, number, number];

interface Sample {
  name: string;
  /** GLB source relative to the project root. Copied into public/ to be served. */
  glb: string;
  status: AssetStatus;
}

interface LightingSpec {
  name: string;
  hdri: string; // file name under HDRI_BASE
  exposure: number;
  intensity: number;
  tags: string[];
}

interface RenderSpec {
  /** Label used only for logging (RenderPreset has no name field). */
  label: string;
  assetName: string;
  lightingName: string;
  camera: { fov: number; position: Vec3; target: Vec3 };
}

const SAMPLES: Sample[] = [
  { name: 'Poltrona Guadalupe', glb: 'tests/fixtures/poltrona-guadalupe.glb', status: 'ready' },
];

const LIGHTING_PRESETS: LightingSpec[] = [
  { name: 'Studio Softbox',    hdri: 'studio-softbox.hdr',    exposure: 1.0, intensity: 1.2, tags: ['studio', 'product', 'neutral'] },
  { name: 'Warm Showroom',     hdri: 'warm-showroom.hdr',     exposure: 1.1, intensity: 1.0, tags: ['warm', 'showroom', 'interior'] },
  { name: 'Outdoor Daylight',  hdri: 'outdoor-daylight.hdr',  exposure: 1.3, intensity: 1.5, tags: ['outdoor', 'daylight', 'bright'] },
  { name: 'Dramatic Spotlight', hdri: 'dramatic-spotlight.hdr', exposure: 0.8, intensity: 2.0, tags: ['dramatic', 'spotlight', 'contrast'] },
  { name: 'Soft Ambient',      hdri: 'soft-ambient.hdr',      exposure: 1.0, intensity: 0.8, tags: ['ambient', 'soft', 'catalog'] },
];

const RENDER_PRESETS: RenderSpec[] = [
  { label: 'Hero 3/4',        assetName: 'Poltrona Guadalupe', lightingName: 'Warm Showroom',  camera: { fov: 45, position: [4, 2.5, 5], target: [0, 0.6, 0] } },
  { label: 'Front Elevation', assetName: 'Poltrona Guadalupe', lightingName: 'Studio Softbox', camera: { fov: 35, position: [0, 1.2, 6], target: [0, 0.6, 0] } },
  { label: 'Top-Down',        assetName: 'Poltrona Guadalupe', lightingName: 'Soft Ambient',   camera: { fov: 50, position: [0.01, 8, 0.01], target: [0, 0, 0] } },
];

// ─── API helpers ───────────────────────────────────────────────────────────

async function apiGet<T>(p: string): Promise<T> {
  const res = await fetch(`${API_BASE}${p}`);
  if (!res.ok) throw new Error(`GET ${p} failed: ${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

async function apiPost<T>(p: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${p}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${p} failed: ${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

async function setStatus(id: string, status: AssetStatus): Promise<void> {
  const res = await fetch(`${API_BASE}/assets/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error(`PATCH /assets/${id} failed: ${res.status} ${await res.text()}`);
}

function ensureServableGlb(glbRelPath: string): string {
  const src = path.join(PROJECT_ROOT, glbRelPath);
  if (!fs.existsSync(src)) throw new Error(`GLB not found: ${src}`);
  const fileName = path.basename(src);
  const dest = path.join(PUBLIC_DIR, fileName);
  if (!fs.existsSync(dest) || fs.statSync(dest).size !== fs.statSync(src).size) {
    fs.mkdirSync(PUBLIC_DIR, { recursive: true });
    fs.copyFileSync(src, dest);
    console.log(`  copied ${glbRelPath} -> public/${fileName}`);
  }
  return `${API_BASE}/${fileName}`;
}

// ─── Seeders (each returns a name→id map for cross-referencing) ──────────────

async function seedAssets(): Promise<Map<string, string>> {
  const { items } = await apiGet<{ items: Array<{ id: string; name: string }> }>('/assets?limit=1000');
  const byName = new Map(items.map((a) => [a.name, a.id]));

  for (const s of SAMPLES) {
    if (byName.has(s.name)) {
      console.log(`• asset "${s.name}" exists — skipping`);
      continue;
    }
    const masterUrl = ensureServableGlb(s.glb);
    const asset = await apiPost<{ id: string }>('/assets', { name: s.name, masterUrl });
    if (s.status !== 'draft') await setStatus(asset.id, s.status);
    byName.set(s.name, asset.id);
    console.log(`✓ asset "${s.name}" (${asset.id}) [${s.status}]`);
  }
  return byName;
}

async function seedLighting(): Promise<Map<string, string>> {
  const { items } = await apiGet<{ items: Array<{ id: string; name: string }> }>('/presets/lighting');
  const byName = new Map(items.map((p) => [p.name, p.id]));

  for (const l of LIGHTING_PRESETS) {
    if (byName.has(l.name)) {
      console.log(`• lighting "${l.name}" exists — skipping`);
      continue;
    }
    const preset = await apiPost<{ id: string }>('/presets/lighting', {
      name: l.name,
      hdriUrl: `${HDRI_BASE}/${l.hdri}`,
      exposure: l.exposure,
      intensity: l.intensity,
      tags: l.tags,
    });
    byName.set(l.name, preset.id);
    console.log(`✓ lighting "${l.name}" (${preset.id})`);
  }
  return byName;
}

async function seedRenders(assets: Map<string, string>, lighting: Map<string, string>): Promise<void> {
  for (const r of RENDER_PRESETS) {
    const assetId = assets.get(r.assetName);
    const lightingPresetId = lighting.get(r.lightingName);
    if (!assetId) {
      console.warn(`! render "${r.label}" skipped — asset "${r.assetName}" not seeded`);
      continue;
    }
    if (!lightingPresetId) {
      console.warn(`! render "${r.label}" skipped — lighting "${r.lightingName}" not seeded`);
      continue;
    }

    // Idempotent: skip if a render preset already pairs this asset + lighting.
    const { items } = await apiGet<{ items: Array<{ lightingPresetId: string }> }>(
      `/presets/render?assetId=${assetId}`
    );
    if (items.some((p) => p.lightingPresetId === lightingPresetId)) {
      console.log(`• render "${r.label}" exists — skipping`);
      continue;
    }

    const preset = await apiPost<{ id: string }>('/presets/render', {
      assetId,
      lightingPresetId,
      camera: r.camera,
    });
    console.log(`✓ render "${r.label}" (${preset.id}) -> ${r.assetName} + ${r.lightingName}`);
  }
}

async function main(): Promise<void> {
  try {
    const health = await fetch(`${API_BASE}/health`);
    if (!health.ok) throw new Error(String(health.status));
  } catch {
    console.error(`✗ API not reachable at ${API_BASE} — start it with "npm run dev".`);
    process.exit(1);
  }

  console.log(`Seeding sample data into ${API_BASE}`);
  const assets = await seedAssets();
  const lighting = await seedLighting();
  await seedRenders(assets, lighting);
  console.log('Done.');
}

main().catch((err) => {
  console.error('Seed failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
