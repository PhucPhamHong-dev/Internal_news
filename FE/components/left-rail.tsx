"use client";

import { Home, Menu, Search, Shield, UserRound } from "lucide-react";
import { ReactNode } from "react";
import { CompanyLogo } from "./company-logo";

type LeftRailProps = {
  onGoHome: () => void;
  onOpenSearch: () => void;
  showAdminEntry?: boolean;
  onOpenAdmin?: () => void;
  bottomSlot?: ReactNode;
};

export function LeftRail({ onGoHome, onOpenSearch, showAdminEntry = false, onOpenAdmin, bottomSlot }: LeftRailProps) {
  return (
    <aside className="fixed left-4 top-4 z-20 hidden h-[calc(100vh-2rem)] w-[98px] flex-col rounded-[32px] border border-white/80 bg-white/72 px-3 py-4 shadow-[0_22px_50px_-30px_rgba(15,23,42,0.25)] backdrop-blur-xl lg:flex">
      <div className="flex justify-center pt-1">
        <CompanyLogo compact imageClassName="h-12 w-auto" />
      </div>

      <div className="flex flex-1 items-center justify-center">
        <div className="flex w-full flex-col items-center gap-3">
          <button
            className="flex h-14 w-14 items-center justify-center rounded-2xl shadow-sm transition"
            style={{ background: "color-mix(in srgb, var(--app-accent-soft) 78%, white)", color: "var(--app-accent)" }}
            aria-label="Trang chủ"
            onClick={onGoHome}
          >
            <Home size={26} />
          </button>
          <button
            className="icon-btn flex h-14 w-14 items-center justify-center rounded-2xl border border-transparent hover:bg-[color:var(--app-accent-soft)] hover:text-[color:var(--app-accent)]"
            onClick={onOpenSearch}
            aria-label="Tìm kiếm"
          >
            <Search size={25} />
          </button>
          {showAdminEntry && onOpenAdmin ? (
            <button
              className="icon-btn flex h-14 w-14 items-center justify-center rounded-2xl border border-transparent hover:bg-[color:var(--app-accent-soft)] hover:text-[color:var(--app-accent)]"
              onClick={onOpenAdmin}
              aria-label="Quản lý người dùng"
            >
              <Shield size={25} />
            </button>
          ) : (
            <button
              className="icon-btn flex h-14 w-14 items-center justify-center rounded-2xl border border-transparent hover:bg-[color:var(--app-accent-soft)] hover:text-[color:var(--app-accent)]"
              aria-label="Hồ sơ"
            >
              <UserRound size={25} />
            </button>
          )}
        </div>
      </div>

      <div className="flex justify-center pb-1">
        {bottomSlot ?? (
          <button
            className="icon-btn flex h-12 w-12 items-center justify-center rounded-2xl border border-transparent hover:border-slate-200 hover:bg-slate-50"
            aria-label="Menu"
          >
            <Menu size={22} />
          </button>
        )}
      </div>
    </aside>
  );
}
