import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Plus, Pencil, Trash2, Tag as TagIcon, Loader2 } from 'lucide-react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { lightingApi } from '@/lib/api.js';
import type { LightingPreset } from '@/lib/types.js';
import { Button } from '@/components/ui/Button.js';
import { Input } from '@/components/ui/Input.js';
import { Card, CardContent } from '@/components/ui/Card.js';
import { Badge } from '@/components/ui/Badge.js';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/Dialog.js';
import { useToast } from '@/components/ui/Toast.js';
import { formatDate } from '@/lib/utils.js';
import { useLightingStore } from '@/lib/store.js';

const lightingSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  hdriUrl: z.string().min(1, 'HDRI URL is required'),
  exposure: z.number().min(0).max(10),
  intensity: z.number().min(0).max(10),
  tags: z.string().optional(),
});

type LightingFormData = z.infer<typeof lightingSchema>;

interface LightingFormDialogProps {
  isOpen: boolean;
  onClose: () => void;
  preset?: LightingPreset;
}

function LightingFormDialog({ isOpen, onClose, preset }: LightingFormDialogProps) {
  const queryClient = useQueryClient();
  const toast = useToast();

  const isEditing = !!preset;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<LightingFormData>({
    resolver: zodResolver(lightingSchema),
    defaultValues: preset ? {
      name: preset.name,
      hdriUrl: preset.hdriUrl,
      exposure: preset.exposure,
      intensity: preset.intensity,
      tags: preset.tags.join(', '),
    } : {
      exposure: 1,
      intensity: 1,
    },
  });

  const mutation = useMutation({
    mutationFn: (data: Omit<LightingFormData, 'tags'> & { tags?: string[] }) =>
      isEditing
        ? lightingApi.update(preset!.id, data)
        : lightingApi.create({
            name: data.name,
            hdriUrl: data.hdriUrl,
            exposure: data.exposure,
            intensity: data.intensity,
            tags: data.tags ?? [],
          }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lighting-presets'] });
      toast.addToast(isEditing ? 'Preset updated successfully' : 'Preset created successfully', 'success');
      reset();
      onClose();
    },
    onError: (error: Error) => {
      toast.addToast(error.message, 'error');
    },
  });

  const onSubmit = (data: LightingFormData) => {
    const tags = data.tags
      ? data.tags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean)
      : [];
    mutation.mutate({ ...data, tags });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent title={isEditing ? 'Edit Lighting Preset' : 'Create Lighting Preset'}>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Name
            </label>
            <Input
              {...register('name')}
              placeholder="Studio Lighting"
              className={errors.name ? 'border-red-300' : ''}
            />
            {errors.name && (
              <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              HDRI URL
            </label>
            <Input
              {...register('hdriUrl')}
              placeholder="https://example.com/hdri/studio.hdr"
              className={errors.hdriUrl ? 'border-red-300' : ''}
            />
            {errors.hdriUrl && (
              <p className="mt-1 text-sm text-red-600">{errors.hdriUrl.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Exposure
              </label>
              <Input
                type="number"
                step="0.1"
                min="0"
                max="10"
                {...register('exposure', { valueAsNumber: true })}
                className={errors.exposure ? 'border-red-300' : ''}
              />
              {errors.exposure && (
                <p className="mt-1 text-sm text-red-600">{errors.exposure.message}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Intensity
              </label>
              <Input
                type="number"
                step="0.1"
                min="0"
                max="10"
                {...register('intensity', { valueAsNumber: true })}
                className={errors.intensity ? 'border-red-300' : ''}
              />
              {errors.intensity && (
                <p className="mt-1 text-sm text-red-600">{errors.intensity.message}</p>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Tags (comma-separated)
            </label>
            <Input
              {...register('tags')}
              placeholder="studio, interior, product"
            />
            <p className="mt-1 text-xs text-gray-500">
              Add tags to categorize this preset (e.g., studio, outdoor, product)
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : null}
              {isEditing ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function Lighting() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPreset, setEditingPreset] = useState<LightingPreset | undefined>();
  const [deleteDialog, setDeleteDialog] = useState<{ isOpen: boolean; preset: LightingPreset | null }>({
    isOpen: false,
    preset: null,
  });

  const selectedTag = useLightingStore((state) => state.selectedTag);
  const setSelectedTag = useLightingStore((state) => state.setSelectedTag);
  const setPresets = useLightingStore((state) => state.setPresets);

  const { data, isLoading } = useQuery({
    queryKey: ['lighting-presets', selectedTag],
    queryFn: () => lightingApi.list(selectedTag ?? undefined),
  });

  // Update store when data changes
  useEffect(() => {
    if (data?.items) {
      setPresets(data.items);
    }
  }, [data, setPresets]);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => lightingApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lighting-presets'] });
      toast.addToast('Preset deleted successfully', 'success');
      setDeleteDialog({ isOpen: false, preset: null });
    },
    onError: (error: Error) => {
      toast.addToast(error.message, 'error');
    },
  });

  const presets = data?.items ?? [];
  const allTags = useLightingStore((state) => state.allTags);

  const handleCreate = () => {
    setEditingPreset(undefined);
    setIsDialogOpen(true);
  };

  const handleEdit = (preset: LightingPreset) => {
    setEditingPreset(preset);
    setIsDialogOpen(true);
  };

  const handleDelete = (preset: LightingPreset) => {
    setDeleteDialog({ isOpen: true, preset });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Lighting Presets</h1>
        <Button onClick={handleCreate}>
          <Plus className="w-4 h-4" />
          New Preset
        </Button>
      </div>

      {/* Tag Filter */}
      {allTags.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 flex-wrap">
              <TagIcon className="w-4 h-4 text-gray-400" />
              <button
                onClick={() => setSelectedTag(null)}
                className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                  selectedTag === null
                    ? 'bg-primary text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                All
              </button>
              {allTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => setSelectedTag(tag)}
                  className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                    selectedTag === tag
                      ? 'bg-primary text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Presets Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      ) : presets.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-gray-500">
            <TagIcon className="w-12 h-12 mx-auto mb-4 opacity-50" />
            {selectedTag ? (
              <>
                <p>No lighting presets with the tag "{selectedTag}".</p>
                <button
                  onClick={() => setSelectedTag(null)}
                  className="text-primary hover:text-primary-dark mt-2"
                >
                  Clear filter
                </button>
              </>
            ) : (
              <>
                <p className="mb-4">No lighting presets yet. Create your first preset to get started.</p>
                <Button onClick={handleCreate}>
                  <Plus className="w-4 h-4" />
                  Create Preset
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {presets.map((preset) => (
            <Card key={preset.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 truncate">{preset.name}</h3>
                    <p className="text-xs text-gray-500 mt-0.5">{formatDate(preset.createdAt)}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleEdit(preset)}
                      className="p-1.5 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(preset)}
                      className="p-1.5 text-gray-400 hover:text-red-600 rounded hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Exposure</span>
                    <span className="font-medium">{preset.exposure}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Intensity</span>
                    <span className="font-medium">{preset.intensity}</span>
                  </div>
                </div>

                {preset.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-4">
                    {preset.tags.map((tag) => (
                      <Link
                        key={tag}
                        to="#"
                        onClick={(e) => {
                          e.preventDefault();
                          setSelectedTag(tag);
                        }}
                      >
                        <Badge variant="default" className="text-xs">
                          {tag}
                        </Badge>
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <LightingFormDialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        preset={editingPreset}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialog.isOpen} onOpenChange={(open) => !open && setDeleteDialog({ isOpen: false, preset: null })}>
        <DialogContent title="Delete Lighting Preset">
          <p className="text-gray-600">
            Are you sure you want to delete <strong>{deleteDialog.preset?.name}</strong>? This action cannot be undone.
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
