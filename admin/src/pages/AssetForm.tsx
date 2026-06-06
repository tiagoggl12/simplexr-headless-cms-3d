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
        <Link
          to="/assets"
          aria-label="Back to assets"
          className="inline-flex items-center justify-center w-9 h-9 rounded-lg text-gray-600 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Create New Asset</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Asset Details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <Input
              label="Name"
              required
              {...register('name')}
              placeholder="My 3D Model"
              error={errors.name?.message}
            />

            <Input
              label="Master URL"
              required
              {...register('masterUrl')}
              placeholder="https://example.com/models/file.glb"
              error={errors.masterUrl?.message}
              hint="Enter the URL to the GLB file. This will be the source of truth for the asset."
            />

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
