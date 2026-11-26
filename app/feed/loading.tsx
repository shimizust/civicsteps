import { Card, Skeleton } from "@/components/ui";

export default function FeedLoading() {
  return (
    <div>
      <div className="mb-6 space-y-2">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-5 w-80 max-w-full" />
      </div>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start lg:gap-8">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-1.5">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-9 w-24 rounded-full" />
            ))}
          </div>

          <Skeleton className="mt-6 h-6 w-28" />
          {[1, 2, 3].map((i) => (
            <Card key={i} className="flex gap-4">
              <Skeleton className={i === 1 ? "h-20 w-20 shrink-0 rounded-2xl" : "h-14 w-14 shrink-0 rounded-xl"} />
              <div className="flex-1 space-y-2.5">
                <Skeleton className="h-3.5 w-40" />
                <Skeleton className="h-6 w-4/5" />
                <Skeleton className="h-4 w-full" />
                <div className="flex gap-2 pt-1">
                  <Skeleton className="h-6 w-24 rounded-full" />
                  <Skeleton className="h-6 w-24 rounded-full" />
                </div>
              </div>
            </Card>
          ))}
        </div>

        <aside className="mt-8 space-y-4 lg:mt-0">
          <Card className="hidden space-y-3 lg:block">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-6 w-36" />
            <Skeleton className="h-2 w-full rounded-full" />
            <Skeleton className="h-4 w-44" />
          </Card>
          <Card className="space-y-3">
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="h-5 w-full" />
            <div className="flex gap-2">
              <Skeleton className="h-8 w-20 rounded-full" />
              <Skeleton className="h-8 w-20 rounded-full" />
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}
