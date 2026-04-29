"use client";

import { AlertCircle, X } from "lucide-react";

type GoogleLoginDeniedModalProps = {
  open: boolean;
  message: string;
  onClose: () => void;
};

export function GoogleLoginDeniedModal({ open, message, onClose }: GoogleLoginDeniedModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4 backdrop-blur-sm" onClick={onClose}>
      <section
        className="w-full max-w-[420px] rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_30px_80px_-40px_rgba(15,23,42,0.32)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-red-50 text-red-600">
              <AlertCircle size={18} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Không thể đăng nhập bằng Google</h2>
            </div>
          </div>
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
            onClick={onClose}
            aria-label="Đóng thông báo"
          >
            <X size={18} />
          </button>
        </div>

        <p className="mt-4 text-sm leading-6 text-slate-600">{message}</p>

        <div className="mt-6 flex justify-end">
          <button type="button" className="btn-primary px-4 py-2.5 text-sm" onClick={onClose}>
            Đã hiểu
          </button>
        </div>
      </section>
    </div>
  );
}
