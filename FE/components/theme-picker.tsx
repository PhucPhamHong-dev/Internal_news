"use client";

import { Settings2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { THEMES, applyTheme, persistTheme, readStoredTheme } from "./theme-utils";

type ThemePickerProps = {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function ThemePicker({ open: controlledOpen, onOpenChange }: ThemePickerProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const [themeKey, setThemeKey] = useState("blue");
  const [mounted, setMounted] = useState(false);
  const isOpen = controlledOpen ?? uncontrolledOpen;

  useEffect(() => {
    const stored = readStoredTheme();
    setThemeKey(stored);
    applyTheme(stored);
    setMounted(true);
  }, []);

  const setOpen = (nextOpen: boolean) => {
    if (controlledOpen === undefined) {
      setUncontrolledOpen(nextOpen);
    }
    onOpenChange?.(nextOpen);
  };

  const selectTheme = (nextTheme: string) => {
    setThemeKey(nextTheme);
    persistTheme(nextTheme);
    applyTheme(nextTheme);
    setOpen(false);
  };

  if (!mounted) return null;

  return (
    <div className="relative">
      <button
        className="icon-btn flex h-12 w-12 items-center justify-center rounded-2xl border border-transparent hover:bg-[color:var(--primary-soft)] hover:text-[color:var(--primary)]"
        aria-label="Cài đặt giao diện"
        aria-expanded={isOpen}
        onClick={() => setOpen(!isOpen)}
      >
        <Settings2 size={22} />
      </button>

      {isOpen && (
        <>
          <div className="absolute bottom-0 left-[calc(100%+14px)] z-40 hidden w-[360px] rounded-[22px] border border-slate-200 bg-white/95 p-3 shadow-[0_24px_60px_-32px_rgba(15,23,42,0.35)] backdrop-blur md:block">
            <div className="px-2 pb-3 text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Bảng màu</div>
            <div className="grid max-h-[380px] grid-cols-2 gap-2 overflow-y-auto pr-1">
              {THEMES.map((theme) => {
                const selected = themeKey === theme.key;
                return (
                  <button
                    key={theme.key}
                    className={`flex h-14 items-center gap-3 rounded-2xl border px-3 text-left text-sm font-semibold transition ${
                      selected
                        ? "theme-primary-border bg-[color:var(--primary-faint)] text-slate-900 shadow-sm"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                    onClick={() => selectTheme(theme.key)}
                  >
                    <span className="h-7 w-7 shrink-0 rounded-full border border-white shadow-sm" style={{ background: `linear-gradient(135deg, ${theme.via}, ${theme.accent})` }} />
                    <span className="min-w-0 flex-1 truncate">{theme.label}</span>
                    {selected ? <span className="text-[11px] font-bold text-[color:var(--primary)]">Đang chọn</span> : null}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="fixed inset-0 z-50 bg-slate-950/25 backdrop-blur-sm md:hidden" onClick={() => setOpen(false)}>
            <div
              className="absolute bottom-4 left-4 right-4 mx-auto flex max-h-[80vh] w-[calc(100%-32px)] max-w-[420px] flex-col rounded-[24px] border border-slate-200 bg-white p-4 shadow-[0_30px_80px_-40px_rgba(15,23,42,0.34)]"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-bold uppercase tracking-[0.16em] text-slate-400">Bảng màu</div>
                <button
                  type="button"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
                  onClick={() => setOpen(false)}
                  aria-label="Đóng bảng màu"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="grid min-h-0 flex-1 grid-cols-2 gap-2 overflow-y-auto pr-1 [@media(max-width:360px)]:grid-cols-1">
                {THEMES.map((theme) => {
                  const selected = themeKey === theme.key;
                  return (
                    <button
                      key={theme.key}
                      className={`flex h-14 items-center gap-3 rounded-2xl border px-3 text-left text-sm font-semibold transition ${
                        selected
                          ? "theme-primary-border bg-[color:var(--primary-faint)] text-slate-900 shadow-sm"
                          : "border-slate-200 bg-white text-slate-600"
                      }`}
                      onClick={() => selectTheme(theme.key)}
                    >
                      <span className="h-7 w-7 shrink-0 rounded-full border border-white shadow-sm" style={{ background: `linear-gradient(135deg, ${theme.via}, ${theme.accent})` }} />
                      <span className="min-w-0 flex-1 truncate">{theme.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
