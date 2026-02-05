import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Edit3, Save, X, Loader2 } from 'lucide-react';
import { assetsApi, lightingApi } from '@/lib/api.js';
import { AssetStatus } from '@/lib/types.js';
import { Button } from '@/components/ui/Button.js';
import { Input } from '@/components/ui/Input.js';
import { Select } from '@/components/ui/Select.js';
import { Card, CardContent } from '@/components/ui/Card.js';
import { StatusBadge } from '@/components/StatusBadge.js';
import { ModelViewer } from '@/components/ModelViewer.js';
import { useToast } from '@/components/ui/Toast.js';
import { formatDate } from '@/lib/utils.js';

export function AssetDetail() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const toast = useToast();

  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState('');
  const [editedStatus, setEditedStatus] = useState<AssetStatus>('draft');
  const [selectedLightingId, setSelectedLightingId] = useState<string | undefined>();

  const { data: asset, isLoading } = useQuery({
    queryKey: ['asset', id],
    queryFn: () => assetsApi.get(id!),
    enabled: !!id,
  });

  const { data: lightingData } = useQuery({
    queryKey: ['lighting-presets'],
    queryFn: () => lightingApi.list(),
  });

  // Update form when asset data changes
  useEffect(() => {
    if (asset) {
      setEditedName(asset.name);
      setEditedStatus(asset.status);
    }
  }, [asset]);

  const updateMutation = useMutation({
    mutationFn: (updates: { name?: string; status?: AssetStatus }) =>
      assetsApi.update(id!, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['asset', id] });
      queryClient.invalidateQueries({ queryKey: ['assets'] });
      toast.addToast('Asset updated successfully', 'success');
      setIsEditing(false);
    },
    onError: (error: Error) => {
      toast.addToast(error.message, 'error');
    },
  });

  const handleSave = () => {
    if (!asset) return;
    updateMutation.mutate({
      name: editedName !== asset.name ? editedName : undefined,
      status: editedStatus !== asset.status ? editedStatus : undefined,
    });
  };

  const handleCancel = () => {
    if (asset) {
      setEditedName(asset.name);
      setEditedStatus(asset.status);
    }
    setIsEditing(false);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (!asset) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Asset not found</h2>
        <p className="text-gray-500 mb-4">The asset you're looking for doesn't exist.</p>
        <Link to="/assets">
          <Button>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Assets
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/assets">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          {isEditing ? (
            <div className="flex items-center gap-3">
              <Input
                value={editedName}
                onChange={(e) => setEditedName(e.target.value)}
                className="text-lg font-semibold"
              />
              <Select
                value={editedStatus}
                onChange={(e) => setEditedStatus(e.target.value as AssetStatus)}
              >
                <option value="draft">Draft</option>
                <option value="processing">Processing</option>
                <option value="ready">Ready</option>
                <option value="failed">Failed</option>
              </Select>
            </div>
          ) : (
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{asset.name}</h1>
              <p className="text-sm text-gray-500 mt-0.5">ID: {asset.id}</p>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          {isEditing ? (
            <>
              <Button variant="secondary" size="sm" onClick={handleCancel}>
                <X className="w-4 h-4" />
                Cancel
              </Button>
              <Button size="sm" onClick={handleSave} disabled={updateMutation.isPending}>
                {updateMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                Save
              </Button>
            </>
          ) : (
            <Button size="sm" onClick={() => setIsEditing(true)}>
              <Edit3 className="w-4 h-4" />
              Edit
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 3D Viewer */}
        <Card>
          <div className="flex items-center justify-between p-6 border-b border-gray-100">
            <h3 className="text-lg font-semibold text-gray-900">3D Preview</h3>
            {lightingData && lightingData.items && lightingData.items.length > 0 && (
              <Select
                value={selectedLightingId || ''}
                onChange={(e) => setSelectedLightingId(e.target.value || undefined)}
              >
                <option value="">Default Lighting</option>
                {lightingData.items.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.name}
                  </option>
                ))}
              </Select>
            )}
          </div>
          <CardContent>
            <ModelViewer
              glbUrl={asset.masterUrl}
              className="h-[400px]"
            />
          </CardContent>
        </Card>

        {/* Asset Details */}
        <div className="space-y-6">
          <Card>
            <div className="p-6 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900">Asset Information</h3>
            </div>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-500">Status</label>
                <div className="mt-1">
                  <StatusBadge status={asset.status} />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Master URL</label>
                <p className="mt-1 text-sm text-gray-900 break-all font-mono bg-gray-50 p-2 rounded">
                  {asset.masterUrl}
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Created</label>
                <p className="mt-1 text-sm text-gray-900">{formatDate(asset.createdAt)}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Last Updated</label>
                <p className="mt-1 text-sm text-gray-900">{formatDate(asset.updatedAt)}</p>
              </div>
            </CardContent>
          </Card>

          {/* Render Presets for this Asset */}
          <Card>
            <div className="p-6 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900">Render Presets</h3>
            </div>
            <CardContent>
              <p className="text-sm text-gray-500">
                Render presets associated with this asset will appear here.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
