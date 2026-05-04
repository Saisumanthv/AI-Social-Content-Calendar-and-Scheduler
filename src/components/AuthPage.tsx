import { useState, FormEvent } from 'react';
import { CalendarDays, Sparkles, Zap } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/Button';
import { Input } from './ui/Input';

export function AuthPage() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setLoading(true);
    try {
      if (mode === 'signin') {
        await signIn(email, password);
      } else {
        await signUp(email, password);
        setSuccessMsg('Account created! You can now sign in.');
        setMode('signin');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-background to-accent-50 flex">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-primary-600 flex-col justify-between p-12 text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-10"
          style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, white 1px, transparent 1px), radial-gradient(circle at 80% 20%, white 1px, transparent 1px)', backgroundSize: '40px 40px' }}
        />
        <div className="relative">
          <div className="flex items-center gap-3 mb-16">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
              <CalendarDays size={22} />
            </div>
            <span className="text-xl font-semibold">ContentFlow</span>
          </div>
          <h1 className="text-4xl font-bold leading-tight mb-6">
            AI-powered social media at scale
          </h1>
          <p className="text-primary-100 text-lg leading-relaxed">
            Generate a complete 30-day content calendar in seconds. Schedule and auto-publish across every platform.
          </p>
        </div>

        <div className="relative space-y-6">
          {[
            { icon: Sparkles, title: 'AI Content Generation', desc: 'Gemini creates 30 posts tailored to your brand voice' },
            { icon: CalendarDays, title: 'Visual Calendar', desc: 'Drag, edit, and approve posts in a beautiful grid' },
            { icon: Zap, title: 'Auto-Publishing', desc: 'n8n orchestrates posts to Meta, Instagram, and more' },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="flex items-start gap-4">
              <div className="w-10 h-10 bg-white/15 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                <Icon size={18} />
              </div>
              <div>
                <p className="font-semibold">{title}</p>
                <p className="text-primary-200 text-sm mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center text-white">
              <CalendarDays size={18} />
            </div>
            <span className="text-lg font-semibold text-foreground">ContentFlow</span>
          </div>

          <h2 className="text-2xl font-bold text-foreground mb-1">
            {mode === 'signin' ? 'Welcome back' : 'Create your account'}
          </h2>
          <p className="text-muted-foreground text-sm mb-8">
            {mode === 'signin'
              ? 'Sign in to your ContentFlow workspace'
              : 'Start your 30-day AI content journey'}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Email address"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
            <Input
              label="Password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              hint={mode === 'signup' ? 'At least 6 characters' : undefined}
            />

            {error && (
              <div className="bg-error-50 border border-error-200 rounded-md px-3 py-2.5 text-sm text-error-700 animate-fade-in">
                {error}
              </div>
            )}
            {successMsg && (
              <div className="bg-success-50 border border-success-200 rounded-md px-3 py-2.5 text-sm text-success-700 animate-fade-in">
                {successMsg}
              </div>
            )}

            <Button type="submit" loading={loading} className="w-full" size="lg">
              {mode === 'signin' ? 'Sign In' : 'Create Account'}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground mt-6">
            {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
            <button
              onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(''); setSuccessMsg(''); }}
              className="text-primary-600 hover:text-primary-700 font-medium transition-colors"
            >
              {mode === 'signin' ? 'Sign up' : 'Sign in'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
