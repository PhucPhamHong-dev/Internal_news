"use client";

import { Eye, EyeOff, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { apiRequest } from "./api";

type ChangePasswordModalProps = {
  open: boolean;
  token: string | null;
  onClose: () => void;
};

export function ChangePasswordModal({ open, token, onClose }: ChangePasswordModalProps) {
  const [mounted, setMounted] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose, open]);

  useEffect(() => {
    if (open) return;
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setPasswordError(null);
    setPasswordSaved(false);
    setSaving(false);
    setShowCurrent(false);
    setShowNext(false);
    setShowConfirm(false);
  }, [open]);

  if (!mounted || !open) return null;

  const submit = async () => {
    if (!token || saving) return;

    if (newPassword.length < 6) {
      setPasswordError("Mật khẩu mới phải có ít nhất 6 ký tự.");
      setPasswordSaved(false);
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError("Mật khẩu xác nhận không khớp.");
      setPasswordSaved(false);
      return;
    }

    setPasswordError(null);
    setPasswordSaved(false);
    setSaving(true);

    try {
      await apiRequest("/auth/change-password", token, "POST", { currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordSaved(true);
    } catch (error) {
      setPasswordError(error instanceof Error ? error.message : "Không thể đổi mật khẩu");
    } finally {
      setSaving(false);
    }
  };

  const passwordFields = [
    { key: "current", value: currentPassword, setValue: setCurrentPassword, shown: showCurrent, setShown: setShowCurrent, placeholder: "Mật khẩu hiện tại" },
    { key: "next", value: newPassword, setValue: setNewPassword, shown: showNext, setShown: setShowNext, placeholder: "Mật khẩu mới" },
    { key: "confirm", value: confirmPassword, setValue: setConfirmPassword, shown: showConfirm, setShown: setShowConfirm, placeholder: "Xác nhận mật khẩu mới" }
  ] as const;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/35 px-4 backdrop-blur-sm" onClick={onClose}>
      <section
        className="flex max-h-[90vh] w-[min(100%,30rem)] flex-col overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_32px_90px_-42px_rgba(15,23,42,0.34)]"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="change-password-title"
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
          <div className="min-w-0">
            <h2 id="change-password-title" className="text-2xl font-bold tracking-tight text-slate-900">
              Đổi mật khẩu
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">Mật khẩu này dùng cho phương thức đăng nhập bằng mã nhân viên.</p>
          </div>
          <button
            type="button"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
            onClick={onClose}
            aria-label="Đóng modal đổi mật khẩu"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="space-y-3">
            {passwordFields.map((field) => (
              <div key={field.key} className="theme-primary-focus flex items-center rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 focus-within:bg-white">
                <input
                  className="w-full bg-transparent text-sm outline-none"
                  type={field.shown ? "text" : "password"}
                  value={field.value}
                  onChange={(event) => field.setValue(event.target.value)}
                  placeholder={field.placeholder}
                />
                <button
                  type="button"
                  className="ml-3 text-slate-400 transition hover:text-[color:var(--primary)]"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => field.setShown((value) => !value)}
                  aria-label={field.shown ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                >
                  {field.shown ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            ))}
          </div>

          {passwordError ? <p className="mt-4 text-sm text-red-600">{passwordError}</p> : null}
          {passwordSaved ? <p className="mt-4 text-sm text-emerald-600">Đã đổi mật khẩu.</p> : null}
        </div>

        <div className="sticky bottom-0 flex justify-end gap-3 border-t border-slate-100 bg-white px-6 py-4">
          <button
            type="button"
            className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
            onClick={onClose}
          >
            Đóng
          </button>
          <button
            type="button"
            className="btn-primary px-4 py-2.5 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!token || !currentPassword || !newPassword || !confirmPassword || saving}
            onClick={() => void submit()}
          >
            {saving ? "Đang lưu..." : "Lưu"}
          </button>
        </div>
      </section>
    </div>,
    document.body
  );
}
