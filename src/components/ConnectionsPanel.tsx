import { useEffect, useState } from 'react';
import { Link2, CheckCircle2, Clock3, ExternalLink } from 'lucide-react';
import { Button } from './ui/Button';
import { deletePlatformConnection, getOAuthStartUrl } from '../lib/api';
import { usePlatformConnections } from '../hooks/useCalendar';
import type { BrandProfile } from '../types/database';

type PlatformCard = {
  key: string;
  name: string;
  description: string;
  scopes: string;
  enabled: boolean;
};

const PLATFORMS: PlatformCard[] = [
  {
    key: 'linkedin',
    name: 'LinkedIn',
    description: 'Connect your LinkedIn account to publish professional content from the user’s own profile.',
    scopes: 'w_member_social, r_liteprofile',
    enabled: true,
  },
  {
    key: 'x',
    name: 'X',
    description: 'Coming next. We will connect X after the OAuth flow is finalized for this app.',
    scopes: 'tweet.write, users.read, offline.access',
    enabled: false,
  },
  {
    key: 'instagram',
    name: 'Instagram',
    description: 'Connect your Instagram account to publish content directly from your profile.',
    scopes: 'instagram_content_publish, pages_manage_posts, pages_read_engagement',
    enabled: true,
  },
];

interface Props {
  brand: BrandProfile;
  onMessage: (message: string) => void;
}

export function ConnectionsPanel({ brand, onMessage }: Props) {
  const { data: connections = [], isLoading, refetch } = usePlatformConnections(brand.id);
  const [connectingPlatform, setConnectingPlatform] = useState<string | null>(null);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type !== 'oauth-complete') return;
      if (event.data?.platform !== 'linkedin') return;

      setConnectingPlatform(null);
      void refetch();

      if (event.data?.status === 'connected') {
        onMessage('LinkedIn account connected.');
      } else if (event.data?.status === 'error') {
        onMessage(event.data?.message || 'LinkedIn connection failed.');
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onMessage, refetch]);

  function openOAuthPopup(url: string) {
    const popup = window.open(url, 'linkedin-oauth', 'width=620,height=760');
    if (!popup) {
      window.location.href = url;
      return;
    }

    const popupWatcher = window.setInterval(() => {
      if (popup.closed) {
        window.clearInterval(popupWatcher);
        setConnectingPlatform(null);
      }
    }, 500);

    popup.focus();
  }

  async function handleConnect(platform: string) {
    try {
      const url = await getOAuthStartUrl(platform);
      const authUrl = `${url}&state=${encodeURIComponent(brand.id)}`;
      setConnectingPlatform(platform);
      openOAuthPopup(authUrl);
    } catch (err) {
      setConnectingPlatform(null);
      onMessage((err as Error).message);
    }
  }

  async function handleDisconnect(platform: string) {
    try {
      await deletePlatformConnection(brand.id, platform);
      await refetch();
      onMessage('LinkedIn account disconnected.');
    } catch (err) {
      onMessage((err as Error).message);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-9 h-9 rounded-xl bg-primary-50 text-primary-700 flex items-center justify-center border border-primary-100">
              <Link2 size={18} />
            </div>
            <h2 className="text-lg font-semibold text-foreground">Connected Applications</h2>
          </div>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Connect each social platform once here. When a post is scheduled, it will publish from the connected user account rather than from your admin account.
          </p>
        </div>

        <Button variant="ghost" size="sm" onClick={() => refetch()} loading={isLoading}>
          Refresh status
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {PLATFORMS.map((platform) => {
          const connection = connections.find((item) => item.platform_name === platform.key);
          const connected = connection?.status === 'connected';
          const needsReauth = connection?.needs_reauth;

          return (
            <div
              key={platform.key}
              className={`rounded-xl border p-4 transition-all ${connected ? 'border-success-200 bg-success-50/60' : 'border-border bg-background'}`}
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <p className="font-semibold text-foreground">{platform.name}</p>
                  <p className="text-xs text-muted-foreground mt-1">Required scopes: {platform.scopes}</p>
                </div>
                {connected ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-success-700 bg-success-100 px-2 py-1 rounded-full">
                    <CheckCircle2 size={12} /> Connected
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground bg-muted px-2 py-1 rounded-full">
                    <Clock3 size={12} /> Not connected
                  </span>
                )}
              </div>

              <p className="text-sm text-muted-foreground leading-relaxed mb-4">{platform.description}</p>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant={connected ? 'secondary' : 'primary'}
                  onClick={() => (connected ? handleDisconnect(platform.key) : handleConnect(platform.key))}
                  disabled={!platform.enabled || connectingPlatform === platform.key || isLoading}
                  className="flex-1"
                >
                  {connected ? 'Disconnect' : platform.enabled ? 'Connect' : 'Coming soon'}
                </Button>
                {connected && connection?.account_name ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<ExternalLink size={14} />}
                    onClick={() => onMessage(`${platform.name} is connected to ${connection.account_name}.`)}
                  />
                ) : null}
              </div>

              {platform.key === 'linkedin' && needsReauth ? (
                <p className="mt-3 text-xs font-medium text-warning-700">LinkedIn needs to be reconnected before scheduled publishing can resume.</p>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}