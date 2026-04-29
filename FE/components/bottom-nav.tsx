"use client";

import { Home, LogOut, Plus, Search } from "lucide-react";

type BottomNavProps = {
  unreadCount: number;
  onOpenNotifications: () => void;
  onLogout: () => void;
  onGoHome: () => void;
  onOpenSearch: () => void;
  onOpenComposer: () => void;
  canCompose: boolean;
  showSearch?: boolean;
};

export function BottomNav({ onLogout, onGoHome, onOpenSearch, onOpenComposer, canCompose, showSearch = true }: BottomNavProps) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200/80 bg-white/92 px-5 py-3 backdrop-blur-xl lg:hidden">
      <div className="mx-auto flex max-w-lg items-center justify-between">
        <button className="icon-btn theme-primary-soft h-11 w-11 rounded-2xl" aria-label="Trang chủ" onClick={onGoHome}>
          <Home size={21} />
        </button>
        {showSearch && (
          <button
            className="icon-btn theme-primary-border-hover h-11 w-11 rounded-2xl border border-transparent hover:bg-[color:var(--app-accent-faint)] hover:text-[color:var(--app-accent)]"
            onClick={onOpenSearch}
            aria-label="Tìm kiếm"
          >
            <Search size={21} />
          </button>
        )}
        {canCompose && (
          <button
            className="theme-primary-bg theme-primary-bg-hover flex h-12 w-12 items-center justify-center rounded-2xl"
            aria-label="Bài viết mới"
            onClick={onOpenComposer}
            style={{ boxShadow: "0 16px 28px -18px color-mix(in srgb, var(--app-accent) 42%, transparent)" }}
          >
            <Plus size={22} />
          </button>
        )}
        <button
          className="icon-btn theme-primary-border-hover h-11 w-11 rounded-2xl border border-transparent hover:bg-[color:var(--app-accent-faint)] hover:text-[color:var(--app-accent)]"
          onClick={onLogout}
          aria-label="Đăng xuất"
        >
          <LogOut size={21} />
        </button>
      </div>
    </nav>
  );
}
