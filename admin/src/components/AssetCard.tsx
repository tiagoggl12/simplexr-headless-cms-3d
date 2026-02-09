import { Link } from 'react-router-dom';
import { Box, MoreVertical, Eye, Pencil, Trash2, Download } from 'lucide-react';
import { useState } from 'react';
import { Asset3D } from '@/lib/types';
import { StatusBadge } from '@/components/StatusBadge';
import { formatDate } from '@/lib/utils';

interface AssetCardProps {
  asset: Asset3D;
  thumbnailUrl?: string;
  onDelete?: (id: string) => void;
}

export function AssetCard({ asset, thumbnailUrl, onDelete }: AssetCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [imageError, setImageError] = useState(false);

  return (
    <div className="group relative bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-lg transition-all duration-200">
      {/* Thumbnail */}
      <Link to={`/assets/${asset.id}`} className="block">
        <div className="aspect-square bg-gray-100 relative overflow-hidden">
          {thumbnailUrl && !imageError ? (
            <img
              src={thumbnailUrl}
              alt={asset.name}
              className="w-full h-full object-cover"
              onError={() => setImageError(true)}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
              <Box className="w-12 h-12 text-gray-300" />
            </div>
          )}

          {/* Status overlay */}
          <div className="absolute top-2 left-2">
            <StatusBadge status={asset.status} />
          </div>

          {/* Quick actions on hover */}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
            <button className="bg-white rounded-full p-2 shadow-lg transform translate-y-2 group-hover:translate-y-0 transition-all">
              <Eye className="w-5 h-5 text-gray-600" />
            </button>
          </div>
        </div>
      </Link>

      {/* Info */}
      <div className="p-4">
        <div className="flex items-start justify-between">
          <Link to={`/assets/${asset.id}`} className="flex-1 min-w-0">
            <h3 className="font-medium text-gray-900 truncate hover:text-primary transition-colors">
              {asset.name}
            </h3>
          </Link>

          {/* Menu */}
          <div className="relative">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="p-1 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100"
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            {menuOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setMenuOpen(false)}
                />
                <div className="absolute right-0 mt-1 w-40 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20">
                  <Link
                    to={`/assets/${asset.id}`}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <Eye className="w-4 h-4" />
                    Visualizar
                  </Link>
                  <Link
                    to={`/assets/${asset.id}/edit`}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <Pencil className="w-4 h-4" />
                    Editar
                  </Link>
                  <button className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 w-full">
                    <Download className="w-4 h-4" />
                    Download
                  </button>
                  <hr className="my-1" />
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      onDelete?.(asset.id);
                    }}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 w-full"
                  >
                    <Trash2 className="w-4 h-4" />
                    Excluir
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        <p className="text-xs text-gray-500 mt-1">
          Criado em {formatDate(asset.createdAt)}
        </p>
      </div>
    </div>
  );
}
