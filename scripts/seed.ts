#!/usr/bin/env tsx
/**
 * Seed script — populates a running SimpleXR API with sample 3D assets.
 *
 * Idempotent: assets are matched by name, so re-running won't create
 * duplicates. Each sample's GLB is copied into `public/` so the backend's
 * static server can serve it at `<API_BASE>/<file>`.
 *
 * Usage:
 *   npm run seed                 # seeds against http://localhost:3000
 *   API_BASE=http://host:3000 npm run seed
 *
 * The dev store is in-memory, so re-run this after restarting the backend.
 */

import fs from 'node:fs';
import path from 'node:path';

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, '..');
const PUBLIC_DIR = path.join(PROJECT_ROOT, 'public');

const API_BASE = process.env.API_BASE ?? 'http://localhost:3000';

type AssetStatus = 'draft' | 'processing' | 'ready' | 'failed';

interface Sample {
  name: string;
  /** GLB source relative to the project root. Copied into public/ to be served. */
  glb: string;
  status: AssetStatus;
}

const SAMPLES: Sample[] = [
  {
    name: 'Poltrona Guadalupe',
    glb: 'tests/fixtures/poltrona-guadalupe.glb',
    status: 'ready',
  },
];

async function apiAssets(): Promise<{ items: Array<{ id: string; name: string }> }> {
  const res = await fetch(`${API_BASE}/assets?limit=1000`);
  if (!res.ok) throw new Error(`GET /assets failed: ${res.status} ${res.statusText}`);
  return res.json() as Promise<{ items: Array<{ id: string; name: string }> }>;
}

async function createAsset(name: string, masterUrl: string): Promise<{ id: string }> {
  const res = await fetch(`${API_BASE}/assets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, masterUrl }),
  });
  if (!res.ok) throw new Error(`POST /assets failed: ${res.status} ${await res.text()}`);
  return res.json() as Promise<{ id: string }>;
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
  if (!fs.existsSync(src)) {
    throw new Error(`GLB not found: ${src}`);
  }
  const fileName = path.basename(src);
  const dest = path.join(PUBLIC_DIR, fileName);
  if (!fs.existsSync(dest) || fs.statSync(dest).size !== fs.statSync(src).size) {
    fs.mkdirSync(PUBLIC_DIR, { recursive: true });
    fs.copyFileSync(src, dest);
    console.log(`  copied ${glbRelPath} -> public/${fileName}`);
  }
  return `${API_BASE}/${fileName}`;
}

async function main(): Promise<void> {
  // Fail fast if the API isn't up.
  try {
    const health = await fetch(`${API_BASE}/health`);
    if (!health.ok) throw new Error(String(health.status));
  } catch (err) {
    console.error(`✗ API not reachable at ${API_BASE} — start it with "npm run dev".`);
    process.exit(1);
  }

  console.log(`Seeding ${SAMPLES.length} sample asset(s) into ${API_BASE}`);
  const existing = await apiAssets();
  const byName = new Map(existing.items.map((a) => [a.name, a.id]));

  for (const sample of SAMPLES) {
    if (byName.has(sample.name)) {
      console.log(`• "${sample.name}" already exists (${byName.get(sample.name)}) — skipping`);
      continue;
    }
    const masterUrl = ensureServableGlb(sample.glb);
    const asset = await createAsset(sample.name, masterUrl);
    if (sample.status !== 'draft') await setStatus(asset.id, sample.status);
    console.log(`✓ created "${sample.name}" (${asset.id}) [${sample.status}] -> ${masterUrl}`);
  }

  console.log('Done.');
}

main().catch((err) => {
  console.error('Seed failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
