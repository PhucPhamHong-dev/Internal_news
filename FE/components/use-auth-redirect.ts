"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuthStore } from "./auth-store";

type UseAuthRedirectOptions = {
  requirePermission?: (profile: NonNullable<ReturnType<typeof useAuthStore>["profile"]>) => boolean;
  redirectAuthenticatedTo?: string;
};

export function useAuthRedirect(options: UseAuthRedirectOptions = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const auth = useAuthStore();

  useEffect(() => {
    if (!auth.initialized) return;

    if (!auth.token || !auth.profile) {
      if (pathname !== "/login") {
        router.replace("/login");
      }
      return;
    }

    if (pathname === "/login") {
      router.replace(options.redirectAuthenticatedTo ?? "/");
      return;
    }

    if (options.requirePermission && !options.requirePermission(auth.profile)) {
      router.replace("/");
    }
  }, [auth.initialized, auth.profile, auth.token, options, pathname, router]);

  return {
    ...auth,
    isLoading: !auth.initialized,
    isAuthenticated: Boolean(auth.initialized && auth.token && auth.profile),
    hasRequiredPermission: auth.profile ? (options.requirePermission ? options.requirePermission(auth.profile) : true) : false
  };
}
