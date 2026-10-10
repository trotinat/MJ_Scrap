/** Shown instantly while a page's data loads. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Chargement">
      <div className="h-8 w-56 animate-pulse rounded-lg bg-paper-line" />
      <div className="mt-2 h-4 w-80 max-w-full animate-pulse rounded bg-paper-line/70" />
      <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="overflow-hidden rounded-2xl border border-paper-line bg-paper-card">
            <div className="aspect-square animate-pulse bg-paper" />
            <div className="space-y-2 p-3">
              <div className="h-3 w-3/4 animate-pulse rounded bg-paper-line" />
              <div className="h-6 w-1/2 animate-pulse rounded bg-tag-soft" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
