import { useState } from 'react';
import { Settings, LogOut, CalendarDays, AlertCircle, X, RefreshCw } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useBrandProfile } from '../hooks/useBrandProfile';
import { useCalendarPosts } from '../hooks/useCalendar';
import { CalendarGrid } from './CalendarGrid';
import { GeneratePanel } from './GeneratePanel';
import { PostEditModal } from './PostEditModal';
import { BrandOnboarding } from './BrandOnboarding';
import { CalendarSkeleton } from './ui/Skeleton';
import { Button } from './ui/Button';
import type { ContentCalendarPost } from '../types/database';

export function Dashboard() {
  const { user, signOut } = useAuth();
  const { data: brand, isLoading: brandLoading } = useBrandProfile();
  const { data: posts = [], isLoading: postsLoading } = useCalendarPosts(brand?.id);

  const [editingPost, setEditingPost] = useState<ContentCalendarPost | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [tokenError, setTokenError] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    try { await signOut(); } finally { setSigningOut(false); }
  }

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

  return (
    <div className="min-h-screen bg-background">
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
              <p className="text-xs text-muted-foreground">{brand.timezone}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <GeneratePanel brand={brand} hasExistingPosts={posts.length > 0} />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowSettings(true)}
              icon={<Settings size={16} />}
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSignOut}
              loading={signingOut}
              icon={<LogOut size={16} />}
            />
          </div>
        </div>
      </header>

      <main className="max-w-screen-xl mx-auto px-4 sm:px-6 py-6">
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

        {/* Calendar grid */}
        {(postsLoading || posts.length > 0) && (
          postsLoading ? (
            <CalendarSkeleton />
          ) : (
            <CalendarGrid
              posts={posts}
              loading={postsLoading}
              onEditPost={setEditingPost}
              onTokenError={() => setTokenError(true)}
            />
          )
        )}
      </main>

      <PostEditModal
        post={editingPost}
        brandId={brand.id}
        onClose={() => setEditingPost(null)}
      />
    </div>
  );
}
