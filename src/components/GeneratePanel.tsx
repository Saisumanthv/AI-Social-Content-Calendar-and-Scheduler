import { useState } from 'react';
import { Sparkles, CalendarDays, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';
import { PLATFORMS } from '../lib/timezones';
import { useGenerateContent } from '../hooks/useCalendar';
import type { BrandProfile } from '../types/database';

interface Props {
  brand: BrandProfile;
  hasExistingPosts: boolean;
}

export function GeneratePanel({ brand, hasExistingPosts }: Props) {
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState('instagram');
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const generate = useGenerateContent(brand.id);

  function handleGenerateClick() {
    if (hasExistingPosts) {
      setConfirmOpen(true);
    } else {
      void runGeneration();
    }
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
        timezone: brand.timezone,
        start_date: startDate,
        platform,
      });
      setSuccess(true);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} icon={<Sparkles size={16} />} size="md">
        Generate 30-Day Calendar
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title="Generate Content Calendar" maxWidth="sm">
        <div className="space-y-5">
          {success ? (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <div className="w-12 h-12 bg-success-100 rounded-full flex items-center justify-center mb-3">
                <CheckCircle2 size={24} className="text-success-600" />
              </div>
              <p className="font-semibold text-foreground">Calendar Generated!</p>
              <p className="text-sm text-muted-foreground mt-1">
                30 posts have been created and added to your calendar.
              </p>
              <Button onClick={() => setOpen(false)} className="mt-4" size="md">
                Done
              </Button>
            </div>
          ) : (
            <>
              <div className="bg-primary-50 border border-primary-100 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center text-white shrink-0">
                    <Sparkles size={16} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-primary-800">AI-Powered Generation</p>
                    <p className="text-xs text-primary-600 mt-0.5">
                      Groq will create 30 unique posts tailored to <strong>{brand.brand_name}</strong> with your brand tone, content pillars, and audience in mind.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="label">Target Platform</label>
                <div className="grid grid-cols-3 gap-2">
                  {PLATFORMS.map(p => (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => setPlatform(p.value)}
                      disabled={generate.isPending}
                      className={`
                        text-sm py-2 px-3 rounded-lg border transition-all duration-150
                        ${platform === p.value
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

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Replace Existing Calendar?" maxWidth="sm">
        <div className="space-y-4">
          <div className="flex items-start gap-3 bg-warning-50 border border-warning-200 rounded-lg p-4">
            <AlertTriangle size={18} className="text-warning-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-warning-800">This will delete all draft posts</p>
              <p className="text-xs text-warning-700 mt-0.5">
                Scheduled and published posts will be preserved. Only draft posts will be replaced.
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setConfirmOpen(false)}>Keep Existing</Button>
            <Button variant="danger" onClick={() => void runGeneration()} loading={generate.isPending} icon={<CalendarDays size={15} />}>
              Replace & Generate
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}