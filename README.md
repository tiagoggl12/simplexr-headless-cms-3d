# SimpleXR Headless CMS 3D

Headless DAM for 3D assets (GLB master) focused on e-commerce delivery. Includes ingestion, processing job records, and viewer delivery endpoints with render manifests.

## Quick start

```bash
npm install
npm run dev
```

## Local services

```bash
docker compose -f docker/docker-compose.yml up
```

## Endpoints (V0)

- `POST /assets` create Asset3D
- `GET /assets/:id` get Asset3D
- `GET /viewer/assets/:assetId` delivery asset info
- `GET /viewer/assets/:assetId/render?preset=:presetId&device=mobile` render manifest
- `GET /viewer/presets?tag=studio` list lighting presets

## Notes
- GLB is the master. USDZ and thumbnails are derived artifacts.
- Storage and queue adapters are stubbed for V0.
