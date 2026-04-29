"use client";

import { KeyRound, LogOut, Shield, UserRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Profile } from "./auth-store";
import { ChangePasswordModal } from "./change-password-modal";

type AccountMenuProps = {
  profile: Profile;
  token: string | null;
  onLogout: () => void;
  onOpenAdmin?: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

function roleLabel(role: Profile["role"]) {
  if (role === "ADMIN") return "Quản trị viên";
  return "Nhân viên";
}

function permissionSummary(profile: Profile) {
  if (profile.role === "ADMIN") return "Toàn quyền quản trị";
  if (profile.canPost && profile.canManageEmployees) return "Biên tập viên, Quản lý nhân sự";
  if (profile.canPost) return "Biên tập viên";
  if (profile.canManageEmployees) return "Quản lý nhân sự";
  return "Nhân viên";
}

export function AccountMenu({ profile, token, onLogout, onOpenAdmin, open: controlledOpen, onOpenChange }: AccountMenuProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [isChangePasswordModalOpen, setIsChangePasswordModalOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isOpen = controlledOpen ?? internalOpen;

  const setOpen = (nextOpen: boolean) => {
    if (controlledOpen === undefined) {
      setInternalOpen(nextOpen);
    }
    onOpenChange?.(nextOpen);
  };

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  return (
    <>
      <div ref={containerRef} className="relative">
        <button
          className="icon-btn flex h-14 w-14 items-center justify-center rounded-2xl border border-transparent hover:bg-[color:var(--primary-soft)] hover:text-[color:var(--primary)]"
          aria-label="Hồ sơ"
          aria-expanded={isOpen}
          aria-haspopup="menu"
          onClick={() => setOpen(!isOpen)}
        >
          <UserRound size={25} />
        </button>

        {isOpen && (
          <div className="absolute left-[calc(100%+14px)] top-1/2 z-40 w-[272px] -translate-y-1/2 rounded-[20px] border border-slate-200 bg-white/95 p-2 shadow-[0_24px_60px_-32px_rgba(15,23,42,0.35)] backdrop-blur">
            <div className="rounded-2xl bg-slate-50 px-3 py-3">
              <div className="text-sm font-bold text-slate-900">{profile.fullName}</div>
              <div className="mt-1 text-xs font-medium text-slate-500">{profile.email || profile.linkedMsnv || "Tài khoản nội bộ"}</div>
              <div className="mt-2 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">{roleLabel(profile.role)}</div>
              <div className="mt-1 text-xs text-slate-500">{permissionSummary(profile)}</div>
            </div>

            <div className="mt-2 space-y-1" role="menu" aria-label="Menu tài khoản">
              <button
                className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                onClick={() => setOpen(false)}
                role="menuitem"
              >
                <UserRound size={17} />
                Thông tin tài khoản
              </button>

              <button
                className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                onClick={() => {
                  setOpen(false);
                  setIsChangePasswordModalOpen(true);
                }}
                role="menuitem"
              >
                <KeyRound size={17} />
                Đổi mật khẩu
              </button>

              {(profile.role === "ADMIN" || profile.canManageEmployees) && onOpenAdmin ? (
                <button
                  className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  onClick={() => {
                    setOpen(false);
                    onOpenAdmin();
                  }}
                  role="menuitem"
                >
                  <Shield size={17} />
                  Quản lý người dùng
                </button>
              ) : null}

              <button
                className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm font-semibold text-red-600 transition hover:bg-red-50"
                onClick={() => {
                  setOpen(false);
                  onLogout();
                }}
                role="menuitem"
              >
                <LogOut size={17} />
                Đăng xuất
              </button>
            </div>
          </div>
        )}
      </div>

      <ChangePasswordModal open={isChangePasswordModalOpen} token={token} onClose={() => setIsChangePasswordModalOpen(false)} />
    </>
  );
}
