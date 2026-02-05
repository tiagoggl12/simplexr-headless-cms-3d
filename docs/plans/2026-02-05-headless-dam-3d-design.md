# Headless DAM 3D (GLB Master) - Design

## Summary
Modular cloud headless DAM for e-commerce 3D assets using GLB as master. V0 delivers ingestion, basic processing, and delivery. V1/V2 adds render quality via material variants, lighting presets, render manifests, and viewer-optimized delivery for Three.js.

## Architecture
- **Headless API**: CRUD for Asset3D, MaterialVariant, LightingPreset, RenderPreset.
- **Storage**: Object storage for masters/derivatives with versioned paths.
- **Processing**: Queue + workers (Blender headless + glTF-Transform).
- **Delivery**: Render manifest service with CDN cache.

## Data Model
- Asset3D: master GLB, derived URLs, metrics, status/version.
- MaterialVariant: PBR maps + params, status.
- LightingPreset: HDRI + intensity/exposure.
- RenderPreset: combines variant + lighting + camera.
- RenderManifest: resolved config for viewer.

## APIs
- GET /viewer/assets/{assetId}
- GET /viewer/assets/{assetId}/render?preset={presetId}&device=mobile
- GET /viewer/presets?tag=studio

## Pipeline (GLB master)
1. Upload via presigned URL
2. Validate GLB
3. Normalize (Blender)
4. Optimize (glTF-Transform)
5. Convert USDZ
6. Thumbnails per preset/variant
7. Publish + update manifest

## V0 Scope
- CRUD Asset3D
- Presigned uploads (stubbed)
- Basic pipeline job records
- Simple delivery endpoints

## V1/V2 Scope
- MaterialVariant + LightingPreset + RenderPreset
- RenderManifest generation
- KTX2/BasisU + LODs (future)

## Testing
- Unit: manifest generation and validation
- Integration: asset ingestion API
- Smoke: viewer endpoints
