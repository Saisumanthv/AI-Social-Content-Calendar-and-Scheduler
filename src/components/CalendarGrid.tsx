import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { PostCard } from './PostCard';
import { PostCardSkeleton } from './ui/Skeleton';
import type { ContentCalendarPost } from '../types/database';


interface Props {
  posts: ContentCalendarPost[];
  brandTimezone: string;
  loading: boolean;
  onEditPost: (post: ContentCalendarPost) => void;
  onTokenError: () => void;
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

export function CalendarGrid({ posts, brandTimezone, loading, onEditPost, onTokenError }: Props) {
  const today = new Date();
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());

  const daysInMonth = getDaysInMonth(currentYear, currentMonth);

  const postsByDay = useMemo(() => {
    const map = new Map<string, ContentCalendarPost[]>();
    posts.forEach(p => {
      try {
        const formatter = new Intl.DateTimeFormat('en-US', {
          timeZone: brandTimezone || 'UTC',
          year: 'numeric',
          month: 'numeric',
          day: 'numeric',
        });
        const parts = formatter.formatToParts(new Date(p.post_date));
        const partValues: Record<string, string> = {};
        parts.forEach(part => {
          partValues[part.type] = part.value;
        });

        const year = Number(partValues.year);
        const month = Number(partValues.month) - 1; // 0-indexed month
        const day = Number(partValues.day);

        if (year === currentYear && month === currentMonth) {
          const key = day.toString();
          if (!map.has(key)) map.set(key, []);
          map.get(key)!.push(p);
        }
      } catch (err) {
        console.error('Failed to parse post date in brand timezone:', err);
        const d = new Date(p.post_date);
        if (d.getFullYear() === currentYear && d.getMonth() === currentMonth) {
          const key = d.getDate().toString();
          if (!map.has(key)) map.set(key, []);
          map.get(key)!.push(p);
        }
      }
    });
    return map;
  }, [posts, currentYear, currentMonth, brandTimezone]);

  function prevMonth() {
    if (currentMonth === 0) { setCurrentYear(y => y - 1); setCurrentMonth(11); }
    else setCurrentMonth(m => m - 1);
  }

  function nextMonth() {
    if (currentMonth === 11) { setCurrentYear(y => y + 1); setCurrentMonth(0); }
    else setCurrentMonth(m => m + 1);
  }

  const monthLabel = new Date(currentYear, currentMonth).toLocaleDateString('en-US', {
    month: 'long', year: 'numeric',
  });

  const monthDays = Array.from({ length: daysInMonth }, (_, index) => index + 1);

  return (
    <div className="max-w-2xl mx-auto">
      {/* Month navigation */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={prevMonth} className="p-1.5 rounded-md hover:bg-neutral-100 transition-colors text-neutral-600">
          <ChevronLeft size={18} />
        </button>
        <h3 className="text-base font-semibold text-foreground">{monthLabel}</h3>
        <button onClick={nextMonth} className="p-1.5 rounded-md hover:bg-neutral-100 transition-colors text-neutral-600">
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Day headers */}
      <div className="space-y-3">
        {monthDays.map(dayNum => {
          const date = new Date(currentYear, currentMonth, dayNum);
          const isToday =
            dayNum === today.getDate() &&
            currentMonth === today.getMonth() &&
            currentYear === today.getFullYear();
          const dayPosts = postsByDay.get(dayNum.toString()) ?? [];
          const dayLabel = date.toLocaleDateString('en-US', { weekday: 'short' });

          return (
            <div key={dayNum} className="grid grid-cols-[72px_72px_1fr] gap-4 items-start">
              <div className="pt-4 text-left text-lg font-medium text-foreground">
                {dayLabel}
              </div>

              <div className="rounded-2xl border border-border bg-white px-4 py-3 min-h-[72px] flex items-center justify-center">
                <div className={`w-12 h-12 rounded-2xl border flex items-center justify-center text-xl font-medium ${isToday ? 'bg-primary-600 text-white border-primary-600' : 'text-foreground border-border'}`}>
                  {dayNum}
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-white px-4 py-3 min-h-[72px]">
                <div className="space-y-2">
                  {loading && dayNum === 1 ? (
                    <PostCardSkeleton />
                  ) : (
                    dayPosts.length > 0 ? dayPosts.map(post => (
                      <PostCard
                        key={post.id}
                        post={post}
                        onEdit={onEditPost}
                        onTokenError={onTokenError}
                      />
                    )) : (
                      <div className="text-xs text-muted-foreground">No posts</div>
                    )
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
