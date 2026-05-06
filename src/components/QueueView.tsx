import { useMemo } from 'react';
import { CalendarClock } from 'lucide-react';
import { PLATFORMS } from '../lib/timezones';
import { PostCard } from './PostCard';
import type { ContentCalendarPost } from '../types/database';

interface Props {
  posts: ContentCalendarPost[];
  onEditPost: (post: ContentCalendarPost) => void;
  onDeletePost: (post: ContentCalendarPost) => void;
  onMoveToDrafts: (post: ContentCalendarPost) => void;
  onPostScheduled?: (post: ContentCalendarPost) => void;
  onTokenError: () => void;
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function QueueView({ posts, onEditPost, onDeletePost, onMoveToDrafts, onPostScheduled, onTokenError }: Props) {
  const scheduledPosts = useMemo(
    () => posts.filter((p) => p.status === 'scheduled').sort((a, b) => +new Date(a.post_date) - +new Date(b.post_date)),
    [posts],
  );

  const draftPosts = useMemo(
    () => posts.filter((p) => p.status === 'draft').sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at)),
    [posts],
  );

  const platforms = useMemo(() => {
    const preferred = PLATFORMS.map((p) => p.value);
    const present = new Set(scheduledPosts.map((p) => p.platform));
    return preferred.filter((p) => present.has(p));
  }, [scheduledPosts]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Queue</h2>
        <p className="text-sm text-muted-foreground">Review what is next for each channel and manage order from one place.</p>
      </div>

      {platforms.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">No scheduled posts in queue yet.</p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          {platforms.map((platform) => {
            const lane = scheduledPosts.filter((post) => post.platform === platform);
            const label = PLATFORMS.find((p) => p.value === platform)?.label ?? platform;

            return (
              <section key={platform} className="rounded-xl border border-border bg-card p-4">
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">{label}</h3>
                    <p className="text-xs text-muted-foreground">{lane.length} in queue</p>
                  </div>
                  {lane[0] ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-2 py-1 text-xs text-primary-700">
                      <CalendarClock size={12} />
                      Next: {formatDateTime(lane[0].post_date)}
                    </span>
                  ) : null}
                </div>

                <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
                  {lane.map((post) => (
                    <PostCard
                      key={post.id}
                      post={post}
                      onEdit={onEditPost}
                      onDelete={onDeletePost}
                      onMoveToDrafts={onMoveToDrafts}
                      onPostScheduled={onPostScheduled}
                      onTokenError={onTokenError}
                      onOpen={onEditPost}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <section className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-foreground">Draft Ideas</h3>
          <p className="text-xs text-muted-foreground">Drafts are ready to schedule and will appear in queue after approval.</p>
        </div>

        {draftPosts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No draft posts right now.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {draftPosts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                onEdit={onEditPost}
                onDelete={onDeletePost}
                onMoveToDrafts={onMoveToDrafts}
                onPostScheduled={onPostScheduled}
                onTokenError={onTokenError}
                onOpen={onEditPost}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
