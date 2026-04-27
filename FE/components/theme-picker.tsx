"use client";

import { Settings2 } from "lucide-react";
import { useEffect, useState } from "react";
import { apiRequest } from "./api";
import { useAuthStore } from "./auth-store";

const THEME_KEY = "internal_threads_theme";

const THEMES = [
  { key: "blue", label: "Xanh dịu", from: "#F8FAFC", via: "#EEF6FF", to: "#FFFFFF", accent: "#2563EB" },
  { key: "mint", label: "Mint", from: "#F8FAFC", via: "#ECFDF5", to: "#FFFFFF", accent: "#059669" },
  { key: "rose", label: "Rose", from: "#FFF7F7", via: "#FFF1F2", to: "#FFFFFF", accent: "#E11D48" },
  { key: "amber", label: "Amber", from: "#FFFBEB", via: "#FEF3C7", to: "#FFFFFF", accent: "#D97706" },
  { key: "violet", label: "Violet", from: "#FAF5FF", via: "#F5F3FF", to: "#FFFFFF", accent: "#7C3AED" }
];

function applyTheme(themeKey: string) {
  const theme = THEMES.find((item) => item.key === themeKey) ?? THEMES[0];
  document.documentElement.style.setProperty("--app-accent", theme.accent);
  document.documentElement.style.setProperty("--app-accent-soft", theme.via);
  document.documentElement.style.setProperty("--app-accent-contrast", "#ffffff");
  document.body.style.background = `radial-gradient(circle at top left, ${theme.via}, transparent 28%), linear-gradient(180deg, ${theme.from} 0%, ${theme.via} 48%, ${theme.to} 100%)`;
}

export function ThemePicker() {
  const { token } = useAuthStore();
  const [open, setOpen] = useState(false);
  const [themeKey, setThemeKey] = useState("blue");
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSaved, setPasswordSaved] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(THEME_KEY) || "blue";
    setThemeKey(stored);
    applyTheme(stored);
  }, []);

  const selectTheme = (nextTheme: string) => {
    setThemeKey(nextTheme);
    window.localStorage.setItem(THEME_KEY, nextTheme);
    applyTheme(nextTheme);
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        className="icon-btn flex h-12 w-12 items-center justify-center rounded-2xl border border-transparent hover:bg-[color:var(--app-accent-soft)] hover:text-[color:var(--app-accent)]"
        aria-label="Cài đặt giao diện"
        onClick={() => setOpen((value) => !value)}
      >
        <Settings2 size={22} />
      </button>

      {open && (
        <div className="absolute bottom-0 left-[calc(100%+14px)] z-40 w-64 rounded-3xl border border-slate-200 bg-white/95 p-2 shadow-[0_24px_60px_-32px_rgba(15,23,42,0.35)] backdrop-blur">
          <div className="px-3 py-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Bảng màu</div>
          {THEMES.map((theme) => (
            <button
              key={theme.key}
              className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm font-semibold transition ${
                themeKey === theme.key ? "text-slate-900" : "text-slate-600 hover:bg-slate-50"
              }`}
              style={themeKey === theme.key ? { background: "color-mix(in srgb, var(--app-accent-soft) 68%, white)" } : undefined}
              onClick={() => selectTheme(theme.key)}
            >
              <span className="h-7 w-7 rounded-full border border-white shadow-sm" style={{ background: `linear-gradient(135deg, ${theme.via}, ${theme.accent})` }} />
              {theme.label}
            </button>
          ))}

          <button
            className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2.5 text-left text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
            onClick={() => {
              setPasswordOpen(true);
              setOpen(false);
              setPasswordError(null);
              setPasswordSaved(false);
            }}
          >
            Đổi mật khẩu
          </button>
        </div>
      )}

      {passwordOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/18 px-4 backdrop-blur-sm" onClick={() => setPasswordOpen(false)}>
          <div className="w-full max-w-md rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_30px_80px_-40px_rgba(15,23,42,0.28)]" onClick={(event) => event.stopPropagation()}>
            <h2 className="text-xl font-bold tracking-tight text-slate-900">Đổi mật khẩu</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">Áp dụng cho tài khoản đăng nhập bằng mã nhân viên.</p>

            <div className="mt-5 space-y-3">
              <input
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-[color:var(--app-accent)] focus:bg-white"
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                placeholder="Mật khẩu hiện tại"
              />
              <input
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-[color:var(--app-accent)] focus:bg-white"
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder="Mật khẩu mới, tối thiểu 6 ký tự"
              />
            </div>

            {passwordError && <p className="mt-3 text-sm text-red-600">{passwordError}</p>}
            {passwordSaved && <p className="mt-3 text-sm text-emerald-600">Đã đổi mật khẩu.</p>}

            <div className="mt-5 flex justify-end gap-3">
              <button className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50" onClick={() => setPasswordOpen(false)}>
                Đóng
              </button>
              <button
                className="rounded-2xl px-4 py-2.5 text-sm font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, var(--app-accent), color-mix(in srgb, var(--app-accent) 78%, black))" }}
                disabled={!token || !currentPassword || newPassword.length < 6}
                onClick={async () => {
                  if (!token) return;
                  setPasswordError(null);
                  setPasswordSaved(false);
                  try {
                    await apiRequest("/auth/change-password", token, "POST", { currentPassword, newPassword });
                    setCurrentPassword("");
                    setNewPassword("");
                    setPasswordSaved(true);
                  } catch (error) {
                    setPasswordError(error instanceof Error ? error.message : "Không thể đổi mật khẩu");
                  }
                }}
              >
                Lưu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
