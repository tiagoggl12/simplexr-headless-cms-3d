import { Asset3D } from '@/lib/types';
import { AssetCard } from './AssetCard';
import { Grid, List, Loader2 } from 'lucide-react';
import { useState } from 'react';

interface AssetGridProps {
  assets: Asset3D[];
  isLoading?: boolean;
  viewMode?: 'grid' | 'list';
  onViewModeChange?: (mode: 'grid' | 'list') => void;
  onDelete?: (id: string) => void;
  emptyMessage?: string;
}

export function AssetGrid({
  assets,
  isLoading,
  viewMode: controlledViewMode,
  onViewModeChange,
  onDelete,
  emptyMessage = 'Nenhum asset encontrado',
}: AssetGridProps) {
  const [localViewMode, setLocalViewMode] = useState<'grid' | 'list'>('grid');
  const viewMode = controlledViewMode ?? localViewMode;
  const setViewMode = onViewModeChange ?? setLocalViewMode;

  // Generate mock thumbnails based on asset name
  const getThumbnailUrl = (_asset: Asset3D) => {
    // In a real app, this would come from the API
    // For now, we'll use a placeholder service
    return `https://placehold.co/400x400/1a1a2e/ffffff?text=Asset`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (assets.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 mx-auto bg-gray-100 rounded-full flex items-center justify-center mb-4">
          <Grid className="w-8 h-8 text-gray-400" />
        </div>
        <p className="text-gray-500">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div>
      {/* View mode toggle */}
      <div className="flex justify-end mb-4">
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setViewMode('grid')}
            className={`p-2 rounded-md transition-colors ${
              viewMode === 'grid'
                ? 'bg-white text-primary shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
            title="Grid view"
          >
            <Grid className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`p-2 rounded-md transition-colors ${
              viewMode === 'list'
                ? 'bg-white text-primary shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
            title="List view"
          >
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      {viewMode === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {assets.map((asset) => (
            <AssetCard
              key={asset.id}
              asset={asset}
              thumbnailUrl={getThumbnailUrl(asset)}
              onDelete={onDelete}
            />
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Nome
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Criado em
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {assets.map((asset) => (
                <tr key={asset.id} className="hover:bg-gray-50">
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <img
                        src={getThumbnailUrl(asset)}
                        alt={asset.name}
                        className="w-10 h-10 rounded-lg object-cover"
                      />
                      <span className="font-medium text-gray-900">{asset.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        asset.status === 'ready'
                          ? 'bg-green-100 text-green-800'
                          : asset.status === 'processing'
                          ? 'bg-yellow-100 text-yellow-800'
                          : asset.status === 'failed'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {asset.status === 'ready'
                        ? 'Pronto'
                        : asset.status === 'processing'
                        ? 'Processando'
                        : asset.status === 'failed'
                        ? 'Erro'
                        : 'Rascunho'}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-500">
                    {new Date(asset.createdAt).toLocaleDateString('pt-BR')}
                  </td>
                  <td className="px-4 py-4 text-right">
                    <button
                      onClick={() => onDelete?.(asset.id)}
                      className="text-red-600 hover:text-red-800"
                    >
                      Excluir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
