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
};

export function BottomNav({ onLogout, onGoHome, onOpenSearch, onOpenComposer, canCompose }: BottomNavProps) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200/80 bg-white/92 px-5 py-3 backdrop-blur-xl lg:hidden">
      <div className="mx-auto flex max-w-lg items-center justify-between">
        <button className="icon-btn h-11 w-11 rounded-2xl bg-blue-50 text-blue-600" aria-label="Trang chủ" onClick={onGoHome}>
          <Home size={21} />
        </button>
        <button
          className="icon-btn h-11 w-11 rounded-2xl border border-transparent hover:border-blue-100 hover:bg-blue-50 hover:text-blue-600"
          onClick={onOpenSearch}
          aria-label="Tìm kiếm"
        >
          <Search size={21} />
        </button>
        {canCompose && (
          <button
            className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-[0_16px_28px_-18px_rgba(37,99,235,0.5)]"
            aria-label="Bài viết mới"
            onClick={onOpenComposer}
          >
            <Plus size={22} />
          </button>
        )}
        <button
          className="icon-btn h-11 w-11 rounded-2xl border border-transparent hover:border-blue-100 hover:bg-blue-50 hover:text-blue-600"
          onClick={onLogout}
          aria-label="Đăng xuất"
        >
          <LogOut size={21} />
        </button>
      </div>
    </nav>
  );
}
