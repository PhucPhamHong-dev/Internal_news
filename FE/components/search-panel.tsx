"use client";

import { Clock3, Image as ImageIcon, Search, X } from "lucide-react";

export type SearchPreview = {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  thumbnailUrl: string | null;
  thumbnailType: "IMAGE" | "VIDEO" | null;
};

type SearchPanelProps = {
  open: boolean;
  query: string;
  onChangeQuery: (value: string) => void;
  onClose: () => void;
  suggestions: SearchPreview[];
  onPick: (item: SearchPreview) => void;
};

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function formatSearchTime(createdAt: string) {
  const date = new Date(createdAt);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const hour = 60 * 60 * 1000;
  const day = 24 * hour;

  if (diffMs < hour) {
    const minutes = Math.max(1, Math.floor(diffMs / (60 * 1000)));
    return `${minutes} phút trước`;
  }

  if (diffMs < day) {
    const hours = Math.max(1, Math.floor(diffMs / hour));
    return `${hours} giờ trước`;
  }

  if (date.getFullYear() === now.getFullYear()) {
    return `${date.getDate()}/${date.getMonth() + 1}`;
  }

  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

function getExcerpt(content: string) {
  const trimmed = content.trim().replace(/\s+/g, " ");
  if (!trimmed) return "Bài viết chưa có nội dung mô tả.";
  return trimmed.length > 120 ? `${trimmed.slice(0, 120)}...` : trimmed;
}

export function SearchPanel({ open, query, onChangeQuery, onClose, suggestions, onPick }: SearchPanelProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 bg-slate-900/18 p-4 backdrop-blur-sm" onClick={onClose}>
      <section
        className="mx-auto mt-4 w-full max-w-4xl overflow-hidden rounded-[32px] border border-slate-200 bg-white text-slate-900 shadow-[0_30px_80px_-40px_rgba(15,23,42,0.3)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-6">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Tìm kiếm</h2>
            <p className="mt-1 text-sm text-slate-500">Tìm theo tiêu đề hoặc nội dung bài viết nội bộ.</p>
          </div>
          <button
            className="icon-btn h-10 w-10 rounded-full border border-slate-200 bg-white hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600"
            onClick={onClose}
            aria-label="Đóng"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 sm:p-6">
          <div className="mb-5 flex items-center gap-3 rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-3 shadow-sm focus-within:border-blue-300 focus-within:bg-white">
            <Search size={18} className="text-slate-400" />
            <input
              value={query}
              onChange={(event) => onChangeQuery(event.target.value)}
              placeholder="Tìm kiếm bài viết"
              className="w-full bg-transparent text-base text-slate-900 outline-none placeholder:text-slate-400"
            />
          </div>

          <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white">
            {suggestions.length === 0 ? (
              <div className="p-6 text-sm text-slate-500">Chưa có kết quả phù hợp.</div>
            ) : (
              suggestions.map((item, index) => (
                <button
                  key={item.id}
                  className={`flex w-full items-start gap-4 px-5 py-4 text-left transition hover:bg-blue-50/60 sm:px-6 ${
                    index < suggestions.length - 1 ? "border-b border-slate-100" : ""
                  }`}
                  onClick={() => {
                    onPick(item);
                    onClose();
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500">
                      <span className="inline-flex items-center gap-1">
                        <Clock3 size={12} />
                        {formatSearchTime(item.createdAt)}
                      </span>
                      {item.thumbnailUrl && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-blue-600">Có media</span>}
                    </div>
                    <div className="mt-2 text-[15px] font-semibold leading-6 text-slate-900">{item.title}</div>
                    <div className="mt-1 text-sm leading-6 text-slate-500">{getExcerpt(item.content)}</div>
                  </div>

                  {item.thumbnailUrl ? (
                    <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-sm">
                      {item.thumbnailType === "VIDEO" ? (
                        <video src={item.thumbnailUrl} className="h-full w-full object-cover" muted />
                      ) : (
                        <img src={item.thumbnailUrl} alt={item.title} className="h-full w-full object-cover" />
                      )}
                    </div>
                  ) : (
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-slate-400">
                      <ImageIcon size={18} />
                    </div>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
