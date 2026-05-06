import type { ReactNode } from 'react';
import type { PostStatus } from '../../types/database';

interface BadgeProps {
  status: PostStatus;
}

const config: Record<PostStatus, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'badge-draft' },
  scheduled: { label: 'Scheduled', className: 'badge-scheduled' },
  published: { label: 'Published', className: 'badge-published' },
  failed: { label: 'Failed', className: 'badge-failed' },
};

export function StatusBadge({ status }: BadgeProps) {
  const { label, className } = config[status];
  return <span className={className}>{label}</span>;
}

interface TagBadgeProps {
  children: ReactNode;
  onRemove?: () => void;
}

export function TagBadge({ children, onRemove }: TagBadgeProps) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary-100 text-primary-700 px-2.5 py-0.5 text-xs font-medium">
      {children}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="hover:text-primary-900 transition-colors"
          aria-label={`Remove ${children}`}
        >
          ×
        </button>
      )}
    </span>
  );
}
