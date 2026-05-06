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
  onDeletePost: (post: ContentCalendarPost) => void;
  onMoveToDrafts: (post: ContentCalendarPost) => void;
  onPostScheduled?: (post: ContentCalendarPost) => void;
  onTokenError: () => void;
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

export function CalendarGrid({ posts, loading, onEditPost, onDeletePost, onMoveToDrafts, onPostScheduled, onTokenError }: Props) {
  const today = new Date();
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());

  // compute monthly scheduled/published count for current month
  const monthlyScheduledCount = posts.filter(p => {
    const d = new Date(p.post_date);
    return d.getFullYear() === currentYear && d.getMonth() === currentMonth && (p.status === 'scheduled' || p.status === 'published');
  }).length;
  const MONTHLY_LIMIT = 30;
  const remainingMonthlySlots = Math.max(0, MONTHLY_LIMIT - monthlyScheduledCount);

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

  // Build weeks array: each element is an array of day numbers for that week
  const weeks: (number | null)[][] = [];
  let currentWeek: (number | null)[] = Array(firstDay).fill(null);
  for (let day = 1; day <= daysInMonth; day++) {
    currentWeek.push(day);
    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }
  if (currentWeek.length > 0) {
    while (currentWeek.length < 7) currentWeek.push(null);
    weeks.push(currentWeek);
  }

  // Restructure: for each day of week (0-6), collect all dates from all weeks
  const dayOfWeekRows = DAYS.map((_, dayOfWeek) => {
    return weeks.map(week => week[dayOfWeek] ?? null);
  });

  return (
    <div>
      {/* Month navigation */}
      <div className="flex items-center justify-between mb-6">
        <button onClick={prevMonth} className="p-1.5 rounded-md hover:bg-neutral-100 transition-colors text-neutral-600">
          <ChevronLeft size={18} />
        </button>
        <h3 className="text-base font-semibold text-foreground">{monthLabel}</h3>
        <button onClick={nextMonth} className="p-1.5 rounded-md hover:bg-neutral-100 transition-colors text-neutral-600">
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Day-of-week oriented calendar */}
      <div className="space-y-3">
        {dayOfWeekRows.map((dateCells, dayOfWeek) => (
          <div key={dayOfWeek} className="flex items-stretch gap-3">
            {/* Day label */}
            <div className="w-16 flex items-center">
              <span className="text-sm font-semibold text-foreground">{DAYS[dayOfWeek]}</span>
            </div>

            {/* Date cells for this day of week */}
            <div className="flex gap-3 flex-1">
              {dateCells.map((dayNum, weekIdx) => {
                const isValid = dayNum !== null;
                const isToday =
                  isValid &&
                  dayNum === today.getDate() &&
                  currentMonth === today.getMonth() &&
                  currentYear === today.getFullYear();
                const dayPosts = isValid && dayNum ? (postsByDay.get(dayNum.toString()) ?? []) : [];

                return (
                  <div
                    key={`${dayOfWeek}-${weekIdx}`}
                    className={`flex-1 rounded-lg border p-3 ${isValid ? 'bg-white border-border' : 'bg-neutral-50 border-transparent opacity-40'}`}
                  >
                    {isValid && dayNum && (
                      <>
                        <div className={`
                          w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold mb-2.5 transition-colors mx-auto
                          ${isToday ? 'bg-primary-600 text-white' : 'text-muted-foreground hover:bg-neutral-100'}
                        `}>
                          {dayNum}
                        </div>
                        <div className="space-y-2 max-h-[350px] overflow-y-auto">
                          {loading && dayOfWeek === 0 && weekIdx === 0 ? (
                            <PostCardSkeleton />
                          ) : dayPosts.length > 0 ? (
                            dayPosts.map(post => (
                              <PostCard
                                key={post.id}
                                post={post}
                                onEdit={onEditPost}
                                onDelete={onDeletePost}
                                onMoveToDrafts={onMoveToDrafts}
                                onPostScheduled={onPostScheduled}
                                onTokenError={onTokenError}
                                onOpen={onEditPost}
                                remainingMonthlySlots={remainingMonthlySlots}
                              />
                            ))
                          ) : (
                            <p className="text-xs text-muted-foreground text-center py-1">—</p>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
