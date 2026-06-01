import { useState, KeyboardEvent } from 'react';
import { Building2, Users, Mic2, LayoutGrid, Globe, ChevronLeft, Check, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useUpsertBrandProfile } from '../hooks/useBrandProfile';
import { Button } from './ui/Button';
import { Input, Textarea } from './ui/Input';
import { TagBadge } from './ui/Badge';
import { TIMEZONES } from '../lib/timezones';
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
  onBack?: () => void;
}

export function BrandOnboarding({ existingProfile, onComplete, onBack }: Props) {
  const { user } = useAuth();
  const upsert = useUpsertBrandProfile();

  const [brandName, setBrandName] = useState(existingProfile?.brand_name ?? '');
  const [brandTone, setBrandTone] = useState(existingProfile?.brand_tone ?? '');
  const [pillars, setPillars] = useState<string[]>(existingProfile?.content_pillars ?? []);
  const [pillarInput, setPillarInput] = useState('');
  const [targetAudience, setTargetAudience] = useState(existingProfile?.target_audience ?? '');
  const [timezone, setTimezone] = useState(existingProfile?.timezone ?? 'Asia/Kolkata');
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

  function validateForm(): boolean {
    if (!brandName.trim()) { setError('Brand name is required'); return false; }
    if (!brandTone.trim()) { setError('Please select or enter a brand tone'); return false; }
    if (pillars.length < 2) { setError('Add at least 2 content pillars'); return false; }
    if (!targetAudience.trim()) { setError('Target audience is required'); return false; }
    setError('');
    return true;
  }

  async function handleFinish() {
    if (!validateForm()) return;
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
      <div className="w-full max-w-4xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-primary-600 rounded-2xl text-white mb-4 shadow-lg">
            <Building2 size={28} />
          </div>
          <h1 className="text-2xl font-bold text-foreground">
            {isEdit ? 'Update Brand Profile' : 'Set Up Your Brand'}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {isEdit ? 'Edit your brand settings below' : 'This helps AI generate content that matches your brand perfectly'}
          </p>
        </div>

        <div className="bg-card rounded-2xl border border-border shadow-sm p-8">
          <div className="grid gap-8 lg:grid-cols-2">
            <div className="space-y-6">
              <div className="space-y-4">
                <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                  <Building2 size={18} /> Brand Identity
                </h2>
                <Input
                  label="Brand Name"
                  placeholder="e.g. Acme Coffee Roasters"
                  value={brandName}
                  onChange={e => setBrandName(e.target.value)}
                  autoFocus
                />
                <div className="bg-primary-50 rounded-lg p-4 border border-primary-100">
                  <p className="text-sm text-primary-700 font-medium mb-1">Why this matters</p>
                  <p className="text-xs text-primary-600">
                    The AI uses your brand name throughout captions and hooks to maintain consistent brand identity.
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                  <Mic2 size={18} /> Voice & Tone
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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
            </div>

            <div className="space-y-6">
              <div className="space-y-4">
                <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                  <LayoutGrid size={18} /> Content Pillars
                </h2>
                <div className="flex gap-2">
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
                  <div className="flex flex-wrap gap-2 p-3 bg-neutral-50 rounded-lg border border-border min-h-[60px]">
                    {pillars.map(p => (
                      <TagBadge key={p} onRemove={() => removePillar(p)}>{p}</TagBadge>
                    ))}
                  </div>
                )}

                <div className="bg-accent-50 rounded-lg p-3 border border-accent-100">
                  <p className="text-xs text-accent-700">
                    Suggested pillars: <strong>Education</strong>, <strong>Inspiration</strong>, <strong>Product Showcase</strong>, <strong>Behind the Scenes</strong>, <strong>User Stories</strong>, <strong>Industry News</strong>
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                  <Users size={18} /> Audience & Zone
                </h2>
                <Textarea
                  label="Target Audience"
                  placeholder="e.g. Small business owners aged 28-45 who care about sustainable sourcing and quality coffee"
                  value={targetAudience}
                  onChange={e => setTargetAudience(e.target.value)}
                  rows={3}
                />
                <div className="space-y-1.5">
                  <label className="label">
                    <Globe size={14} className="inline mr-1.5" />
                    Timezone
                  </label>
                  <select
                    value={timezone}
                    onChange={e => setTimezone(e.target.value)}
                    className="input"
                  >
                    {TIMEZONES.map(tz => (
                      <option key={tz.value} value={tz.value}>{tz.label}</option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground">Used to schedule posts at the right local time</p>
                </div>
              </div>
            </div>
          </div>

          {error && (
            <div className="mt-4 flex items-center gap-2 text-sm text-error-600 bg-error-50 border border-error-200 rounded-md px-3 py-2 animate-fade-in">
              <X size={14} />
              {error}
            </div>
          )}

          {/* Nav */}
          <div className="flex justify-between mt-8">
            {onBack ? (
              <Button variant="secondary" onClick={() => { setError(''); onBack(); }} icon={<ChevronLeft size={16} />}>
                Back
              </Button>
            ) : (
              <span />
            )}

            <Button
              onClick={handleFinish}
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
