export default function AppLoading() {
  return (
    <main className="mx-auto w-full max-w-[820px] px-3 py-4 sm:px-4 lg:ml-[116px] lg:mr-auto lg:px-6 lg:py-6">
      <div className="mb-6 h-14 animate-pulse rounded-[28px] bg-slate-100" />
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="card animate-pulse px-6 py-6">
            <div className="flex gap-4">
              <div className="h-12 w-12 rounded-full bg-slate-200" />
              <div className="flex-1 space-y-3">
                <div className="h-4 w-40 rounded-full bg-slate-200" />
                <div className="h-6 w-2/3 rounded-full bg-slate-200" />
                <div className="space-y-2">
                  <div className="h-4 w-full rounded-full bg-slate-100" />
                  <div className="h-4 w-5/6 rounded-full bg-slate-100" />
                </div>
                <div className="h-56 rounded-[28px] bg-slate-100" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
