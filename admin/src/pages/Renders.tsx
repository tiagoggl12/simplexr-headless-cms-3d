import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Camera, Loader2 } from 'lucide-react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { renderPresetsApi, assetsApi, lightingApi } from '@/lib/api.js';
import type { RenderPreset } from '@/lib/types.js';
import { Button } from '@/components/ui/Button.js';
import { Input } from '@/components/ui/Input.js';
import { Select } from '@/components/ui/Select.js';
import { Card, CardContent } from '@/components/ui/Card.js';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/Dialog.js';
import { useToast } from '@/components/ui/Toast.js';
import { formatDate } from '@/lib/utils.js';

const renderPresetSchema = z.object({
  assetId: z.string().min(1, 'Asset is required'),
  lightingPresetId: z.string().min(1, 'Lighting preset is required'),
  fov: z.number().min(10).max(120),
  positionX: z.number(),
  positionY: z.number(),
  positionZ: z.number(),
  targetX: z.number(),
  targetY: z.number(),
  targetZ: z.number(),
});

type RenderPresetFormData = z.infer<typeof renderPresetSchema>;

interface RenderFormDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

function RenderFormDialog({ isOpen, onClose }: RenderFormDialogProps) {
  const queryClient = useQueryClient();
  const toast = useToast();

  const { data: assetsData } = useQuery({
    queryKey: ['assets'],
    queryFn: () => assetsApi.list(),
  });

  const { data: lightingData } = useQuery({
    queryKey: ['lighting-presets'],
    queryFn: () => lightingApi.list(),
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<RenderPresetFormData>({
    resolver: zodResolver(renderPresetSchema),
    defaultValues: {
      fov: 45,
      positionX: 5,
      positionY: 5,
      positionZ: 5,
      targetX: 0,
      targetY: 0,
      targetZ: 0,
    },
  });

  const mutation = useMutation({
    mutationFn: (data: RenderPresetFormData) =>
      renderPresetsApi.create({
        assetId: data.assetId,
        lightingPresetId: data.lightingPresetId,
        camera: {
          fov: data.fov,
          position: [data.positionX, data.positionY, data.positionZ],
          target: [data.targetX, data.targetY, data.targetZ],
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['render-presets'] });
      toast.addToast('Render preset created successfully', 'success');
      reset();
      onClose();
    },
    onError: (error: Error) => {
      toast.addToast(error.message, 'error');
    },
  });

  const onSubmit = (data: RenderPresetFormData) => {
    mutation.mutate(data);
  };

  const assets = assetsData?.items ?? [];
  const lightingPresets = lightingData?.items ?? [];

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent title="Create Render Preset">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Asset
            </label>
            <Select
              {...register('assetId')}
              className={errors.assetId ? 'border-red-300' : ''}
            >
              <option value="">Select an asset...</option>
              {assets.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.name}
                </option>
              ))}
            </Select>
            {errors.assetId && (
              <p className="mt-1 text-sm text-red-600">{errors.assetId.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Lighting Preset
            </label>
            <Select
              {...register('lightingPresetId')}
              className={errors.lightingPresetId ? 'border-red-300' : ''}
            >
              <option value="">Select a lighting preset...</option>
              {lightingPresets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.name}
                </option>
              ))}
            </Select>
            {errors.lightingPresetId && (
              <p className="mt-1 text-sm text-red-600">{errors.lightingPresetId.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Field of View (FOV)
            </label>
            <Input
              type="number"
              min="10"
              max="120"
              {...register('fov', { valueAsNumber: true })}
              className={errors.fov ? 'border-red-300' : ''}
            />
            {errors.fov && (
              <p className="mt-1 text-sm text-red-600">{errors.fov.message}</p>
            )}
          </div>

          <div className="border-t border-gray-200 pt-4">
            <h4 className="text-sm font-medium text-gray-700 mb-3">Camera Position</h4>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">X</label>
                <Input
                  type="number"
                  step="0.1"
                  {...register('positionX', { valueAsNumber: true })}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Y</label>
                <Input
                  type="number"
                  step="0.1"
                  {...register('positionY', { valueAsNumber: true })}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Z</label>
                <Input
                  type="number"
                  step="0.1"
                  {...register('positionZ', { valueAsNumber: true })}
                />
              </div>
            </div>
          </div>

          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-3">Camera Target</h4>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">X</label>
                <Input
                  type="number"
                  step="0.1"
                  {...register('targetX', { valueAsNumber: true })}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Y</label>
                <Input
                  type="number"
                  step="0.1"
                  {...register('targetY', { valueAsNumber: true })}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Z</label>
                <Input
                  type="number"
                  step="0.1"
                  {...register('targetZ', { valueAsNumber: true })}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : null}
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function Renders() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState<{ isOpen: boolean; preset: RenderPreset | null }>({
    isOpen: false,
    preset: null,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['render-presets'],
    queryFn: () => renderPresetsApi.list(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => renderPresetsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['render-presets'] });
      toast.addToast('Render preset deleted successfully', 'success');
      setDeleteDialog({ isOpen: false, preset: null });
    },
    onError: (error: Error) => {
      toast.addToast(error.message, 'error');
    },
  });

  const presets = data?.items ?? [];

  const handleDelete = (preset: RenderPreset) => {
    setDeleteDialog({ isOpen: true, preset });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Render Presets</h1>
        <Button onClick={() => setIsDialogOpen(true)}>
          <Plus className="w-4 h-4" />
          New Preset
        </Button>
      </div>

      {/* Presets Table */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      ) : presets.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-gray-500">
            <Camera className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p className="mb-4">No render presets yet. Create your first preset to get started.</p>
            <Button onClick={() => setIsDialogOpen(true)}>
              <Plus className="w-4 h-4" />
              Create Preset
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Asset
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Lighting
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Camera
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
                {presets.map((preset) => (
                  <tr key={preset.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">
                      {preset.assetName || 'Unknown Asset'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {preset.lightingPresetName || 'Unknown Lighting'}
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-600">
                        <div>FOV: {preset.camera.fov}°</div>
                        <div className="text-xs text-gray-500">
                          Pos: [{preset.camera.position.map((n) => n.toFixed(1)).join(', ')}]
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {formatDate(preset.createdAt)}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleDelete(preset)}
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
        </Card>
      )}

      {/* Create Dialog */}
      <RenderFormDialog isOpen={isDialogOpen} onClose={() => setIsDialogOpen(false)} />

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialog.isOpen} onOpenChange={(open) => !open && setDeleteDialog({ isOpen: false, preset: null })}>
        <DialogContent title="Delete Render Preset">
          <p className="text-gray-600">
            Are you sure you want to delete this render preset? This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDeleteDialog({ isOpen: false, preset: null })}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => deleteDialog.preset && deleteMutation.mutate(deleteDialog.preset.id)}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
