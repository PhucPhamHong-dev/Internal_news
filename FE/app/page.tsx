import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { HomePageClient } from "@/components/home-page-client";

const SESSION_COOKIE_KEY = "internal_threads_session";

export default function HomePage() {
  const hasSession = Boolean(cookies().get(SESSION_COOKIE_KEY)?.value);

  if (!hasSession) {
    redirect("/login");
  }

  return <HomePageClient />;
}
