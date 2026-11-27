import { Card, Skeleton } from "@/components/ui";

export default function FavoritesLoading() {
  return (
    <div>
      <div className="mb-6 space-y-2">
        <Skeleton className="h-9 w-52" />
        <Skeleton className="h-5 w-96 max-w-full" />
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-9 w-24 rounded-full" />
        ))}
      </div>

      <Skeleton className="mb-3 mt-8 h-6 w-44" />
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="flex gap-4">
            <Skeleton className="h-14 w-14 shrink-0 rounded-xl" />
            <div className="flex-1 space-y-2.5">
              <Skeleton className="h-3.5 w-44" />
              <Skeleton className="h-6 w-4/5" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-3.5 w-2/3" />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
