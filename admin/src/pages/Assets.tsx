import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Plus, Grid, List, Trash2 } from 'lucide-react';
import { assetsApi } from '@/lib/api/endpoints.js';
import { AssetStatus, Asset3D } from '@/lib/types.js';
import { Button, Card, Dialog, DialogContent, DialogFooter, Pagination, PaginationInfo, Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from '@/components/ui/index.js';
import { FilterBar, PageHeader } from '@/components/common/index.js';
import { EmptyStateNoAssets, Spinner } from '@/components/feedback/index.js';
import { useToast } from '@/components/ui/Toast.js';
import { useDebounce } from '@/hooks/index.js';
import { formatDate } from '@/lib/utils.js';
import { cn } from '@/lib/utils.js';

const ITEMS_PER_PAGE = 12;
const STATUS_OPTIONS = [
  { value: 'draft', label: 'Rascunho' },
  { value: 'processing', label: 'Processando' },
  { value: 'ready', label: 'Pronto' },
  { value: 'failed', label: 'Falhou' },
];

export function Assets() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();

  // Filter states
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [currentPage, setCurrentPage] = useState(1);

  // Delete dialog state
  const [deleteDialog, setDeleteDialog] = useState<{
    isOpen: boolean;
    assetId: string;
    assetName: string;
  }>({
    isOpen: false,
    assetId: '',
    assetName: '',
  });

  // Debounce search
  const debouncedSearch = useDebounce(search, 300);

  // Fetch assets
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['assets', statusFilter || undefined, debouncedSearch, currentPage],
    queryFn: () =>
      assetsApi.list({
        status: (statusFilter as AssetStatus) || undefined,
        limit: ITEMS_PER_PAGE,
        offset: (currentPage - 1) * ITEMS_PER_PAGE,
      }),
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => assetsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assets'] });
      toast.addToast('Asset excluído com sucesso', 'success');
      setDeleteDialog({ isOpen: false, assetId: '', assetName: '' });
    },
    onError: (error: Error) => {
      toast.addToast(error.message, 'error');
    },
  });

  const assets: Asset3D[] = data?.items ?? [];
  const totalItems = data?.total ?? 0;
  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);

  // Filter by search term locally for grid view
  const filteredAssets = assets.filter((asset) =>
    asset.name.toLowerCase().includes(debouncedSearch.toLowerCase())
  );

  const handleDeleteClick = (asset: Asset3D) => {
    setDeleteDialog({ isOpen: true, assetId: asset.id, assetName: asset.name });
  };

  const handleDeleteConfirm = () => {
    deleteMutation.mutate(deleteDialog.assetId);
  };

  const clearFilters = () => {
    setSearch('');
    setStatusFilter('');
    setCurrentPage(1);
  };

  const hasActiveFilters = search || statusFilter;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title="Assets 3D"
        description="Gerencie seus modelos 3D na biblioteca"
        actions={
          <Link to="/uploads">
            <Button>
              <Plus className="w-4 h-4" />
              Novo Asset
            </Button>
          </Link>
        }
      />

      {/* Filter Bar */}
      <Card className="p-4">
        <FilterBar
          searchValue={search}
          onSearchChange={(value) => {
            setSearch(value);
            setCurrentPage(1);
          }}
          filters={[
            {
              label: 'Status',
              value: 'status',
              options: STATUS_OPTIONS,
              onChange: (value) => {
                setStatusFilter(value || '');
                setCurrentPage(1);
              },
            },
          ]}
          activeFilters={{ status: statusFilter }}
          onClearFilters={hasActiveFilters ? clearFilters : undefined}
          actions={
            <div className="flex items-center gap-2">
              <button
                onClick={() => setViewMode('grid')}
                className={cn(
                  'p-2 rounded-lg transition-colors',
                  viewMode === 'grid'
                    ? 'bg-primary text-white'
                    : 'text-gray-500 hover:bg-gray-100'
                )}
                aria-label="Visualização em grid"
              >
                <Grid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={cn(
                  'p-2 rounded-lg transition-colors',
                  viewMode === 'list'
                    ? 'bg-primary text-white'
                    : 'text-gray-500 hover:bg-gray-100'
                )}
                aria-label="Visualização em lista"
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          }
        />
      </Card>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Spinner size="lg" />
        </div>
      ) : isError ? (
        <Card className="p-8 text-center">
          <p className="text-gray-500 mb-4">Erro ao carregar assets</p>
          <Button variant="secondary" onClick={() => refetch()}>
            Tentar novamente
          </Button>
        </Card>
      ) : totalItems === 0 ? (
        <EmptyStateNoAssets onCreate={() => navigate('/uploads')} />
      ) : viewMode === 'grid' ? (
        <>
          {/* Grid View */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredAssets.map((asset) => (
              <AssetCard
                key={asset.id}
                asset={asset}
                onDelete={() => handleDeleteClick(asset)}
              />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4">
              <PaginationInfo
                currentPage={currentPage}
                pageSize={ITEMS_PER_PAGE}
                totalItems={totalItems}
              />
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
              />
            </div>
          )}
        </>
      ) : (
        /* List View */
        <Card>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Asset</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell>Criado em</TableHeaderCell>
                <TableHeaderCell>Atualizado em</TableHeaderCell>
                <TableHeaderCell className="w-20">Ações</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredAssets.map((asset) => (
                <TableRow key={asset.id}>
                  <TableCell>
                    <Link
                      to={`/assets/${asset.id}`}
                      className="font-medium text-gray-900 hover:text-primary"
                    >
                      {asset.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={asset.status} />
                  </TableCell>
                  <TableCell>{formatDate(asset.createdAt)}</TableCell>
                  <TableCell>{formatDate(asset.updatedAt)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleDeleteClick(asset)}
                        className="p-1.5 text-gray-400 hover:text-red-600 rounded hover:bg-red-50"
                        title={`Excluir ${asset.name}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between p-4 border-t border-gray-200">
              <PaginationInfo
                currentPage={currentPage}
                pageSize={ITEMS_PER_PAGE}
                totalItems={totalItems}
              />
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
              />
            </div>
          )}
        </Card>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialog.isOpen}
        onOpenChange={(open) => !open && setDeleteDialog({ isOpen: false, assetId: '', assetName: '' })}
      >
        <DialogContent title="Excluir Asset">
          <p className="text-gray-600">
            Tem certeza que deseja excluir <strong>{deleteDialog.assetName}</strong>?
            Esta ação não pode ser desfeita.
          </p>
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => setDeleteDialog({ isOpen: false, assetId: '', assetName: '' })}
            >
              Cancelar
            </Button>
            <Button
              variant="danger"
              onClick={handleDeleteConfirm}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Excluindo...' : 'Excluir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Asset Card Component for Grid View
interface AssetCardProps {
  asset: Asset3D;
  onDelete: (id: string) => void;
}

function AssetCard({ asset, onDelete }: AssetCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [imageError, setImageError] = useState(false);

  return (
    <div className="group relative bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-lg transition-all duration-200">
      {/* Thumbnail */}
      <Link to={`/assets/${asset.id}`} className="block">
        <div className="aspect-square bg-gray-100 relative overflow-hidden">
          {asset.thumbnailUrl && !imageError ? (
            <img
              src={asset.thumbnailUrl}
              alt={asset.name}
              className="w-full h-full object-cover"
              onError={() => setImageError(true)}
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
              <svg
                className="w-12 h-12 text-gray-300"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1}
                  d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                />
              </svg>
            </div>
          )}

          {/* Status overlay */}
          <div className="absolute top-2 left-2">
            <StatusBadge status={asset.status} />
          </div>

          {/* Quick actions on hover */}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
            <button
              className="bg-white rounded-full p-2 shadow-lg transform translate-y-2 group-hover:translate-y-0 transition-all"
              title="Visualizar"
            >
              <svg
                className="w-5 h-5 text-gray-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                />
              </svg>
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
              title="Opções"
              aria-haspopup="menu"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
                />
              </svg>
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
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                      />
                    </svg>
                    Visualizar
                  </Link>
                  <Link
                    to={`/assets/${asset.id}/edit`}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                      />
                    </svg>
                    Editar
                  </Link>
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      onDelete(asset.id);
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
          {formatDate(asset.createdAt)}
        </p>
      </div>
    </div>
  );
}

// Status Badge Component
function StatusBadge({ status }: { status: AssetStatus }) {
  const statusConfig: Record<AssetStatus, { label: string; className: string }> = {
    draft: { label: 'Rascunho', className: 'bg-gray-100 text-gray-700' },
    processing: { label: 'Processando', className: 'bg-blue-100 text-blue-700' },
    ready: { label: 'Pronto', className: 'bg-green-100 text-green-700' },
    failed: { label: 'Falhou', className: 'bg-red-100 text-red-700' },
  };

  const config = statusConfig[status] || statusConfig.draft;

  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium',
        config.className
      )}
    >
      {config.label}
    </span>
  );
}
