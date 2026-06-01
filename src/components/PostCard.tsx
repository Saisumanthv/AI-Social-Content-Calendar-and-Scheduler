import { Pencil as Edit2, CheckCircle2, RotateCcw, Trash2, ImageOff } from 'lucide-react';
import { StatusBadge } from './ui/Badge';
import { Button } from './ui/Button';
import { useDeletePost, useTriggerWebhook, useUpdatePostStatus } from '../hooks/useCalendar';
import type { ContentCalendarPost } from '../types/database';

interface Props {
  post: ContentCalendarPost;
  onEdit: (post: ContentCalendarPost) => void;
  onTokenError: () => void;
}

export function PostCard({ post, onEdit, onTokenError }: Props) {
  const trigger = useTriggerWebhook(post.brand_id);
  const updateStatus = useUpdatePostStatus(post.brand_id);
  const deletePost = useDeletePost(post.brand_id);

  const canApprove = post.status === 'draft';
  const canRetry = post.status === 'failed';
  const hasMedia = !!post.asset_url;

  async function handleApprove() {
    try {
      await trigger.mutateAsync({
        post_id: post.id,
        brand_id: post.brand_id,
        caption: post.caption,
        hashtags: post.hashtags,
        asset_url: post.asset_url,
        platform: post.platform,
        scheduled_utc: post.post_date,
        hook: post.hook,
      });
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes('TOKEN_EXPIRED') || msg.includes('401')) {
        onTokenError();
      } else {
        await updateStatus.mutateAsync({ postId: post.id, status: 'failed' });
      }
    }
  }

  async function handleRetry() {
    await handleApprove();
  }

  async function handleDelete() {
    const confirmed = window.confirm('Delete this post? This cannot be undone.');
    if (!confirmed) return;

    await deletePost.mutateAsync(post.id);
  }

  const isPending = trigger.isPending || updateStatus.isPending || deletePost.isPending;

  return (
    <div className="bg-white rounded-lg border border-border shadow-sm hover:shadow-md transition-all duration-200 p-3 group animate-fade-in">
      <div className="flex items-start justify-between gap-2 mb-2">
        <StatusBadge status={post.status} />
        <span className="text-xs text-muted-foreground capitalize">{post.platform}</span>
      </div>

      <p className="text-xs font-medium text-foreground leading-snug line-clamp-2 mb-2">
        {post.hook}
      </p>

      {!hasMedia && (
        <div className="flex items-center gap-1 text-warning-600 text-xs mb-2">
          <ImageOff size={11} />
          <span>No media</span>
        </div>
      )}
      {hasMedia && (
        <div className="rounded overflow-hidden mb-2 h-16">
          <img src={post.asset_url!} alt="" className="w-full h-full object-cover" />
        </div>
      )}

      <div className="flex items-center gap-1.5 pt-1">
        <button
          onClick={() => onEdit(post)}
          className="p-1.5 rounded text-muted-foreground hover:text-primary-600 hover:bg-primary-50 transition-colors"
          title="Edit"
        >
          <Edit2 size={13} />
        </button>

        {canApprove && (
          <Button
            size="sm"
            variant="success"
            loading={isPending}
            onClick={handleApprove}
            className="flex-1 text-xs py-1"
            icon={<CheckCircle2 size={12} />}
          >
            Schedule
          </Button>
        )}

        {canRetry && (
          <Button
            size="sm"
            variant="danger"
            loading={isPending}
            onClick={handleRetry}
            className="flex-1 text-xs py-1"
            icon={<RotateCcw size={12} />}
          >
            Retry
          </Button>
        )}

        <button
          onClick={handleDelete}
          disabled={isPending}
          className="p-1.5 rounded text-muted-foreground hover:text-error-600 hover:bg-error-50 transition-colors disabled:opacity-50 disabled:pointer-events-none"
          title="Delete"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}