"use client";

import { LogOut, Shield } from "lucide-react";
import { CompanyLogo } from "./company-logo";

type HeaderProps = {
  unreadCount: number;
  onOpenNotifications: () => void;
  onLogout: () => void;
  showAdminEntry?: boolean;
  onOpenAdmin?: () => void;
};

export function Header({ onLogout, showAdminEntry = false, onOpenAdmin }: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/75 backdrop-blur-xl lg:hidden">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <div className="w-24" />
        <CompanyLogo compact imageClassName="h-10 w-auto" />
        <div className="flex w-24 items-center justify-end gap-2">
          {showAdminEntry && onOpenAdmin && (
            <button
              className="icon-btn h-10 w-10 rounded-full border border-slate-200 bg-white/80 text-slate-600 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600"
              onClick={onOpenAdmin}
              aria-label="Quản lý người dùng"
            >
              <Shield size={18} />
            </button>
          )}
          <button
            className="icon-btn h-10 w-10 rounded-full border border-slate-200 bg-white/80 text-slate-600 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600"
            onClick={onLogout}
            aria-label="Đăng xuất"
          >
            <LogOut size={18} />
          </button>
        </div>
      </div>
    </header>
  );
}
