export default function PostDetailLoading() {
  return (
    <main className="min-h-screen px-3 py-4 sm:px-4 lg:px-6 lg:py-6">
      <div className="mx-auto max-w-[780px] lg:ml-[116px] lg:mr-auto">
        <div className="mb-4 h-10 w-36 animate-pulse rounded-2xl bg-slate-200" />
        <div className="card animate-pulse px-6 py-6">
          <div className="flex gap-4">
            <div className="h-12 w-12 rounded-full bg-slate-200" />
            <div className="flex-1 space-y-3">
              <div className="h-4 w-40 rounded-full bg-slate-200" />
              <div className="h-7 w-3/4 rounded-full bg-slate-200" />
              <div className="space-y-2">
                <div className="h-4 w-full rounded-full bg-slate-100" />
                <div className="h-4 w-5/6 rounded-full bg-slate-100" />
                <div className="h-4 w-3/5 rounded-full bg-slate-100" />
              </div>
            </div>
          </div>
        </div>
        <div className="card mt-4 animate-pulse px-6 py-6">
          <div className="mb-4 h-5 w-28 rounded-full bg-slate-200" />
          <div className="space-y-4">
            <div className="h-20 rounded-[24px] bg-slate-100" />
            <div className="h-20 rounded-[24px] bg-slate-100" />
          </div>
        </div>
      </div>
    </main>
  );
}
