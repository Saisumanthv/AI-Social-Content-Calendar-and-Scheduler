import { useState, KeyboardEvent } from 'react';
import { Building2, Users, Mic2, LayoutGrid, Globe, ChevronRight, ChevronLeft, Check, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useUpsertBrandProfile } from '../hooks/useBrandProfile';
import { Button } from './ui/Button';
import { Input, Textarea } from './ui/Input';
import { TagBadge } from './ui/Badge';
import { TIMEZONES } from '../lib/timezones';
import type { BrandProfile } from '../types/database';

const STEPS = [
  { id: 1, title: 'Brand Identity', desc: 'Tell us about your brand', icon: Building2 },
  { id: 2, title: 'Voice & Tone', desc: 'How does your brand speak?', icon: Mic2 },
  { id: 3, title: 'Content Pillars', desc: 'Core content themes', icon: LayoutGrid },
  { id: 4, title: 'Audience & Zone', desc: 'Who you are reaching', icon: Users },
];

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

  const [step, setStep] = useState(1);
  const [brandName, setBrandName] = useState(existingProfile?.brand_name ?? '');
  const [brandTone, setBrandTone] = useState(existingProfile?.brand_tone ?? '');
  const [pillars, setPillars] = useState<string[]>(existingProfile?.content_pillars ?? []);
  const [pillarInput, setPillarInput] = useState('');
  const [targetAudience, setTargetAudience] = useState(existingProfile?.target_audience ?? '');
  const [timezone, setTimezone] = useState(existingProfile?.timezone ?? 'UTC');
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

  function validateStep(): boolean {
    if (step === 1 && !brandName.trim()) { setError('Brand name is required'); return false; }
    if (step === 2 && !brandTone.trim()) { setError('Please select or enter a brand tone'); return false; }
    if (step === 3 && pillars.length < 2) { setError('Add at least 2 content pillars'); return false; }
    if (step === 4 && !targetAudience.trim()) { setError('Target audience is required'); return false; }
    setError('');
    return true;
  }

  function nextStep() {
    if (!validateStep()) return;
    if (step < 4) setStep(s => s + 1);
  }

  async function handleFinish() {
    if (!validateStep()) return;
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

  const progress = ((step - 1) / (STEPS.length - 1)) * 100;

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-background to-accent-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
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

        {/* Step indicators */}
        <div className="flex items-center justify-between mb-8 relative">
          <div className="absolute top-4 left-0 right-0 h-0.5 bg-border">
            <div
              className="h-full bg-primary-600 transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          {STEPS.map(s => {
            const Icon = s.icon;
            const done = step > s.id;
            const active = step === s.id;
            return (
              <div key={s.id} className="relative flex flex-col items-center gap-2">
                <div className={`
                  w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 z-10
                  ${done ? 'bg-primary-600 text-white' : active ? 'bg-primary-600 text-white shadow-lg shadow-primary-200' : 'bg-white border-2 border-border text-muted-foreground'}
                `}>
                  {done ? <Check size={14} /> : <Icon size={14} />}
                </div>
                <span className={`text-xs font-medium hidden sm:block ${active ? 'text-primary-600' : 'text-muted-foreground'}`}>
                  {s.title}
                </span>
              </div>
            );
          })}
        </div>

        {/* Card */}
        <div className="bg-card rounded-2xl border border-border shadow-sm p-8">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-foreground">{STEPS[step - 1].title}</h2>
            <p className="text-sm text-muted-foreground mt-0.5">{STEPS[step - 1].desc}</p>
          </div>

          {/* Step 1: Brand Name */}
          {step === 1 && (
            <div className="space-y-4 animate-fade-in">
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
          )}

          {/* Step 2: Tone */}
          {step === 2 && (
            <div className="space-y-4 animate-fade-in">
              <div className="grid grid-cols-2 gap-2">
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
          )}

          {/* Step 3: Content Pillars */}
          {step === 3 && (
            <div className="space-y-4 animate-fade-in">
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
          )}

          {/* Step 4: Audience & Timezone */}
          {step === 4 && (
            <div className="space-y-4 animate-fade-in">
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
          )}

          {error && (
            <div className="mt-4 flex items-center gap-2 text-sm text-error-600 bg-error-50 border border-error-200 rounded-md px-3 py-2 animate-fade-in">
              <X size={14} />
              {error}
            </div>
          )}

          {/* Nav */}
          <div className="flex justify-between mt-8">
            <Button
              variant="secondary"
              onClick={() => { setError(''); setStep(s => s - 1); }}
              disabled={step === 1}
              icon={<ChevronLeft size={16} />}
            >
              Back
            </Button>

            {step < 4 ? (
              <Button onClick={nextStep} icon={<ChevronRight size={16} />}>
                Continue
              </Button>
            ) : (
              <Button
                onClick={handleFinish}
                loading={upsert.isPending}
                icon={<Check size={16} />}
                variant="success"
              >
                {isEdit ? 'Save Changes' : 'Launch Dashboard'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
