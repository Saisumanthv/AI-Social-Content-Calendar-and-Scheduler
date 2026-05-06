import { Pencil as Edit2, CheckCircle2, AlertCircle, ImageOff, Trash2 } from 'lucide-react';
import { StatusBadge } from './ui/Badge';
import { Button } from './ui/Button';
import { Tooltip } from './ui/Tooltip';
import { useTriggerWebhook, useUpdatePostStatus } from '../hooks/useCalendar';
import type { ContentCalendarPost } from '../types/database';

interface Props {
  post: ContentCalendarPost;
  onEdit: (post: ContentCalendarPost) => void;
  onDelete: (post: ContentCalendarPost) => void;
  onMoveToDrafts: (post: ContentCalendarPost) => void;
  onPostScheduled?: (post: ContentCalendarPost) => void;
  onTokenError: () => void;
  onOpen?: (post: ContentCalendarPost) => void;
  remainingMonthlySlots?: number;
}

export function PostCard({ post, onEdit, onDelete, onMoveToDrafts, onPostScheduled, onTokenError, onOpen, remainingMonthlySlots }: Props) {
  const trigger = useTriggerWebhook(post.brand_id);
  const updateStatus = useUpdatePostStatus(post.brand_id);

  const canSchedule = post.status === 'draft';
  const canMoveToDraft = post.status === 'scheduled';
  const hasMedia = !!post.asset_url;
  async function handleApprove() {
    if (!hasMedia) return;
    if (typeof remainingMonthlySlots === 'number' && remainingMonthlySlots <= 0) {
      window.alert('Monthly scheduling limit reached (30). Remove or unschedule posts to free slots.');
      return;
    }
    try {
      const result = await trigger.mutateAsync({
        post_id: post.id,
        brand_id: post.brand_id,
        caption: post.caption,
        hashtags: post.hashtags,
        asset_url: post.asset_url!,
        platform: post.platform,
        scheduled_utc: post.post_date,
        hook: post.hook,
      });
      // Call success callback if provided
      if (result.success && onPostScheduled) {
        onPostScheduled(post);
      }
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes('TOKEN_EXPIRED') || msg.includes('401')) {
        onTokenError();
      } else {
        await updateStatus.mutateAsync({ postId: post.id, status: 'failed' });
      }
    }
  }

  const isPending = trigger.isPending || updateStatus.isPending;

  return (
    <div
      onClick={() => onOpen?.(post)}
      className={`bg-white rounded-lg border border-border shadow-sm hover:shadow-md transition-all duration-200 p-3 group animate-fade-in ${onOpen ? 'cursor-pointer' : ''}`}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <StatusBadge status={post.status} />
        <span className="text-xs text-muted-foreground capitalize">{post.platform}</span>
      </div>

      {/* Hook */}
      <p className="text-xs font-medium text-foreground leading-snug line-clamp-2 mb-2">
        {post.hook}
      </p>

      {/* Media indicator */}
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

      {/* Actions */}
      <div className="flex gap-1.5 pt-1">
        <button
          onClick={(e) => { e.stopPropagation(); onEdit(post); }}
          className="p-1.5 rounded text-muted-foreground hover:text-primary-600 hover:bg-primary-50 transition-colors"
          title="Edit"
        >
          <Edit2 size={13} />
        </button>

        <button
          onClick={(e) => {
            e.stopPropagation();
            if (window.confirm('Delete this post? This cannot be undone.')) {
              onDelete(post);
            }
          }}
          className="p-1.5 rounded text-muted-foreground hover:text-error-600 hover:bg-error-50 transition-colors"
          title="Delete"
        >
          <Trash2 size={13} />
        </button>

        {canSchedule && (
          hasMedia ? (
            <Button
              size="sm"
              variant="success"
              loading={isPending}
              onClick={(e) => { e.stopPropagation(); handleApprove(); }}
              className="flex-1 text-xs py-1"
              icon={<CheckCircle2 size={12} />}
            >
              Schedule
            </Button>
          ) : (
            <Tooltip content="Upload media before approving">
              <span className="flex-1">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled
                  className="w-full text-xs py-1 cursor-not-allowed"
                  icon={<AlertCircle size={12} />}
                >
                  Media Required
                </Button>
              </span>
            </Tooltip>
          )
        )}

          {canMoveToDraft && (
            <Button
              size="sm"
              variant="secondary"
              loading={isPending}
              onClick={async (e) => { e.stopPropagation(); await updateStatus.mutateAsync({ postId: post.id, status: 'draft' }); onMoveToDrafts(post); }}
              className="flex-1 text-xs py-1"
            >
              Move to Drafts
            </Button>
          )}

      </div>
    </div>
  );
}
