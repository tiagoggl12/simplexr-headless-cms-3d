import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, Pencil, Trash2, Eye, Search } from 'lucide-react';
import { assetsApi } from '@/lib/api.js';
import { AssetStatus } from '@/lib/types.js';
import { Button } from '@/components/ui/Button.js';
import { Input } from '@/components/ui/Input.js';
import { Select } from '@/components/ui/Select.js';
import { Card } from '@/components/ui/Card.js';
import { StatusBadge } from '@/components/StatusBadge.js';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/Dialog.js';
import { useToast } from '@/components/ui/Toast.js';
import { formatDate } from '@/lib/utils.js';

interface DeleteDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  itemName: string;
}

function DeleteDialog({ isOpen, onClose, onConfirm, itemName }: DeleteDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent title="Delete Asset">
        <div className="space-y-4">
          <p className="text-gray-600">
            Are you sure you want to delete <strong>{itemName}</strong>? This action cannot be undone.
          </p>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm}>
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function Assets() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const statusParam = searchParams.get('status') as AssetStatus | null;

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<AssetStatus | ''>(statusParam || '');
  const [deleteDialog, setDeleteDialog] = useState<{ isOpen: boolean; asset: any }>({
    isOpen: false,
    asset: null,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['assets', statusFilter || undefined],
    queryFn: () => assetsApi.list({ status: statusFilter || undefined }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => assetsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assets'] });
      toast.addToast('Asset deleted successfully', 'success');
      setDeleteDialog({ isOpen: false, asset: null });
    },
    onError: (error: Error) => {
      toast.addToast(error.message, 'error');
    },
  });

  const assets = data?.items ?? [];

  // Filter by search term
  const filteredAssets = assets.filter((asset) =>
    asset.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex-1 max-w-md">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search assets..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
        <Link to="/assets/new">
          <Button>
            <Plus className="w-4 h-4" />
            New Asset
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <Card>
        <div className="p-4 flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Status
            </label>
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as AssetStatus | '')}
            >
              <option value="">All Statuses</option>
              <option value="draft">Draft</option>
              <option value="processing">Processing</option>
              <option value="ready">Ready</option>
              <option value="failed">Failed</option>
            </Select>
          </div>
        </div>
      </Card>

      {/* Assets Table */}
      <Card>
        {isLoading ? (
          <div className="p-8 text-center text-gray-500">Loading assets...</div>
        ) : filteredAssets.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            {search || statusFilter ? (
              <p>No assets match your filters.</p>
            ) : (
              <div>
                <p className="mb-4">No assets yet. Create your first asset to get started.</p>
                <Link to="/assets/new">
                  <Button>
                    <Plus className="w-4 h-4" />
                    Create Asset
                  </Button>
                </Link>
              </div>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredAssets.map((asset) => (
                  <tr key={asset.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <Link
                        to={`/assets/${asset.id}`}
                        className="text-sm font-medium text-primary hover:text-primary-dark"
                      >
                        {asset.name}
                      </Link>
                      <p className="text-xs text-gray-500 mt-0.5 truncate max-w-xs">
                        {asset.masterUrl}
                      </p>
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={asset.status} />
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {formatDate(asset.createdAt)}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          to={`/assets/${asset.id}`}
                          className="p-1.5 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100"
                          title="View"
                        >
                          <Eye className="w-4 h-4" />
                        </Link>
                        <Link
                          to={`/assets/${asset.id}/edit`}
                          className="p-1.5 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100"
                          title="Edit"
                        >
                          <Pencil className="w-4 h-4" />
                        </Link>
                        <button
                          onClick={() => setDeleteDialog({ isOpen: true, asset })}
                          className="p-1.5 text-gray-400 hover:text-red-600 rounded hover:bg-red-50"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Delete Dialog */}
      {deleteDialog.asset && (
        <DeleteDialog
          isOpen={deleteDialog.isOpen}
          onClose={() => setDeleteDialog({ isOpen: false, asset: null })}
          onConfirm={() => deleteMutation.mutate(deleteDialog.asset.id)}
          itemName={deleteDialog.asset.name}
        />
      )}
    </div>
  );
}
