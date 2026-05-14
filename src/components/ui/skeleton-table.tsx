import { Skeleton } from "@/components/ui/skeleton";

interface SkeletonTableProps {
  rows?: number;
  columns?: number;
}

export function SkeletonTable({ rows = 8, columns = 5 }: SkeletonTableProps) {
  return (
    <div className="space-y-3 p-4">
      {/* Header skeleton */}
      <div className="flex gap-4 pb-2 border-b border-border/50">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton
            key={`h-${i}`}
            className="h-4 rounded"
            style={{ width: `${Math.random() * 60 + 60}px` }}
          />
        ))}
      </div>
      {/* Row skeletons */}
      {Array.from({ length: rows }).map((_, rowIdx) => (
        <div
          key={rowIdx}
          className="flex items-center gap-4 py-2"
          style={{ animationDelay: `${rowIdx * 75}ms` }}
        >
          {/* Avatar */}
          <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" />
          {/* Columns */}
          {Array.from({ length: columns - 1 }).map((_, colIdx) => (
            <Skeleton
              key={colIdx}
              className="h-4 rounded"
              style={{
                width: `${60 + Math.random() * 80}px`,
                animationDelay: `${(rowIdx * columns + colIdx) * 30}ms`,
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

interface SkeletonCardsProps {
  count?: number;
}

export function SkeletonCards({ count = 6 }: SkeletonCardsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-lg border bg-card p-5 space-y-3"
          style={{ animationDelay: `${i * 100}ms` }}
        >
          <Skeleton className="h-5 w-3/4 rounded" />
          <div className="space-y-2">
            <Skeleton className="h-3 w-1/2 rounded" />
            <Skeleton className="h-3 w-1/3 rounded" />
          </div>
          <Skeleton className="h-2 w-full rounded-full" />
        </div>
      ))}
    </div>
  );
}
