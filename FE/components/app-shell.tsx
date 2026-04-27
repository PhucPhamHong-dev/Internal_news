"use client";

import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
import { useAuthStore } from "./auth-store";
import { BottomNav } from "./bottom-nav";
import { Header } from "./header";
import { LeftRail } from "./left-rail";
import { ThemePicker } from "./theme-picker";

type AppShellProps = {
  children: ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { token, profile, initialized, clearAuth } = useAuthStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isAuthenticated = mounted && initialized && Boolean(token && profile);

  if (!isAuthenticated) {
    return <>{children}</>;
  }

  const currentProfile = profile!;

  const goHome = () => router.push("/");
  const openSearch = () => router.push("/?panel=search");
  const openComposer = () => router.push("/?panel=compose");
  const openAdmin = () => router.push("/admin/users");

  return (
    <div className="min-h-screen pb-24 text-slate-900 lg:pb-0">
      <Header unreadCount={0} onOpenNotifications={() => undefined} onLogout={clearAuth} showAdminEntry={currentProfile.role === "ADMIN"} onOpenAdmin={openAdmin} />

      <main className="mx-auto flex w-full justify-center px-3 py-4 sm:px-4 lg:px-6 lg:py-6">
        <LeftRail onGoHome={goHome} onOpenSearch={openSearch} showAdminEntry={currentProfile.role === "ADMIN"} onOpenAdmin={openAdmin} bottomSlot={<ThemePicker />} />
        <section className="w-full max-w-7xl lg:ml-[116px]">{children}</section>
      </main>

      <BottomNav
        unreadCount={0}
        onOpenNotifications={() => undefined}
        onLogout={clearAuth}
        onGoHome={goHome}
        onOpenSearch={openSearch}
        onOpenComposer={openComposer}
        canCompose={currentProfile.role === "ADMIN" || currentProfile.role === "WRITER"}
      />
    </div>
  );
}
