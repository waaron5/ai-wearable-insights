import { Skeleton } from "@/components/ui/skeleton";

export default function ChatLoading() {
  return (
    <div className="flex h-[calc(100vh-12rem)] md:h-[calc(100vh-8rem)] gap-0 overflow-hidden rounded-xl border bg-card">
      {/* Sidebar skeleton */}
      <aside className="hidden w-64 shrink-0 border-r md:flex md:flex-col">
        <div className="p-3">
          <Skeleton className="h-9 w-full rounded-md" />
        </div>
        <div className="space-y-2 p-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      </aside>

      {/* Main area skeleton */}
      <div className="flex flex-1 flex-col min-w-0">
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <Skeleton className="h-5 w-5 rounded-full" />
          <Skeleton className="h-4 w-36" />
          <div className="flex-1" />
          <Skeleton className="h-5 w-24 rounded-full" />
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-3">
            <Skeleton className="h-16 w-16 rounded-2xl mx-auto" />
            <Skeleton className="h-5 w-48 mx-auto" />
            <Skeleton className="h-4 w-64 mx-auto" />
          </div>
        </div>
        <div className="border-t p-3">
          <div className="flex gap-2">
            <Skeleton className="h-11 flex-1 rounded-md" />
            <Skeleton className="h-11 w-11 rounded-md" />
          </div>
        </div>
      </div>
    </div>
  );
}
