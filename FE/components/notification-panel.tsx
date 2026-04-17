"use client";

import { BellOff, X } from "lucide-react";

type NotificationItem = {
  id: string;
  message: string;
  createdAt: string;
  isRead: boolean;
};

type NotificationPanelProps = {
  open: boolean;
  notifications: NotificationItem[];
  onClose: () => void;
  onRead: (id: string) => void;
};

export function NotificationPanel({ open, notifications, onClose, onRead }: NotificationPanelProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 bg-slate-900/18 backdrop-blur-sm" onClick={onClose}>
      <aside
        className="absolute right-4 top-4 h-[calc(100vh-2rem)] w-full max-w-md rounded-[28px] border border-slate-200 bg-white p-5 text-slate-900 shadow-[0_24px_60px_-30px_rgba(15,23,42,0.24)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-lg font-bold">Thông báo</h2>
            <p className="mt-1 text-sm text-slate-500">Tính năng này đang được bảo trì.</p>
          </div>
          <button className="icon-btn h-10 w-10 rounded-full border border-slate-200 bg-white" onClick={onClose} aria-label="Đóng">
            <X size={18} />
          </button>
        </div>

        <div className="grid h-[calc(100%-5.5rem)] place-items-center rounded-[24px] border border-dashed border-slate-200 bg-slate-50/80 text-center">
          <div className="max-w-xs">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-500">
              <BellOff size={24} />
            </div>
            <p className="mt-4 text-base font-semibold text-slate-700">Thông báo tạm thời chưa sử dụng</p>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Hệ thống sẽ mở lại khi luồng duyệt và gửi thông báo nội bộ hoàn tất.
            </p>
            {notifications.slice(0, 2).map((notification) => (
              <button
                key={notification.id}
                className="mt-3 block w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left text-sm text-slate-600"
                onClick={() => onRead(notification.id)}
              >
                {notification.message}
              </button>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}
