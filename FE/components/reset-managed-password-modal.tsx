"use client";

import { Eye, EyeOff, KeyRound, X } from "lucide-react";
import { useState } from "react";

type ResetManagedPasswordModalProps = {
  open: boolean;
  employeeName: string;
  password: string;
  loading: boolean;
  error: string | null;
  onChangePassword: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
};

export function ResetManagedPasswordModal({
  open,
  employeeName,
  password,
  loading,
  error,
  onChangePassword,
  onClose,
  onSubmit
}: ResetManagedPasswordModalProps) {
  const [showPassword, setShowPassword] = useState(false);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] bg-slate-950/28 px-4 py-8 backdrop-blur-sm" onClick={onClose}>
      <div className="mx-auto flex min-h-full items-center justify-center" onClick={(event) => event.stopPropagation()}>
        <div className="w-full max-w-md rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_30px_80px_-40px_rgba(15,23,42,0.28)]">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
                  <KeyRound size={18} />
                </div>
                <h2 className="text-xl font-bold tracking-tight text-slate-900">Cấp lại mật khẩu</h2>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-500">
                Nhập mật khẩu tạm thời cho nhân viên. Nhân viên sẽ dùng mật khẩu này để đăng nhập.
              </p>
              <p className="mt-2 text-sm font-medium text-slate-700">{employeeName}</p>
            </div>
            <button
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
              onClick={onClose}
              aria-label="Đóng"
            >
              <X size={18} />
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-600">Mật khẩu tạm thời</label>
              <div className="theme-primary-focus flex items-center rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 focus-within:bg-white">
                <input
                  className="w-full bg-transparent text-slate-900 outline-none placeholder:text-slate-400"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => onChangePassword(event.target.value)}
                  placeholder="Nhập mật khẩu tạm thời"
                />
                <button
                  type="button"
                  className="ml-3 text-slate-400 transition hover:text-slate-600"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

            <div className="flex justify-end gap-3 pt-2">
              <button className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50" onClick={onClose}>
                Hủy
              </button>
              <button
                className="btn-primary px-4 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-45"
                disabled={loading || !password.trim()}
                onClick={onSubmit}
              >
                {loading ? "Đang cập nhật..." : "Xác nhận cấp lại"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
