import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { assetsApi } from '@/lib/api.js';
import { Button } from '@/components/ui/Button.js';
import { Input } from '@/components/ui/Input.js';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card.js';
import { useToast } from '@/components/ui/Toast.js';

const assetSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  masterUrl: z.string().min(1, 'Master URL is required'),
});

type AssetFormData = z.infer<typeof assetSchema>;

export function AssetForm() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AssetFormData>({
    resolver: zodResolver(assetSchema),
  });

  const createMutation = useMutation({
    mutationFn: (data: AssetFormData) => assetsApi.create(data),
    onSuccess: (asset) => {
      queryClient.invalidateQueries({ queryKey: ['assets'] });
      toast.addToast('Asset created successfully', 'success');
      navigate(`/assets/${asset.id}`);
    },
    onError: (error: Error) => {
      toast.addToast(error.message, 'error');
    },
  });

  const onSubmit = (data: AssetFormData) => {
    createMutation.mutate(data);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to="/assets">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Create New Asset</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Asset Details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Name
              </label>
              <Input
                {...register('name')}
                placeholder="My 3D Model"
                className={errors.name ? 'border-red-300' : ''}
              />
              {errors.name && (
                <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Master URL
              </label>
              <Input
                {...register('masterUrl')}
                placeholder="https://example.com/models/file.glb"
                className={errors.masterUrl ? 'border-red-300' : ''}
              />
              {errors.masterUrl && (
                <p className="mt-1 text-sm text-red-600">{errors.masterUrl.message}</p>
              )}
              <p className="mt-1 text-xs text-gray-500">
                Enter the URL to the GLB file. This will be the source of truth for the asset.
              </p>
            </div>

            <div className="flex items-center gap-3 pt-4">
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : null}
                Create Asset
              </Button>
              <Link to="/assets">
                <Button type="button" variant="secondary">
                  Cancel
                </Button>
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
