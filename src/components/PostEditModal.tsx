import { useState, useEffect } from 'react';
import { Save, Upload, Hash, Image } from 'lucide-react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Input, Textarea } from './ui/Input';
import { TagBadge } from './ui/Badge';
import { supabase } from '../lib/supabase';
import { useUpdatePost } from '../hooks/useCalendar';
import type { ContentCalendarPost } from '../types/database';

interface Props {
  post: ContentCalendarPost | null;
  brandId: string;
  onClose: () => void;
}

export function PostEditModal({ post, brandId, onClose }: Props) {
  const updatePost = useUpdatePost(brandId);
  const [hook, setHook] = useState('');
  const [caption, setCaption] = useState('');
  const [hashtagInput, setHashtagInput] = useState('');
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [imagePrompt, setImagePrompt] = useState('');
  const [scheduledTime, setScheduledTime] = useState('09:00');
  const [assetUrl, setAssetUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!post) return;
    setHook(post.hook);
    setCaption(post.caption);
    setHashtags(post.hashtags);
    setImagePrompt(post.image_prompt);
    setScheduledTime(post.scheduled_time?.slice(0, 5) ?? '09:00');
    setAssetUrl(post.asset_url);
    setError('');
  }, [post]);

  function addHashtag() {
    const tag = hashtagInput.replace(/^#/, '').trim();
    if (!tag || hashtags.includes(tag)) return;
    setHashtags(h => [...h, tag]);
    setHashtagInput('');
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !post) return;
    setUploading(true);
    setError('');
    try {
      const ext = file.name.split('.').pop();
      const path = `${brandId}/${post.id}.${ext}`;
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

  async function handleSave() {
    if (!post) return;
    setError('');
    try {
      await updatePost.mutateAsync({
        postId: post.id,
        updates: {
          hook,
          caption,
          hashtags,
          image_prompt: imagePrompt,
          scheduled_time: `${scheduledTime}:00`,
          asset_url: assetUrl,
        },
      });
      onClose();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const formattedDate = post
    ? new Date(post.post_date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    : '';

  return (
    <Modal open={!!post} onClose={onClose} title={`Edit Post — ${formattedDate}`} maxWidth="xl">
      <div className="space-y-5">
        {/* Media */}
        <div>
          <label className="label"><Image size={14} className="inline mr-1.5" />Media Asset</label>
          {assetUrl ? (
            <div className="relative rounded-lg overflow-hidden border border-border">
              <img src={assetUrl} alt="Post asset" className="w-full h-40 object-cover" />
              <button
                onClick={() => setAssetUrl(null)}
                className="absolute top-2 right-2 bg-neutral-900/70 text-white rounded-full p-1 hover:bg-neutral-900 transition-colors text-xs px-2"
              >
                Remove
              </button>
            </div>
          ) : (
            <label className="flex flex-col items-center justify-center h-32 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-primary-400 hover:bg-primary-50 transition-colors group">
              <Upload size={20} className="text-muted-foreground group-hover:text-primary-600 transition-colors mb-2" />
              <span className="text-sm text-muted-foreground group-hover:text-primary-600 transition-colors">
                {uploading ? 'Uploading...' : 'Click to upload image or video'}
              </span>
              <input type="file" accept="image/*,video/*" onChange={handleFileUpload} className="hidden" disabled={uploading} />
            </label>
          )}
          {imagePrompt && (
            <p className="text-xs text-muted-foreground mt-1.5 flex items-start gap-1.5">
              <span className="bg-neutral-100 text-neutral-600 px-1.5 py-0.5 rounded text-xs shrink-0">AI Prompt</span>
              {imagePrompt}
            </p>
          )}
        </div>

        <Input
          label="Hook"
          value={hook}
          onChange={e => setHook(e.target.value)}
          placeholder="Attention-grabbing opening line..."
          hint="Max 15 words — this is the first thing viewers read"
        />

        <Textarea
          label="Caption"
          value={caption}
          onChange={e => setCaption(e.target.value)}
          rows={5}
          placeholder="Full post caption..."
        />

        {/* Hashtags */}
        <div className="space-y-2">
          <label className="label"><Hash size={14} className="inline mr-1.5" />Hashtags</label>
          <div className="flex gap-2">
            <input
              className="input flex-1"
              placeholder="#yourbrand"
              value={hashtagInput}
              onChange={e => setHashtagInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addHashtag(); } }}
            />
            <button type="button" onClick={addHashtag} className="btn-secondary shrink-0">Add</button>
          </div>
          {hashtags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 p-2 bg-neutral-50 rounded-lg border border-border">
              {hashtags.map(tag => (
                <TagBadge key={tag} onRemove={() => setHashtags(h => h.filter(t => t !== tag))}>#{tag}</TagBadge>
              ))}
            </div>
          )}
        </div>

        <Input
          label="Scheduled Time (local)"
          type="time"
          value={scheduledTime}
          onChange={e => setScheduledTime(e.target.value)}
          hint="Time will be converted to UTC based on your brand timezone"
        />

        {error && (
          <p className="text-sm text-error-600 bg-error-50 border border-error-200 rounded-md px-3 py-2">{error}</p>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleSave}
            loading={updatePost.isPending}
            icon={<Save size={15} />}
          >
            Save Changes
          </Button>
        </div>
      </div>
    </Modal>
  );
}
