import { useState, KeyboardEvent } from 'react';
import { Building2, Users, Mic2, LayoutGrid, Globe, Check, X, ArrowLeft } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useUpsertBrandProfile } from '../hooks/useBrandProfile';
import { Button } from './ui/Button';
import { Input, Textarea } from './ui/Input';
import { TagBadge } from './ui/Badge';
import { PLATFORMS } from '../lib/timezones';
import type { BrandProfile } from '../types/database';

const TONE_OPTIONS = [
  'Professional & Authoritative',
  'Friendly & Approachable',
  'Bold & Energetic',
  'Inspirational & Motivating',
  'Educational & Informative',
  'Witty & Humorous',
  'Elegant & Sophisticated',
  'Casual & Conversational',
];

interface Props {
  existingProfile?: BrandProfile | null;
  onComplete: () => void;
}

export function BrandOnboarding({ existingProfile, onComplete }: Props) {
  const { user } = useAuth();
  const upsert = useUpsertBrandProfile();

  const [brandName, setBrandName] = useState(existingProfile?.brand_name ?? '');
  const [brandTone, setBrandTone] = useState(existingProfile?.brand_tone ?? '');
  const [pillars, setPillars] = useState<string[]>(existingProfile?.content_pillars ?? []);
  const [pillarInput, setPillarInput] = useState('');
  const [targetAudience, setTargetAudience] = useState(existingProfile?.target_audience ?? '');
  const timezone = 'Asia/Kolkata'; // Hardcoded to IST for India-only app
  const [error, setError] = useState('');

  const isEdit = !!existingProfile;

  function addPillar() {
    const val = pillarInput.trim();
    if (!val || pillars.includes(val) || pillars.length >= 8) return;
    setPillars(p => [...p, val]);
    setPillarInput('');
  }

  function onPillarKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') { e.preventDefault(); addPillar(); }
  }

  function removePillar(pillar: string) {
    setPillars(p => p.filter(x => x !== pillar));
  }

  function validate(): boolean {
    if (!brandName.trim()) { setError('Brand name is required'); return false; }
    if (!brandTone.trim()) { setError('Please select or enter a brand tone'); return false; }
    if (pillars.length < 2) { setError('Add at least 2 content pillars'); return false; }
    if (!targetAudience.trim()) { setError('Target audience is required'); return false; }
    setError('');
    return true;
  }

  async function handleSave() {
    if (!validate()) return;
    try {
      await upsert.mutateAsync({
        user_id: user!.id,
        brand_name: brandName.trim(),
        brand_tone: brandTone.trim(),
        content_pillars: pillars,
        target_audience: targetAudience.trim(),
        timezone,
      });
      onComplete();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-background to-accent-50 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              {isEdit ? 'Brand Settings' : 'Set Up Your Brand'}
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              {isEdit ? 'Update your brand profile settings below' : 'This helps AI generate content that matches your brand perfectly'}
            </p>
          </div>
          <button
            onClick={onComplete}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Back to dashboard"
          >
            <ArrowLeft size={24} />
          </button>
        </div>

        {/* Form Card */}
        <div className="bg-card rounded-2xl border border-border shadow-sm p-8">
          <div className="space-y-6 max-h-[calc(100vh-200px)] overflow-y-auto pr-4">
            {/* Brand Name */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Building2 size={16} className="text-primary-600" />
                <h3 className="text-sm font-semibold text-foreground">Brand Identity</h3>
              </div>
              <Input
                label="Brand Name"
                placeholder="e.g. Acme Coffee Roasters"
                value={brandName}
                onChange={e => setBrandName(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-2">
                The AI uses your brand name throughout captions and hooks to maintain consistent brand identity.
              </p>
            </div>

            {/* Divider */}
            <div className="border-t border-border" />

            {/* Tone */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Mic2 size={16} className="text-primary-600" />
                <h3 className="text-sm font-semibold text-foreground">Voice & Tone</h3>
              </div>
              <div className="grid grid-cols-2 gap-2 mb-4">
                {TONE_OPTIONS.map(tone => (
                  <button
                    key={tone}
                    type="button"
                    onClick={() => setBrandTone(tone)}
                    className={`
                      text-left text-sm px-3 py-2.5 rounded-lg border transition-all duration-150
                      ${brandTone === tone
                        ? 'border-primary-500 bg-primary-50 text-primary-700 font-medium'
                        : 'border-border bg-white text-neutral-600 hover:border-neutral-300 hover:bg-neutral-50'}
                    `}
                  >
                    {tone}
                  </button>
                ))}
              </div>
              <Input
                label="Or describe your tone"
                placeholder="e.g. Approachable expert with a touch of humor"
                value={TONE_OPTIONS.includes(brandTone) ? '' : brandTone}
                onChange={e => setBrandTone(e.target.value)}
                hint="Custom tone overrides the selection above"
              />
            </div>

            {/* Divider */}
            <div className="border-t border-border" />

            {/* Content Pillars */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <LayoutGrid size={16} className="text-primary-600" />
                <h3 className="text-sm font-semibold text-foreground">Content Pillars</h3>
              </div>
              <div className="flex gap-2 mb-3">
                <Input
                  placeholder="e.g. Product Education, Behind the Scenes"
                  value={pillarInput}
                  onChange={e => setPillarInput(e.target.value)}
                  onKeyDown={onPillarKeyDown}
                  className="flex-1"
                  hint="Press Enter to add"
                />
                <button
                  type="button"
                  onClick={addPillar}
                  className="btn-primary shrink-0 h-[38px] mt-auto"
                >
                  Add
                </button>
              </div>

              {pillars.length > 0 && (
                <div className="flex flex-wrap gap-2 p-3 bg-neutral-50 rounded-lg border border-border min-h-[60px] mb-3">
                  {pillars.map(p => (
                    <TagBadge key={p} onRemove={() => removePillar(p)}>{p}</TagBadge>
                  ))}
                </div>
              )}

              <p className="text-xs text-neutral-600">
                Suggested: <strong>Education</strong>, <strong>Inspiration</strong>, <strong>Product Showcase</strong>, <strong>Behind the Scenes</strong>, <strong>User Stories</strong>, <strong>Industry News</strong>
              </p>
            </div>

            {/* Divider */}
            <div className="border-t border-border" />

            {/* Audience & Timezone */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Users size={16} className="text-primary-600" />
                <h3 className="text-sm font-semibold text-foreground">Audience & Timezone</h3>
              </div>
              <Textarea
                label="Target Audience"
                placeholder="e.g. Small business owners aged 28-45 who care about sustainable sourcing and quality coffee"
                value={targetAudience}
                onChange={e => setTargetAudience(e.target.value)}
                rows={3}
              />
              <div className="mt-4 p-3 bg-primary-50 border border-primary-200 rounded-lg">
                <p className="text-sm text-primary-700 font-medium flex items-center gap-2">
                  <Globe size={14} />
                  India Standard Time (IST)
                </p>
                <p className="text-xs text-primary-600 mt-1">All posts are scheduled in Indian Standard Time (UTC+5:30)</p>
              </div>
            </div>
          </div>

          {error && (
            <div className="mt-6 flex items-center gap-2 text-sm text-error-600 bg-error-50 border border-error-200 rounded-md px-3 py-2 animate-fade-in">
              <X size={14} />
              {error}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-between gap-3 mt-8">
            <Button
              variant="secondary"
              onClick={onComplete}
              icon={<ArrowLeft size={16} />}
            >
              Back to Dashboard
            </Button>

            <Button
              onClick={handleSave}
              loading={upsert.isPending}
              icon={<Check size={16} />}
              variant="success"
            >
              {isEdit ? 'Save Changes' : 'Launch Dashboard'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
