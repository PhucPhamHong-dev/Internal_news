"use client";

import { useRouter } from "next/navigation";
import { LoginScreen } from "@/components/login-screen";
import { useAuthRedirect } from "@/components/use-auth-redirect";

export default function LoginPage() {
  const router = useRouter();
  const { isLoading, isAuthenticated } = useAuthRedirect({ redirectAuthenticatedTo: "/" });

  if (isLoading || isAuthenticated) {
    return <main className="min-h-screen" />;
  }

  return <LoginScreen onLoggedIn={() => router.replace("/")} />;
}
