"use client";

import { Home, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Profile } from "./auth-store";
import { AccountMenu } from "./account-menu";
import { CompanyLogo } from "./company-logo";
import { ThemePicker } from "./theme-picker";

type LeftRailProps = {
  onGoHome: () => void;
  onOpenSearch: () => void;
  showSearch?: boolean;
  profile: Profile;
  token: string | null;
  onLogout: () => void;
  onOpenAdmin?: () => void;
};

export function LeftRail({ onGoHome, onOpenSearch, showSearch = true, profile, token, onLogout, onOpenAdmin }: LeftRailProps) {
  const pathname = usePathname();
  const [activeSidebarPanel, setActiveSidebarPanel] = useState<"theme" | "account" | null>(null);
  const railRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const close = () => setActiveSidebarPanel(null);
    const handlePointerDown = (event: MouseEvent) => {
      if (!railRef.current?.contains(event.target as Node)) {
        close();
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  useEffect(() => {
    setActiveSidebarPanel(null);
  }, [pathname]);

  return (
    <aside ref={railRef} className="fixed left-4 top-4 z-20 hidden h-[calc(100vh-2rem)] w-[98px] flex-col rounded-[32px] border border-white/80 bg-white/72 px-3 py-4 shadow-[0_22px_50px_-30px_rgba(15,23,42,0.25)] backdrop-blur-xl lg:flex">
      <div className="flex justify-center pt-1">
        <CompanyLogo compact imageClassName="h-12 w-auto" />
      </div>

      <div className="flex flex-1 items-center justify-center">
        <div className="flex w-full flex-col items-center gap-3">
          <button
            className="flex h-14 w-14 items-center justify-center rounded-2xl shadow-sm transition"
            style={{ background: "color-mix(in srgb, var(--primary-soft) 78%, white)", color: "var(--primary)" }}
            aria-label="Trang chủ"
            onClick={() => {
              setActiveSidebarPanel(null);
              onGoHome();
            }}
          >
            <Home size={26} />
          </button>

          {showSearch ? (
            <button
              className="icon-btn flex h-14 w-14 items-center justify-center rounded-2xl border border-transparent hover:bg-[color:var(--primary-soft)] hover:text-[color:var(--primary)]"
              onClick={() => {
                setActiveSidebarPanel(null);
                onOpenSearch();
              }}
              aria-label="Tìm kiếm"
            >
              <Search size={25} />
            </button>
          ) : null}

          <AccountMenu
            profile={profile}
            token={token}
            onLogout={onLogout}
            onOpenAdmin={onOpenAdmin}
            open={activeSidebarPanel === "account"}
            onOpenChange={(open) => setActiveSidebarPanel(open ? "account" : null)}
          />
        </div>
      </div>

      <div className="flex justify-center pb-1">
        <ThemePicker open={activeSidebarPanel === "theme"} onOpenChange={(open) => setActiveSidebarPanel(open ? "theme" : null)} />
      </div>
    </aside>
  );
}
