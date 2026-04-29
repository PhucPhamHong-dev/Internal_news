"use client";

import { ChevronDown, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

export type NewsletterArchiveYear = {
  year: number;
  total: number;
  months: Array<{ month: number; count: number }>;
};

type NewsletterPeriodPickerProps = {
  archiveYears: NewsletterArchiveYear[];
  selectedYear: number;
  selectedMonth: number;
  onSelect: (year: number, month: number) => void;
};

const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1);

function padMonth(month: number) {
  return String(month).padStart(2, "0");
}

function formatTitle(month: number, year: number) {
  return `Bản tin tháng ${padMonth(month)}/${year}`;
}

function monthButtonClass({ isSelected, isAvailable }: { isSelected: boolean; isAvailable: boolean }) {
  if (isSelected) {
    return "border-transparent text-white";
  }

  if (isAvailable) {
    return "theme-primary-border-hover border border-slate-200 bg-white text-slate-800 hover:bg-[color:var(--app-accent-faint)] hover:text-[color:var(--app-accent)]";
  }

  return "cursor-not-allowed border border-slate-100 bg-slate-50/80 text-slate-400";
}

function MonthGrid({
  availableMonths,
  pickerYear,
  selectedYear,
  selectedMonth,
  onSelect
}: {
  availableMonths: Map<number, number>;
  pickerYear: number;
  selectedYear: number;
  selectedMonth: number;
  onSelect: (year: number, month: number) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-3 md:grid-cols-4">
      {MONTHS.map((month) => {
        const isSelected = selectedYear === pickerYear && selectedMonth === month;
        const isAvailable = availableMonths.has(month);

        return (
          <button
            key={month}
            type="button"
            className={`flex min-h-[60px] flex-col items-start justify-between rounded-[18px] px-3 py-2.5 text-left text-sm font-semibold transition ${monthButtonClass({
              isSelected,
              isAvailable
            })}`}
            style={
              isSelected
                ? { background: "linear-gradient(135deg, var(--app-accent), color-mix(in srgb, var(--app-accent) 78%, black))" }
                : undefined
            }
            onClick={() => {
              if (!isAvailable) return;
              onSelect(pickerYear, month);
            }}
            disabled={!isAvailable}
            aria-current={isSelected ? "date" : undefined}
          >
            <span className="block leading-5">Tháng {month}</span>
            <span className={`block text-[11px] ${isSelected ? "text-white/85" : isAvailable ? "text-slate-500" : "text-slate-400"}`}>
              {isAvailable ? `${availableMonths.get(month)} bài` : "Chưa có"}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function PickerPanel({
  archiveYears,
  pickerYear,
  selectedYear,
  selectedMonth,
  onPickYear,
  onSelect
}: {
  archiveYears: NewsletterArchiveYear[];
  pickerYear: number;
  selectedYear: number;
  selectedMonth: number;
  onPickYear: (year: number) => void;
  onSelect: (year: number, month: number) => void;
}) {
  const currentYear = new Date().getFullYear();

  const yearOptions = useMemo(() => {
    const years = new Set<number>([currentYear, selectedYear, ...archiveYears.map((item) => item.year)]);
    return Array.from(years).sort((a, b) => b - a);
  }, [archiveYears, currentYear, selectedYear]);

  const activeYear = archiveYears.find((item) => item.year === pickerYear) ?? null;
  const availableMonths = useMemo(() => {
    return new Map(activeYear?.months.map((item) => [item.month, item.count]) ?? []);
  }, [activeYear]);

  return (
    <>
      <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Chọn bản tin</div>

      <div className="hide-scrollbar mt-3 flex gap-2 overflow-x-auto pb-1">
        {yearOptions.map((year) => {
          const isActive = year === pickerYear;
          return (
            <button
              key={year}
              type="button"
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-bold transition ${
                isActive
                  ? "theme-primary-bg text-white"
                  : "theme-primary-border-hover border border-slate-200 bg-white text-slate-600 hover:bg-[color:var(--app-accent-faint)] hover:text-[color:var(--app-accent)]"
              }`}
              style={isActive ? { boxShadow: "0 14px 28px -24px color-mix(in srgb, var(--app-accent) 70%, transparent)" } : undefined}
              onClick={() => onPickYear(year)}
            >
              {year}
            </button>
          );
        })}
      </div>

      <div className="mt-3">
        <MonthGrid
          availableMonths={availableMonths}
          pickerYear={pickerYear}
          selectedYear={selectedYear}
          selectedMonth={selectedMonth}
          onSelect={onSelect}
        />
      </div>
    </>
  );
}

export function NewsletterPeriodPicker({
  archiveYears,
  selectedYear,
  selectedMonth,
  onSelect
}: NewsletterPeriodPickerProps) {
  const [open, setOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(selectedYear);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setPickerYear(selectedYear);
  }, [open, selectedYear]);

  useEffect(() => {
    if (!open) return;

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
  }, [open]);

  const handleSelect = (year: number, month: number) => {
    onSelect(year, month);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="flex w-full flex-col items-center">
      <button
        type="button"
        className="group inline-flex max-w-full items-center justify-center gap-2 rounded-2xl py-1 text-center text-slate-900 transition hover:text-[color:var(--app-accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--app-accent-ring)] focus-visible:ring-offset-2"
        onClick={() => setOpen((value) => !value)}
        aria-label="Chọn tháng bản tin"
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <span className="truncate text-[27px] font-extrabold tracking-tight sm:text-[32px]">{formatTitle(selectedMonth, selectedYear)}</span>
        <span className="flex h-7 w-7 shrink-0 items-center justify-center text-slate-400 transition group-hover:text-[color:var(--app-accent)]">
          <ChevronDown size={16} className={`transition ${open ? "rotate-180" : ""}`} />
        </span>
      </button>

      {open && (
        <div
          className="mt-4 hidden w-full max-w-[600px] rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_20px_48px_-34px_rgba(15,23,42,0.24)] md:block"
          role="dialog"
          aria-label="Chọn bản tin"
        >
          <PickerPanel
            archiveYears={archiveYears}
            pickerYear={pickerYear}
            selectedYear={selectedYear}
            selectedMonth={selectedMonth}
            onPickYear={setPickerYear}
            onSelect={handleSelect}
          />
        </div>
      )}

      <div
        className={`pointer-events-none fixed inset-0 z-30 bg-slate-900/20 transition md:hidden ${open ? "opacity-100" : "opacity-0"}`}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      <div
        className={`pointer-events-none fixed inset-x-0 bottom-0 z-40 rounded-t-[28px] border-t border-slate-200 bg-white px-4 pb-6 pt-4 shadow-[0_-18px_60px_-34px_rgba(15,23,42,0.28)] transition duration-200 md:hidden ${
          open ? "translate-y-0 opacity-100" : "translate-y-full opacity-0"
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="Chọn bản tin"
      >
        <div className={`pointer-events-auto transition duration-200 ${open ? "translate-y-0" : "translate-y-4"}`}>
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Chọn bản tin</div>
              <div className="mt-1 text-lg font-bold text-slate-900">{formatTitle(selectedMonth, selectedYear)}</div>
            </div>
            <button
              type="button"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-500"
              onClick={() => setOpen(false)}
              aria-label="Đóng bộ chọn bản tin"
            >
              <X size={18} />
            </button>
          </div>

          <PickerPanel
            archiveYears={archiveYears}
            pickerYear={pickerYear}
            selectedYear={selectedYear}
            selectedMonth={selectedMonth}
            onPickYear={setPickerYear}
            onSelect={handleSelect}
          />
        </div>
      </div>
    </div>
  );
}
