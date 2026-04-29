"use client";

import { X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "./api";
import { REACTION_OPTIONS, ReactionType } from "./post-shared";

type ReactionSummaryResponse = {
  postId: string;
  total: number;
  counts: Partial<Record<ReactionType, number>>;
};

type ReactionSummaryModalProps = {
  open: boolean;
  postId: string;
  token: string;
  onClose: () => void;
};

export function ReactionSummaryModal({ open, postId, token, onClose }: ReactionSummaryModalProps) {
  const [summary, setSummary] = useState<ReactionSummaryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    void apiRequest<ReactionSummaryResponse>(`/posts/${postId}/reactions/summary`, token, "GET", undefined, {
      signal: controller.signal
    })
      .then((response) => {
        setSummary(response);
      })
      .catch((requestError) => {
        if (controller.signal.aborted) return;
        setError(requestError instanceof Error ? requestError.message : "Không thể tải thống kê cảm xúc");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [open, postId, token]);

  useEffect(() => {
    if (!open) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose, open]);

  const visibleCounts = useMemo(() => {
    const counts = summary?.counts ?? {};
    return REACTION_OPTIONS.map((reaction) => ({
      ...reaction,
      count: counts[reaction.type] ?? 0
    })).filter((reaction) => reaction.count > 0);
  }, [summary?.counts]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] bg-slate-950/32 px-4 py-8 backdrop-blur-sm" onClick={onClose}>
      <div
        className="mx-auto flex min-h-full items-center justify-center"
        onClick={(event) => event.stopPropagation()}
      >
        <section className="w-full max-w-[420px] rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_30px_80px_-40px_rgba(15,23,42,0.3)]">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold tracking-tight text-slate-900">Thống kê cảm xúc</h2>
            </div>
            <button
              className="icon-btn theme-primary-border-hover h-10 w-10 rounded-full border border-slate-200 bg-white hover:bg-[color:var(--app-accent-faint)] hover:text-[color:var(--app-accent)]"
              onClick={onClose}
              aria-label="Đóng thống kê cảm xúc"
            >
              <X size={18} />
            </button>
          </div>

          {loading ? (
            <div className="space-y-3 animate-pulse">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="h-[58px] rounded-[18px] bg-slate-100" />
              ))}
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          ) : (summary?.total ?? 0) === 0 ? (
            <div className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-5 text-center text-sm text-slate-500">
              Chưa có cảm xúc nào.
            </div>
          ) : (
            <div className="space-y-3">
              {visibleCounts.map((reaction) => (
                <div key={reaction.type} className="flex items-center justify-between rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="flex items-center gap-3 text-slate-800">
                    <span className="text-xl leading-none">{reaction.icon}</span>
                    <span className="text-sm font-medium">{reaction.label}</span>
                  </div>
                  <span className="text-sm font-bold text-slate-900">{reaction.count}</span>
                </div>
              ))}
            </div>
          )}

          <div className="mt-5 border-t border-slate-100 pt-4 text-sm font-semibold text-slate-700">
            Tổng cộng: {summary?.total ?? 0} lượt cảm xúc
          </div>
        </section>
      </div>
    </div>
  );
}
