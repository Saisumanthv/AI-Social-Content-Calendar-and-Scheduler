interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className = '' }: SkeletonProps) {
  return (
    <div
      className={`shimmer rounded-md ${className}`}
      aria-hidden="true"
    />
  );
}

export function PostCardSkeleton() {
  return (
    <div className="bg-white rounded-lg border border-border p-3 space-y-2 animate-fade-in">
      <Skeleton className="h-3 w-16" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-3 w-3/4" />
      <div className="flex gap-1.5 pt-1">
        <Skeleton className="h-5 w-14 rounded-full" />
        <Skeleton className="h-5 w-12 rounded-full" />
      </div>
    </div>
  );
}

export function CalendarSkeleton() {
  return (
    <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
      {Array.from({ length: 35 }).map((_, i) => (
        <div key={i} className="bg-white p-2 min-h-[100px]">
          <Skeleton className="h-4 w-6 mb-2" />
          {i % 3 === 0 && <PostCardSkeleton />}
        </div>
      ))}
    </div>
  );
}
