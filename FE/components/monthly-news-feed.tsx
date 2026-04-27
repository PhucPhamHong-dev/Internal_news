"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CalendarDays, Eye, Heart, MessageCircle, X } from "lucide-react";
import { useMemo, useState } from "react";

type NewsItem = {
  id: string;
  title: string;
  excerpt: string;
  imageUrl: string;
  createdAt: string;
  likeCount: number;
  commentCount: number;
  viewCount: number;
};

type ArchiveData = Array<{
  year: number;
  monthsWithPosts: number[];
}>;

type MonthlyNewsFeedProps = {
  items: NewsItem[];
  archive: ArchiveData;
};

const MONTH_LABELS = ["T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8", "T9", "T10", "T11", "T12"];

function ArchiveWidget({
  archive,
  selectedYear,
  selectedMonth,
  onSelectYear,
  onSelectMonth
}: {
  archive: ArchiveData;
  selectedYear: number;
  selectedMonth: number;
  onSelectYear: (year: number) => void;
  onSelectMonth: (month: number) => void;
}) {
  const activeYear = archive.find((item) => item.year === selectedYear) ?? archive[0] ?? null;
  const currentMonth = new Date().getMonth() + 1;
  const currentYear = new Date().getFullYear();

  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h3 className="text-sm font-bold uppercase tracking-[0.18em] text-slate-400">Lưu trữ</h3>
        <p className="mt-1 text-sm text-slate-500">Tìm bản tin theo từng tháng trong năm.</p>
      </div>

      <select
        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-[color:var(--app-accent)] focus:bg-white"
        value={selectedYear}
        onChange={(event) => onSelectYear(Number(event.target.value))}
      >
        {archive.map((item) => (
          <option key={item.year} value={item.year}>
            {item.year}
          </option>
        ))}
      </select>

      <div className="mt-4 grid grid-cols-3 gap-2">
        {MONTH_LABELS.map((label, index) => {
          const month = index + 1;
          const hasPosts = activeYear?.monthsWithPosts.includes(month) ?? false;
          const isCurrent = selectedYear === currentYear && month === currentMonth;
          const isSelected = selectedMonth === month;

          return (
            <button
              key={label}
              className={`rounded-2xl px-3 py-3 text-sm font-semibold transition ${
                isSelected || isCurrent
                  ? "text-white shadow-sm"
                  : hasPosts
                    ? "bg-slate-50 text-slate-900 hover:bg-slate-100"
                    : "bg-slate-50 text-slate-300"
              }`}
              style={isSelected || isCurrent ? { background: "linear-gradient(135deg, var(--app-accent), color-mix(in srgb, var(--app-accent) 78%, black))" } : undefined}
              onClick={() => onSelectMonth(month)}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function MonthlyNewsFeed({ items, archive }: MonthlyNewsFeedProps) {
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [mobileArchiveOpen, setMobileArchiveOpen] = useState(false);

  const visibleItems = useMemo(() => {
    return items.filter((item) => {
      const date = new Date(item.createdAt);
      return date.getFullYear() === selectedYear && date.getMonth() + 1 === selectedMonth;
    });
  }, [items, selectedMonth, selectedYear]);

  return (
    <div className="relative grid gap-6 md:grid-cols-[minmax(0,7fr)_minmax(280px,3fr)]">
      <section>
        <div className="mb-5">
          <h1 className="text-3xl font-black tracking-tight text-slate-900">Bản tin tháng {selectedMonth}/{selectedYear}</h1>
          <p className="mt-2 text-sm text-slate-500">Danh sách bài viết theo tháng, ưu tiên dễ đọc và dễ tra cứu lại.</p>
        </div>

        <div className="space-y-4">
          {visibleItems.map((item) => (
            <article key={item.id} className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
              <div className="relative h-56 w-full overflow-hidden bg-slate-100">
                <img src={item.imageUrl} alt={item.title} className="h-full w-full object-cover" />
              </div>
              <div className="px-5 py-5">
                <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
                  {new Date(item.createdAt).toLocaleDateString("vi-VN")}
                </div>
                <h2 className="mt-2 text-2xl font-bold leading-tight text-slate-900">{item.title}</h2>
                <p className="mt-3 text-sm leading-7 text-slate-600">{item.excerpt}</p>
                <div className="mt-5 flex items-center gap-5 text-sm text-slate-500">
                  <span className="inline-flex items-center gap-2"><Heart size={18} /> {item.likeCount}</span>
                  <span className="inline-flex items-center gap-2"><MessageCircle size={18} /> {item.commentCount}</span>
                  <span className="inline-flex items-center gap-2"><Eye size={18} /> {item.viewCount}</span>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <aside className="hidden md:block">
        <div className="sticky top-24">
          <ArchiveWidget
            archive={archive}
            selectedYear={selectedYear}
            selectedMonth={selectedMonth}
            onSelectYear={setSelectedYear}
            onSelectMonth={setSelectedMonth}
          />
        </div>
      </aside>

      <button
        className="fixed bottom-24 right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg md:hidden"
        style={{ background: "linear-gradient(135deg, var(--app-accent), color-mix(in srgb, var(--app-accent) 78%, black))" }}
        onClick={() => setMobileArchiveOpen(true)}
        aria-label="Mở lưu trữ theo tháng"
      >
        <CalendarDays size={24} />
      </button>

      <AnimatePresence>
        {mobileArchiveOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-slate-900/25 md:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileArchiveOpen(false)}
            />
            <motion.div
              className="fixed inset-x-0 bottom-0 z-50 rounded-t-[32px] border-t border-slate-200 bg-white p-4 shadow-[0_-18px_50px_-30px_rgba(15,23,42,0.3)] md:hidden"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 360, damping: 34 }}
            >
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <div className="text-sm font-bold uppercase tracking-[0.16em] text-slate-400">Lưu trữ</div>
                  <div className="mt-1 text-lg font-bold text-slate-900">Chọn tháng bản tin</div>
                </div>
                <button className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-500" onClick={() => setMobileArchiveOpen(false)}>
                  <X size={18} />
                </button>
              </div>

              <ArchiveWidget
                archive={archive}
                selectedYear={selectedYear}
                selectedMonth={selectedMonth}
                onSelectYear={setSelectedYear}
                onSelectMonth={(month) => {
                  setSelectedMonth(month);
                  setMobileArchiveOpen(false);
                }}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
