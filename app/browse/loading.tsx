import { Card, Skeleton } from "@/components/ui";

export default function BrowseLoading() {
  return (
    <div>
      <div className="mb-6 space-y-2">
        <Skeleton className="h-9 w-52" />
        <Skeleton className="h-5 w-96 max-w-full" />
      </div>

      <div className="flex gap-2">
        <Skeleton className="h-10 flex-1" />
        <Skeleton className="h-10 w-24" />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-9 w-48 rounded-full" />
        <Skeleton className="h-9 w-40" />
      </div>

      <Skeleton className="mb-3 mt-6 h-4 w-28" />
      <div className="space-y-2.5">
        {[1, 2, 3, 4, 5].map((i) => (
          <Card key={i} className="flex gap-3.5 !p-4">
            <Skeleton className="h-10 w-10 shrink-0 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-44" />
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-full" />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
