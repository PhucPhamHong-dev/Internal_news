"use client";

import { Bell, LogOut, Search } from "lucide-react";

type SidebarProps = {
  onOpenNotifications: () => void;
  onLogout: () => void;
  onSearchChange: (value: string) => void;
  search: string;
  suggestions: Array<{ id: string; title: string }>;
  onSelectSuggestion: (value: string) => void;
};

export function Sidebar({ onOpenNotifications, onLogout, onSearchChange, search, suggestions, onSelectSuggestion }: SidebarProps) {
  return (
    <aside className="hidden w-80 shrink-0 lg:block">
      <div className="card sticky top-20 p-4">
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-border px-3 py-2">
          <Search size={16} className="text-slate-500" />
          <input
            className="w-full bg-transparent text-sm outline-none"
            placeholder="Tìm bài theo tiêu đề/nội dung"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </div>
        <div className="mb-5 space-y-2">
          <p className="text-xs font-semibold uppercase text-slate-500">Bài mới nhất</p>
          {suggestions.map((item) => (
            <button
              key={item.id}
              className="block w-full rounded-lg px-2 py-1.5 text-left text-sm hover:bg-slate-100"
              onClick={() => onSelectSuggestion(item.title)}
            >
              {item.title}
            </button>
          ))}
        </div>
        <div className="space-y-2">
          <button className="icon-btn w-full justify-start" onClick={onOpenNotifications}>
            <Bell size={16} />
            Thông báo
          </button>
          <button className="icon-btn w-full justify-start" onClick={onLogout}>
            <LogOut size={16} />
            Logout
          </button>
        </div>
      </div>
    </aside>
  );
}
