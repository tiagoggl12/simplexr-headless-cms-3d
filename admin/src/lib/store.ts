import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Asset3D, LightingPreset, RenderPreset, AssetStatus } from './types.js';

interface AssetsState {
  assets: Asset3D[];
  selectedAsset: Asset3D | null;
  filters: {
    status?: AssetStatus;
    search?: string;
  };

  setAssets: (assets: Asset3D[]) => void;
  setSelectedAsset: (asset: Asset3D | null) => void;
  setFilters: (filters: Partial<AssetsState['filters']>) => void;
  clearFilters: () => void;
}

interface LightingState {
  presets: LightingPreset[];
  selectedPreset: LightingPreset | null;
  selectedTag: string | null;
  allTags: string[];

  setPresets: (presets: LightingPreset[]) => void;
  setSelectedPreset: (preset: LightingPreset | null) => void;
  setSelectedTag: (tag: string | null) => void;
}

interface RenderState {
  presets: RenderPreset[];
  selectedPreset: RenderPreset | null;

  setPresets: (presets: RenderPreset[]) => void;
  setSelectedPreset: (preset: RenderPreset | null) => void;
}

interface UIState {
  sidebarOpen: boolean;
  theme: 'light' | 'dark';

  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setTheme: (theme: 'light' | 'dark') => void;
}

// Assets Store
export const useAssetsStore = create<AssetsState>()(
  persist(
    (set) => ({
      assets: [],
      selectedAsset: null,
      filters: {},

      setAssets: (assets) => set({ assets }),
      setSelectedAsset: (asset) => set({ selectedAsset: asset }),
      setFilters: (filters) =>
        set((state) => ({ filters: { ...state.filters, ...filters } })),
      clearFilters: () => set({ filters: {} }),
    }),
    {
      name: 'assets-storage',
      partialize: (state) => ({ filters: state.filters }),
    }
  )
);

// Lighting Store
export const useLightingStore = create<LightingState>()((set) => ({
  presets: [],
  selectedPreset: null,
  selectedTag: null,
  allTags: [],

  setPresets: (presets) => {
    const allTags = Array.from(
      new Set(presets.flatMap((p) => p.tags))
    ).sort();
    set({ presets, allTags });
  },
  setSelectedPreset: (preset) => set({ selectedPreset: preset }),
  setSelectedTag: (tag) => set({ selectedTag: tag }),
}));

// Render Presets Store
export const useRenderStore = create<RenderState>()((set) => ({
  presets: [],
  selectedPreset: null,

  setPresets: (presets) => set({ presets }),
  setSelectedPreset: (preset) => set({ selectedPreset: preset }),
}));

// UI Store
export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarOpen: true,
      theme: 'light',

      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: 'ui-storage',
    }
  )
);
