import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Settings, LogOut, CalendarDays, AlertCircle, CheckCircle2, X, RefreshCw, Link2, ArrowLeft } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useBrandProfile } from '../hooks/useBrandProfile';
import { useCalendarPosts, useDeletePost } from '../hooks/useCalendar';
import { CalendarGrid } from './CalendarGrid';
import { QueueView } from './QueueView';
import { ConnectionsPanel } from './ConnectionsPanel';
import { GeneratePanel } from './GeneratePanel';
import { PostCard } from './PostCard';
import { PostEditModal } from './PostEditModal';
import { BrandOnboarding } from './BrandOnboarding';
import { CalendarSkeleton } from './ui/Skeleton';
import { Button } from './ui/Button';
import { Tooltip } from './ui/Tooltip';
import type { ContentCalendarPost } from '../types/database';

export function Dashboard() {
  const queryClient = useQueryClient();
  const { signOut } = useAuth();
  const { data: brand, isLoading: brandLoading } = useBrandProfile();
  const { data: posts = [], isLoading: postsLoading } = useCalendarPosts(brand?.id);
  const deletePost = useDeletePost(brand?.id);

  const [editingPost, setEditingPost] = useState<ContentCalendarPost | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showConnections, setShowConnections] = useState(false);
  const [activeView, setActiveView] = useState<'queue' | 'calendar' | 'published' | 'failed'>('queue');
  const [tokenError, setTokenError] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleSignOut() {
    setSigningOut(true);
    try { await signOut(); } finally { setSigningOut(false); }
  }

  function showNotice(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 2500);
  }

  // Poll calendar data only. Publishing transitions should happen server-side via scheduler.
  useEffect(() => {
    const refreshCalendar = async () => {
      if (!brand?.id) return;
      await queryClient.invalidateQueries({ queryKey: ['calendar', brand.id] });
    };

    void refreshCalendar();
    const intervalId = window.setInterval(() => {
      void refreshCalendar();
    }, 60_000);
    return () => window.clearInterval(intervalId);
  }, [brand?.id, queryClient]);

  if (brandLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <RefreshCw size={24} className="animate-spin" />
          <p className="text-sm">Loading workspace...</p>
        </div>
      </div>
    );
  }

  if (!brand) {
    return <BrandOnboarding onComplete={() => {}} />;
  }

  if (showSettings) {
    return (
      <BrandOnboarding
        existingProfile={brand}
        onComplete={() => setShowSettings(false)}
      />
    );
  }

  const draftCount = posts.filter(p => p.status === 'draft').length;
  const scheduledCount = posts.filter(p => p.status === 'scheduled').length;
  const publishedCount = posts.filter(p => p.status === 'published').length;
  const failedCount = posts.filter(p => p.status === 'failed').length;
  const publishedPosts = posts.filter((p) => p.status === 'published');
  const failedPosts = posts.filter((p) => p.status === 'failed');

  return (
    <div className="min-h-screen bg-background">
      {notice && (
        <div className="fixed top-4 right-4 z-50 w-[min(92vw,24rem)] rounded-xl border border-success-200 bg-success-50 px-4 py-3 shadow-lg animate-slide-down">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-full bg-success-600 p-1 text-white">
              <CheckCircle2 size={14} />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-success-900">Updated</p>
              <p className="text-sm text-success-800">{notice}</p>
            </div>
            <button
              onClick={() => setNotice(null)}
              className="text-success-700 hover:text-success-900 transition-colors"
              aria-label="Dismiss notification"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Token expiry banner */}
      {tokenError && (
        <div className="bg-error-600 text-white px-4 py-3 flex items-center justify-between animate-slide-down">
          <div className="flex items-center gap-2 text-sm">
            <AlertCircle size={16} />
            <span>A social platform token has expired.</span>
            <button className="underline font-medium hover:no-underline">Re-link Account</button>
          </div>
          <button onClick={() => setTokenError(false)} className="hover:opacity-75 transition-opacity">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-40">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center text-white">
              <CalendarDays size={18} />
            </div>
            <div className="hidden sm:block">
              <p className="text-sm font-semibold text-foreground leading-tight">{brand.brand_name}</p>
              <p className="text-xs text-muted-foreground">India Standard Time (IST)</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <GeneratePanel brand={brand} hasExistingPosts={posts.length > 0} />
            <Tooltip content="Connect Apps">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowConnections((current) => !current)}
                icon={<Link2 size={16} />}
                aria-label="Connect Apps"
              />
            </Tooltip>
            <Tooltip content="Settings">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowSettings(true)}
                icon={<Settings size={16} />}
                aria-label="Settings"
              />
            </Tooltip>
            <Tooltip content="Sign Out">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSignOut}
                loading={signingOut}
                icon={<LogOut size={16} />}
                aria-label="Sign out"
              />
            </Tooltip>
          </div>
        </div>
      </header>

      <main className="max-w-screen-xl mx-auto px-4 sm:px-6 py-6">
        {showConnections ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h1 className="text-2xl font-semibold text-foreground">Connect Apps</h1>
                <p className="text-sm text-muted-foreground mt-1">Manage the apps users connect to publish from their own social accounts.</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowConnections(false)}
                icon={<ArrowLeft size={16} />}
              >
                Back
              </Button>
            </div>

            <ConnectionsPanel
              brand={brand}
              onMessage={(message) => showNotice(message)}
            />
          </div>
        ) : (
          <>
            {/* Stats strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              {[
                { label: 'Draft', value: draftCount, color: 'bg-neutral-100 text-neutral-700 border-neutral-200' },
                { label: 'Scheduled', value: scheduledCount, color: 'bg-primary-50 text-primary-700 border-primary-200' },
                { label: 'Published', value: publishedCount, color: 'bg-success-50 text-success-700 border-success-200' },
                { label: 'Failed', value: failedCount, color: 'bg-error-50 text-error-700 border-error-200' },
              ].map(({ label, value, color }) => (
                <div key={label} className={`rounded-lg border px-4 py-3 ${color}`}>
                  <p className="text-2xl font-bold">{value}</p>
                  <p className="text-xs font-medium mt-0.5">{label}</p>
                </div>
              ))}
            </div>

            <div className="mb-6 flex flex-wrap gap-2">
              {[
                { key: 'queue' as const, label: 'Queue', count: scheduledCount },
                { key: 'calendar' as const, label: 'Calendar', count: posts.length },
                { key: 'published' as const, label: 'Published', count: publishedCount },
                { key: 'failed' as const, label: 'Failed', count: failedCount },
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveView(tab.key)}
                  className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                    activeView === tab.key
                      ? 'border-primary-300 bg-primary-50 text-primary-700'
                      : 'border-border bg-white text-muted-foreground hover:bg-neutral-50'
                  }`}
                >
                  {tab.label} ({tab.count})
                </button>
              ))}
            </div>

            {/* Empty state */}
            {!postsLoading && posts.length === 0 && (
              <div className="flex flex-col items-center justify-center py-24 text-center animate-fade-in">
                <div className="w-16 h-16 bg-primary-100 rounded-2xl flex items-center justify-center mb-4">
                  <CalendarDays size={32} className="text-primary-600" />
                </div>
                <h2 className="text-xl font-semibold text-foreground mb-2">Your calendar is empty</h2>
                <p className="text-muted-foreground text-sm max-w-xs mb-6">
                  Generate a 30-day AI content plan tailored to <strong>{brand.brand_name}</strong> and start scheduling.
                </p>
                <GeneratePanel brand={brand} hasExistingPosts={false} />
              </div>
            )}

            {/* Main board */}
            {(postsLoading || posts.length > 0) && (
              postsLoading ? (
                <CalendarSkeleton />
              ) : (
                activeView === 'queue' ? (
                  <QueueView
                    posts={posts}
                    onEditPost={setEditingPost}
                    onDeletePost={(post) => {
                      deletePost.mutate(post.id);
                      showNotice('Post deleted.');
                    }}
                    onMoveToDrafts={(post) => showNotice(`"${post.hook}" moved to Drafts.`)}
                    onPostScheduled={(post) => showNotice(`"${post.hook}" scheduled.`)}
                    onTokenError={() => setTokenError(true)}
                  />
                ) : activeView === 'calendar' ? (
                  <CalendarGrid
                    posts={posts}
                    loading={postsLoading}
                    onEditPost={setEditingPost}
                    onDeletePost={(post) => {
                      deletePost.mutate(post.id);
                      showNotice('Post deleted.');
                    }}
                    onMoveToDrafts={(post) => showNotice(`"${post.hook}" moved to Drafts.`)}
                    onPostScheduled={(post) => showNotice(`"${post.hook}" scheduled.`)}
                    onTokenError={() => setTokenError(true)}
                  />
                ) : (
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {(activeView === 'published' ? publishedPosts : failedPosts).map((post) => (
                      <PostCard
                        key={post.id}
                        post={post}
                        onEdit={setEditingPost}
                        onDelete={(item) => {
                          deletePost.mutate(item.id);
                          showNotice('Post deleted.');
                        }}
                        onMoveToDrafts={(item) => showNotice(`"${item.hook}" moved to Drafts.`)}
                        onPostScheduled={(item) => showNotice(`"${item.hook}" scheduled.`)}
                        onTokenError={() => setTokenError(true)}
                        onOpen={setEditingPost}
                      />
                    ))}
                    {(activeView === 'published' ? publishedPosts : failedPosts).length === 0 && (
                      <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center md:col-span-2 xl:col-span-3">
                        <p className="text-sm text-muted-foreground">No posts in this view.</p>
                      </div>
                    )}
                  </div>
                )
              )
            )}
          </>
        )}
      </main>

      <PostEditModal
        post={editingPost}
        brandId={brand.id}
        onClose={() => setEditingPost(null)}
        onDelete={(post) => {
          deletePost.mutate(post.id);
          showNotice('Post deleted.');
        }}
        onMoveToDrafts={(post) => {
          showNotice(`"${post.hook}" moved to Drafts.`);
        }}
      />
    </div>
  );
}
