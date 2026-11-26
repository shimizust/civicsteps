import { Card, Skeleton } from "@/components/ui";

export default function ItemLoading() {
  return (
    <div>
      <Skeleton className="h-4 w-28" />

      <div className="mt-4 flex items-start gap-4">
        <Skeleton className="h-20 w-20 shrink-0 rounded-2xl" />
        <div className="flex-1 space-y-2.5">
          <Skeleton className="h-3.5 w-48" />
          <Skeleton className="h-8 w-5/6" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </div>

      <div className="mt-6 lg:grid lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start lg:gap-8">
        <div className="space-y-6">
          <Card className="space-y-3">
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
            <div className="grid gap-3 pt-2 sm:grid-cols-2">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          </Card>

          <Card className="space-y-3">
            <Skeleton className="h-3.5 w-36" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </Card>
        </div>

        <aside className="mt-8 space-y-4 lg:mt-0">
          <Card className="space-y-3">
            <Skeleton className="h-6 w-44" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-10 w-full" />
          </Card>
          <Card className="space-y-3">
            <Skeleton className="h-3.5 w-32" />
            <div className="flex flex-wrap gap-2">
              <Skeleton className="h-9 w-28" />
              <Skeleton className="h-9 w-24" />
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}
