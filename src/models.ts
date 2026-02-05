export type AssetStatus = 'draft' | 'processing' | 'ready' | 'failed';

export interface Asset3D {
  id: string;
  name: string;
  masterUrl: string;
  status: AssetStatus;
  createdAt: string;
  updatedAt: string;
}

export interface LightingPreset {
  id: string;
  name: string;
  hdriUrl: string;
  exposure: number;
  intensity: number;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface RenderPreset {
  id: string;
  assetId: string;
  lightingPresetId: string;
  camera: {
    fov: number;
    position: [number, number, number];
    target: [number, number, number];
  };
  createdAt: string;
  updatedAt: string;
}

export interface RenderManifest {
  version: string;
  asset: {
    id: string;
    masterUrl: string;
  };
  lighting: LightingPreset;
  camera: RenderPreset['camera'];
  qualityProfile: 'desktop' | 'mobile';
}
