import { useState } from 'react';
import { Sparkles, CalendarDays, CheckCircle2, Upload } from 'lucide-react';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';
import { PLATFORMS } from '../lib/timezones';
import { supabase } from '../lib/supabase';
import { useGenerateContent } from '../hooks/useCalendar';
import { useCalendarPosts } from '../hooks/useCalendar';
import type { BrandProfile } from '../types/database';

interface Props {
  brand: BrandProfile;
  hasExistingPosts: boolean;
}

function getDefaultStartDate() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
}

export function GeneratePanel({ brand, hasExistingPosts }: Props) {
  const [open, setOpen] = useState(false);
  const [selectedPlatforms, setSelectedPlatforms] = useState(['instagram']);
  const [count, setCount] = useState(1);
  const [startDate, setStartDate] = useState(getDefaultStartDate);
  const [scheduledTime, setScheduledTime] = useState('09:00');
  const [idea, setIdea] = useState('');
  const [assetUrl, setAssetUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [lastGeneratedTotal, setLastGeneratedTotal] = useState(0);

  const generate = useGenerateContent(brand.id);
  const { data: existingPosts = [] } = useCalendarPosts(brand.id);
  const PER_DAY_LIMIT = 30;

  function getValidPlatforms(platforms: string[]) {
    const allowed = new Set(PLATFORMS.map(p => p.value));
    const valid = platforms.filter(value => allowed.has(value));
    return valid.length > 0 ? valid : [PLATFORMS[0]?.value ?? 'instagram'];
  }

  const effectiveSelectedPlatforms = getValidPlatforms(selectedPlatforms);
  const totalSelectedPosts = effectiveSelectedPlatforms.length * count;

  function resetGenerateModalState() {
    setSelectedPlatforms(['instagram']);
    setCount(1);
    setStartDate(getDefaultStartDate());
    setScheduledTime('09:00');
    setIdea('');
    setAssetUrl('');
    setUploading(false);
    setConfirmOpen(false);
    setError('');
    setLastGeneratedTotal(0);
  }

  function handleModalClose() {
    if (generate.isPending) return;
    if (success) {
      resetGenerateModalState();
      setSuccess(false);
    }
    setOpen(false);
  }

  function openGenerateModal() {
    setSuccess(false);
    setError('');
    setSelectedPlatforms(current => getValidPlatforms(current));
    setOpen(true);
  }

  function handleGenerateClick() {
    if (!idea.trim()) {
      setError('Please describe your initial idea before generating.');
      return;
    }

    const platformsToUse = getValidPlatforms(selectedPlatforms);
    if (platformsToUse.length === 0) {
      setError('Please select at least one platform.');
      return;
    }

    setSelectedPlatforms(platformsToUse);

    // enforce per-day cap: count * platforms + existing scheduled/published on that date <= PER_DAY_LIMIT
    const targetDateStr = startDate; // YYYY-MM-DD
    const existingCount = existingPosts.filter(p => {
      const d = new Date(p.post_date);
      const ymd = d.toISOString().split('T')[0];
      return ymd === targetDateStr && (p.status === 'scheduled' || p.status === 'published');
    }).length;
    const totalNew = count * platformsToUse.length;
    if (existingCount + totalNew > PER_DAY_LIMIT) {
      setError(`Per-day scheduling limit reached for ${targetDateStr}. ${PER_DAY_LIMIT - existingCount} slots remaining.`);
      return;
    }

    setConfirmOpen(true);
  }

  async function runGeneration() {
    setConfirmOpen(false);
    setError('');
    setSuccess(false);
    try {
      await generate.mutateAsync({
        brand_id: brand.id,
        brand_name: brand.brand_name,
        brand_tone: brand.brand_tone,
        content_pillars: brand.content_pillars,
        target_audience: brand.target_audience,
        timezone: 'Asia/Kolkata', // India Standard Time (IST)
        start_date: startDate,
        scheduled_time: `${scheduledTime}:00`,
        idea: idea.trim(),
        platforms: effectiveSelectedPlatforms,
        count,
        asset_url: assetUrl || null,
      });
      setLastGeneratedTotal(totalSelectedPosts);
      setSuccess(true);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError('');

    try {
      const ext = file.name.split('.').pop() || 'png';
      const path = `${brand.id}/generate-${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from('post-assets')
        .upload(path, file, { upsert: true });

      if (uploadErr) throw uploadErr;

      const { data } = supabase.storage.from('post-assets').getPublicUrl(path);
      setAssetUrl(data.publicUrl);
    } catch (err) {
      setError(`Upload failed: ${(err as Error).message}`);
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <Button onClick={openGenerateModal} icon={<Sparkles size={16} />} size="md">
        Generate Post
      </Button>

      {/* Config modal */}
      <Modal open={open} onClose={handleModalClose} title="Generate Post" maxWidth="sm">
        <div className="space-y-5">
          {success ? (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <div className="w-12 h-12 bg-success-100 rounded-full flex items-center justify-center mb-3">
                <CheckCircle2 size={24} className="text-success-600" />
              </div>
              <p className="font-semibold text-foreground">Post Generated!</p>
              <p className="text-sm text-muted-foreground mt-1">
                {lastGeneratedTotal} post{lastGeneratedTotal > 1 ? 's have' : ' has'} been created and added to your calendar.
              </p>
              <Button onClick={handleModalClose} className="mt-4" size="md">
                Done
              </Button>
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <label className="label">Initial Idea</label>
                <textarea
                  className="input min-h-24 resize-y"
                  placeholder="Describe the campaign, topic, hook, or message you want to post about..."
                  value={idea}
                  onChange={e => setIdea(e.target.value)}
                  disabled={generate.isPending}
                />
              </div>

              <div className="space-y-1.5">
                <label className="label">Image (optional)</label>
                {assetUrl ? (
                  <div className="rounded-lg overflow-hidden border border-border">
                    <img src={assetUrl} alt="Selected upload" className="w-full h-40 object-cover" />
                    <div className="flex items-center justify-between gap-2 px-3 py-2 bg-neutral-50 border-t border-border">
                      <span className="text-xs text-muted-foreground truncate">Image uploaded</span>
                      <button
                        type="button"
                        onClick={() => setAssetUrl('')}
                        className="text-xs text-error-600 hover:text-error-700 font-medium"
                        disabled={uploading}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center h-32 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-primary-400 hover:bg-primary-50 transition-colors group">
                    <Upload size={20} className="text-muted-foreground group-hover:text-primary-600 transition-colors mb-2" />
                    <span className="text-sm text-muted-foreground group-hover:text-primary-600 transition-colors">
                      {uploading ? 'Uploading...' : 'Click to upload image or skip for text-only posts'}
                    </span>
                    <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" disabled={uploading} />
                  </label>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="label">Target Platforms</label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {PLATFORMS.map(p => (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => setSelectedPlatforms(current => (
                        getValidPlatforms(current).includes(p.value)
                          ? (getValidPlatforms(current).length === 1 ? getValidPlatforms(current) : getValidPlatforms(current).filter(value => value !== p.value))
                          : [...getValidPlatforms(current), p.value]
                      ))}
                      disabled={generate.isPending}
                      className={`
                        text-sm py-2 px-3 rounded-lg border transition-all duration-150
                        ${effectiveSelectedPlatforms.includes(p.value)
                          ? 'border-primary-500 bg-primary-50 text-primary-700 font-medium'
                          : 'border-border bg-white text-neutral-600 hover:border-neutral-300'}
                        ${generate.isPending ? 'opacity-50 cursor-not-allowed' : ''}
                      `}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="label">Number of posts per platform</label>
                <input
                  type="number"
                  className="input w-32"
                  min={1}
                  max={30}
                  value={count}
                  onChange={e => setCount(Math.max(1, Math.min(30, Number(e.target.value || 1))))}
                  disabled={generate.isPending}
                />
              </div>

              <div className="space-y-1.5">
                <label className="label">Start Date</label>
                <input
                  type="date"
                  className="input"
                  value={startDate}
                  min={new Date().toISOString().split('T')[0]}
                  onChange={e => setStartDate(e.target.value)}
                  disabled={generate.isPending}
                />
              </div>

              <div className="space-y-1.5">
                <label className="label">Post Time</label>
                <input
                  type="time"
                  className="input"
                  value={scheduledTime}
                  onChange={e => setScheduledTime(e.target.value)}
                  disabled={generate.isPending}
                />
              </div>

              <p className="text-xs text-muted-foreground">
                Selected platforms: {effectiveSelectedPlatforms.map(value => PLATFORMS.find(p => p.value === value)?.label ?? value).join(', ')}
              </p>

              {error && (
                <p className="text-sm text-error-600 bg-error-50 border border-error-200 rounded-md px-3 py-2">{error}</p>
              )}

              <div className="flex justify-end gap-3">
                <Button variant="secondary" onClick={() => setOpen(false)} disabled={generate.isPending}>Cancel</Button>
                <Button onClick={handleGenerateClick} loading={generate.isPending} icon={<Sparkles size={15} />}>
                  {generate.isPending ? 'Generating…' : 'Generate Now'}
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* Generation confirmation */}
      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Confirm Generation" maxWidth="sm">
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-neutral-50 p-4 space-y-2">
            <p className="text-sm font-medium text-foreground">Are you sure you want to generate posts with these details?</p>
            <p className="text-xs text-muted-foreground">Date: {startDate}</p>
            <p className="text-xs text-muted-foreground">Time: {scheduledTime}</p>
            <p className="text-xs text-muted-foreground">Platforms: {effectiveSelectedPlatforms.map(value => PLATFORMS.find(p => p.value === value)?.label ?? value).join(', ')}</p>
            <p className="text-xs text-muted-foreground">Posts per platform: {count}</p>
            <p className="text-xs text-muted-foreground">Total posts: {totalSelectedPosts}</p>
            {hasExistingPosts && (
              <p className="text-xs text-muted-foreground">Existing draft posts will be refreshed after generation.</p>
            )}
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setConfirmOpen(false)}>Edit Details</Button>
            <Button onClick={runGeneration} loading={generate.isPending} icon={<CalendarDays size={15} />}>
              Yes, Generate
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
