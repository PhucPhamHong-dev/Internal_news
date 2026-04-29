"use client";

import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
import { useAuthStore } from "./auth-store";
import { BottomNav } from "./bottom-nav";
import { Header } from "./header";
import { LeftRail } from "./left-rail";

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

  const handleLogout = () => {
    clearAuth();
    router.replace("/login");
  };

  if (pathname === "/login") {
    return <>{children}</>;
  }

  const isAuthenticated = mounted && initialized && Boolean(token && profile);

  if (!isAuthenticated) {
    return <>{children}</>;
  }

  const currentProfile = profile!;
  const canManageUsers = currentProfile.role === "ADMIN" || currentProfile.canManageEmployees;
  const showSearch = currentProfile.role === "ADMIN" || !currentProfile.canManageEmployees || currentProfile.canPost;
  const homePath = currentProfile.canManageEmployees && !currentProfile.canPost && currentProfile.role !== "ADMIN" ? "/admin/users" : pathname === "/newsletters" ? "/newsletters" : "/";

  const goHome = () => router.push(homePath);
  const openSearch = () => router.push(`${homePath}?panel=search`);
  const openComposer = () => router.push(`${homePath}?panel=compose`);
  const openAdmin = () => router.push("/admin/users");

  return (
    <div className="min-h-screen pb-24 text-slate-900 lg:pb-0">
      <Header unreadCount={0} onOpenNotifications={() => undefined} onLogout={handleLogout} showAdminEntry={canManageUsers} onOpenAdmin={openAdmin} />

      <main className="mx-auto flex w-full justify-center px-3 py-4 sm:px-4 lg:px-6 lg:py-6">
        <LeftRail
          onGoHome={goHome}
          onOpenSearch={openSearch}
          showSearch={showSearch}
          profile={currentProfile}
          token={token}
          onLogout={handleLogout}
          onOpenAdmin={canManageUsers ? openAdmin : undefined}
        />
        <section className="w-full max-w-7xl lg:ml-[116px]">{children}</section>
      </main>

      <BottomNav
        unreadCount={0}
        onOpenNotifications={() => undefined}
        onLogout={handleLogout}
        onGoHome={goHome}
        onOpenSearch={openSearch}
        onOpenComposer={openComposer}
        canCompose={currentProfile.role === "ADMIN" || currentProfile.canPost}
        showSearch={showSearch}
      />
    </div>
  );
}
