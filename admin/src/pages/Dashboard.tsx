import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Box, Lightbulb, Camera, Upload, ArrowRight } from 'lucide-react';
import { assetsApi, lightingApi, renderPresetsApi } from '@/lib/api.js';
import { Card, CardContent } from '@/components/ui/Card.js';
import { Badge } from '@/components/ui/Badge.js';
import { StatusBadge } from '@/components/StatusBadge.js';
import { formatRelativeTime } from '@/lib/utils.js';

export function Dashboard() {
  const { data: assetsData } = useQuery({
    queryKey: ['assets'],
    queryFn: () => assetsApi.list(),
  });

  const { data: lightingData } = useQuery({
    queryKey: ['lighting-presets'],
    queryFn: () => lightingApi.list(),
  });

  const { data: rendersData } = useQuery({
    queryKey: ['render-presets'],
    queryFn: () => renderPresetsApi.list(),
  });

  const assets = assetsData?.items ?? [];
  const lightingPresets = lightingData?.items ?? [];
  const renderPresets = rendersData?.items ?? [];

  // Calculate stats
  const totalAssets = assets.length;
  const draftAssets = assets.filter((a) => a.status === 'draft').length;
  const readyAssets = assets.filter((a) => a.status === 'ready').length;
  const processingAssets = assets.filter((a) => a.status === 'processing').length;
  const failedAssets = assets.filter((a) => a.status === 'failed').length;

  const recentAssets = [...assets].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  ).slice(0, 5);

  const stats = [
    { label: 'Total Assets', value: totalAssets, icon: Box, color: 'text-gray-600', href: '/assets' },
    { label: 'Ready', value: readyAssets, icon: Box, color: 'text-green-600', href: '/assets?status=ready' },
    { label: 'Lighting Presets', value: lightingPresets.length, icon: Lightbulb, color: 'text-amber-600', href: '/lighting' },
    { label: 'Render Presets', value: renderPresets.length, icon: Camera, color: 'text-purple-600', href: '/renders' },
  ];

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <Link key={stat.label} to={stat.href}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">{stat.label}</p>
                    <p className="text-3xl font-bold text-gray-900 mt-1">{stat.value}</p>
                  </div>
                  <stat.icon className={`w-8 h-8 ${stat.color}`} />
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Assets */}
        <Card>
          <div className="flex items-center justify-between p-6 border-b border-gray-100">
            <h3 className="text-lg font-semibold text-gray-900">Recent Assets</h3>
            <Link
              to="/assets"
              className="text-sm text-primary hover:text-primary-dark flex items-center gap-1"
            >
              View all <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          <CardContent className="p-0">
            {recentAssets.length === 0 ? (
              <div className="p-6 text-center text-gray-500">
                No assets yet. Create your first asset to get started.
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {recentAssets.map((asset) => (
                  <li key={asset.id}>
                    <Link
                      to={`/assets/${asset.id}`}
                      className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {asset.name}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {formatRelativeTime(asset.createdAt)}
                        </p>
                      </div>
                      <StatusBadge status={asset.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <div className="p-6">
            <h3 className="text-lg font-semibold text-gray-900">Quick Actions</h3>
          </div>
          <CardContent className="p-6 space-y-4">
            <Link
              to="/uploads"
              className="flex items-center gap-4 p-4 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Upload className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="font-medium text-gray-900">Upload 3D Model</p>
                <p className="text-sm text-gray-500">Upload a new GLB file</p>
              </div>
            </Link>

            <Link
              to="/assets/new"
              className="flex items-center gap-4 p-4 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                <Box className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="font-medium text-gray-900">Create Asset</p>
                <p className="text-sm text-gray-500">Add a new 3D asset</p>
              </div>
            </Link>

            <Link
              to="/lighting/new"
              className="flex items-center gap-4 p-4 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
                <Lightbulb className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="font-medium text-gray-900">Create Lighting Preset</p>
                <p className="text-sm text-gray-500">Configure HDRI lighting</p>
              </div>
            </Link>

            <Link
              to="/renders/new"
              className="flex items-center gap-4 p-4 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                <Camera className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="font-medium text-gray-900">Create Render Preset</p>
                <p className="text-sm text-gray-500">Configure camera settings</p>
              </div>
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Status Overview */}
      {(draftAssets > 0 || processingAssets > 0 || failedAssets > 0) && (
        <Card>
          <div className="p-6">
            <h3 className="text-lg font-semibold text-gray-900">Asset Status Overview</h3>
          </div>
          <CardContent className="p-6">
            <div className="flex flex-wrap gap-4">
              {draftAssets > 0 && (
                <Link to="/assets?status=draft" className="flex items-center gap-2">
                  <Badge variant="default">{draftAssets} Draft</Badge>
                </Link>
              )}
              {processingAssets > 0 && (
                <Link to="/assets?status=processing" className="flex items-center gap-2">
                  <Badge variant="info">{processingAssets} Processing</Badge>
                </Link>
              )}
              {failedAssets > 0 && (
                <Link to="/assets?status=failed" className="flex items-center gap-2">
                  <Badge variant="danger">{failedAssets} Failed</Badge>
                </Link>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
