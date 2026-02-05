import { AssetStatus } from '@/lib/types.js';
import { Badge } from './ui/Badge.js';

const statusConfig: Record<AssetStatus, { label: string; variant: 'default' | 'success' | 'warning' | 'danger' | 'info' }> = {
  draft: { label: 'Draft', variant: 'default' },
  processing: { label: 'Processing', variant: 'info' },
  ready: { label: 'Ready', variant: 'success' },
  failed: { label: 'Failed', variant: 'danger' },
};

interface StatusBadgeProps {
  status: AssetStatus;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status];
  return (
    <Badge variant={config.variant} className={className}>
      {config.label}
    </Badge>
  );
}
