import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { PostCard } from './PostCard';
import { PostCardSkeleton } from './ui/Skeleton';
import type { ContentCalendarPost } from '../types/database';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface Props {
  posts: ContentCalendarPost[];
  loading: boolean;
  onEditPost: (post: ContentCalendarPost) => void;
  onTokenError: () => void;
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

export function CalendarGrid({ posts, loading, onEditPost, onTokenError }: Props) {
  const today = new Date();
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());

  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  const firstDay = getFirstDayOfMonth(currentYear, currentMonth);

  const postsByDay = useMemo(() => {
    const map = new Map<string, ContentCalendarPost[]>();
    posts.forEach(p => {
      const d = new Date(p.post_date);
      if (d.getFullYear() === currentYear && d.getMonth() === currentMonth) {
        const key = d.getDate().toString();
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(p);
      }
    });
    return map;
  }, [posts, currentYear, currentMonth]);

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

  const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;

  return (
    <div>
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
      <div className="grid grid-cols-7 mb-1">
        {DAYS.map(d => (
          <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar cells */}
      <div className="grid grid-cols-7 gap-px bg-border rounded-xl overflow-hidden border border-border">
        {Array.from({ length: totalCells }).map((_, idx) => {
          const dayNum = idx - firstDay + 1;
          const isValid = dayNum >= 1 && dayNum <= daysInMonth;
          const isToday =
            isValid &&
            dayNum === today.getDate() &&
            currentMonth === today.getMonth() &&
            currentYear === today.getFullYear();
          const dayPosts = isValid ? (postsByDay.get(dayNum.toString()) ?? []) : [];

          return (
            <div
              key={idx}
              className={`bg-white min-h-[120px] p-2 ${isValid ? '' : 'bg-neutral-50 opacity-40'}`}
            >
              {isValid && (
                <>
                  <div className={`
                    w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium mb-1.5 transition-colors
                    ${isToday ? 'bg-primary-600 text-white' : 'text-muted-foreground hover:bg-neutral-100'}
                  `}>
                    {dayNum}
                  </div>
                  <div className="space-y-1.5">
                    {loading && idx < 7 ? (
                      <PostCardSkeleton />
                    ) : (
                      dayPosts.map(post => (
                        <PostCard
                          key={post.id}
                          post={post}
                          onEdit={onEditPost}
                          onTokenError={onTokenError}
                        />
                      ))
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
