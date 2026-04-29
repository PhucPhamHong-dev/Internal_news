"use client";

import { X } from "lucide-react";
import { useEffect } from "react";

type ForgotPasswordModalProps = {
  open: boolean;
  onClose: () => void;
};

export function ForgotPasswordModal({ open, onClose }: ForgotPasswordModalProps) {
  useEffect(() => {
    if (!open) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onEscape);
    return () => document.removeEventListener("keydown", onEscape);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/30 px-4 backdrop-blur-sm" onClick={onClose}>
      <section
        className="w-[min(100%,28rem)] rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_30px_80px_-40px_rgba(15,23,42,0.34)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Quên mật khẩu</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">Vui lòng liên hệ Miss Ninh để được cấp lại mật khẩu.</p>
          </div>
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
            onClick={onClose}
            aria-label="Đóng"
          >
            <X size={18} />
          </button>
        </div>
        <div className="mt-6 flex justify-end">
          <button type="button" className="btn-primary px-4 py-2.5 text-sm" onClick={onClose}>
            Đã hiểu
          </button>
        </div>
      </section>
    </div>
  );
}
