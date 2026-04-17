"use client";

import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { CredentialResponse, GoogleLogin, GoogleOAuthProvider } from "@react-oauth/google";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { io, Socket } from "socket.io-client";
import { apiRequest } from "@/components/api";
import { Profile, useAuthStore } from "@/components/auth-store";
import { CompanyLogo } from "@/components/company-logo";
import { Composer } from "@/components/composer";
import { MsnvModal } from "@/components/msnv-modal";
import { NotificationPanel } from "@/components/notification-panel";
import { PostCard } from "@/components/post-card";
import { FeedConnection, FeedPost } from "@/components/post-shared";
import { SearchPanel, SearchPreview } from "@/components/search-panel";
import { useDebouncedValue } from "@/components/use-debounced-value";

type NotificationItem = {
  id: string;
  message: string;
  createdAt: string;
  isRead: boolean;
};

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";
const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:4000";
const FEED_SCROLL_KEY = "internal_threads_feed_scroll";

function FeedSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="card animate-pulse px-6 py-6">
          <div className="flex gap-4">
            <div className="h-12 w-12 rounded-full bg-slate-200" />
            <div className="flex-1 space-y-3">
              <div className="h-4 w-40 rounded-full bg-slate-200" />
              <div className="h-6 w-2/3 rounded-full bg-slate-200" />
              <div className="space-y-2">
                <div className="h-4 w-full rounded-full bg-slate-100" />
                <div className="h-4 w-5/6 rounded-full bg-slate-100" />
              </div>
              <div className="h-56 rounded-[28px] bg-slate-100" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function HomePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { token, profile, initialized, setProfile, saveAuth, clearAuth } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [composerOpenSignal, setComposerOpenSignal] = useState(0);
  const [impersonateTarget, setImpersonateTarget] = useState<{ employeeId: string; fullName: string; msnv: string } | null>(null);
  const [prefetchNode, setPrefetchNode] = useState<HTMLDivElement | null>(null);
  const handledPanelRef = useRef<string | null>(null);
  const scrollRestoredRef = useRef(false);
  const debouncedSearch = useDebouncedValue(search, 350);

  const canPost = useMemo(() => profile?.role === "ADMIN" || profile?.role === "WRITER", [profile?.role]);

  const clearPanelParam = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("panel");
    const next = params.toString();
    router.replace(next ? `/?${next}` : "/");
  };

  const fetchMe = async (authToken: string) => {
    const me = await apiRequest<Profile>("/me", authToken);
    setProfile(me);
  };

  const fetchNotifications = async (authToken: string) => {
    const data = await apiRequest<NotificationItem[]>("/notifications", authToken);
    setNotifications(data);
  };

  useEffect(() => {
    if (!initialized || !token) return;
    void fetchMe(token).catch(() => clearAuth());
  }, [initialized, token, clearAuth, setProfile]);

  const feedQuery = useInfiniteQuery({
    queryKey: ["feed", profile?.id],
    enabled: Boolean(token && profile?.linked && debouncedSearch.trim() === ""),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => {
      const query = new URLSearchParams({ limit: "5" });
      if (pageParam) query.set("cursor", pageParam);
      return apiRequest<FeedConnection>(`/posts?${query.toString()}`, token!, "GET", undefined, { signal });
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined
  });

  const searchQuery = useQuery({
    queryKey: ["search", profile?.id, debouncedSearch],
    enabled: Boolean(token && profile?.linked && debouncedSearch.trim()),
    queryFn: ({ signal }) =>
      apiRequest<{ results: FeedPost[]; suggestions: SearchPreview[] }>(
        `/search?q=${encodeURIComponent(debouncedSearch)}`,
        token!,
        "GET",
        undefined,
        { signal }
      )
  });

  const suggestionQuery = useQuery({
    queryKey: ["search-suggestions", profile?.id],
    enabled: Boolean(token && profile?.linked),
    queryFn: ({ signal }) =>
      apiRequest<{ results: FeedPost[]; suggestions: SearchPreview[] }>("/search?q=", token!, "GET", undefined, { signal })
  });

  const feedPosts = useMemo(() => feedQuery.data?.pages.flatMap((page) => page.items) ?? [], [feedQuery.data]);
  const searchResults = useMemo(() => searchQuery.data?.results ?? [], [searchQuery.data?.results]);
  const visiblePosts = debouncedSearch.trim() ? searchResults : feedPosts;
  const visibleSuggestions = useMemo<SearchPreview[]>(() => {
    if (debouncedSearch.trim()) {
      return searchQuery.data?.results.map((item) => ({
        id: item.id,
        title: item.title,
        content: item.content,
        createdAt: item.createdAt,
        thumbnailUrl: item.media[0]?.url ?? null,
        thumbnailType: item.media[0]?.type ?? null
      })) ?? [];
    }

    return suggestionQuery.data?.suggestions ?? [];
  }, [debouncedSearch, searchQuery.data?.results, suggestionQuery.data?.suggestions]);

  useEffect(() => {
    if (!token || !profile?.linked) return;
    void fetchNotifications(token);
  }, [token, profile?.linked]);

  useEffect(() => {
    if (!token || !profile?.linked) return;
    const socket: Socket = io(SOCKET_URL, { auth: { token } });
    socket.on("notification:new", () => void fetchNotifications(token));
    socket.on("notification:badge_count", () => void fetchNotifications(token));
    return () => {
      socket.disconnect();
    };
  }, [token, profile?.linked]);

  useEffect(() => {
    if (!token || !profile?.linked) return;
    const timer = window.setInterval(() => void fetchNotifications(token), 15000);
    return () => window.clearInterval(timer);
  }, [token, profile?.linked]);

  useEffect(() => {
    const panel = searchParams.get("panel");
    if (!panel || handledPanelRef.current === panel) return;

    if (panel === "search") {
      setSearchOpen(true);
      handledPanelRef.current = panel;
    }

    if (panel === "compose") {
      setComposerOpenSignal((value) => value + 1);
      handledPanelRef.current = panel;
    }
  }, [searchParams]);

  useEffect(() => {
    if (!profile || profile.role !== "ADMIN") return;
    const composeAs = searchParams.get("composeAs");
    if (!composeAs) return;

    const raw = window.sessionStorage.getItem("admin_compose_target");
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw) as { employeeId: string; fullName: string; msnv: string };
      if (parsed.employeeId !== composeAs) return;
      setImpersonateTarget(parsed);
      setComposerOpenSignal((value) => value + 1);
    } catch {
      window.sessionStorage.removeItem("admin_compose_target");
    }
  }, [profile, searchParams]);

  useEffect(() => {
    if (!profile?.linked || debouncedSearch.trim() || scrollRestoredRef.current || visiblePosts.length === 0) return;
    const saved = window.sessionStorage.getItem(FEED_SCROLL_KEY);
    if (!saved) {
      scrollRestoredRef.current = true;
      return;
    }

    window.requestAnimationFrame(() => {
      window.scrollTo({ top: Number(saved), behavior: "auto" });
      scrollRestoredRef.current = true;
    });
  }, [debouncedSearch, profile?.linked, visiblePosts.length]);

  useEffect(() => {
    if (!profile?.linked) return;

    const persistScroll = () => {
      window.sessionStorage.setItem(FEED_SCROLL_KEY, String(window.scrollY));
    };

    persistScroll();
    window.addEventListener("scroll", persistScroll, { passive: true });
    return () => window.removeEventListener("scroll", persistScroll);
  }, [profile?.linked]);

  useEffect(() => {
    if (!prefetchNode || !feedQuery.hasNextPage || feedQuery.isFetchingNextPage || debouncedSearch.trim()) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          void feedQuery.fetchNextPage();
        }
      },
      { rootMargin: "900px 0px" }
    );

    observer.observe(prefetchNode);
    return () => observer.disconnect();
  }, [debouncedSearch, feedQuery, prefetchNode]);

  const handleGoogleLogin = async (credentialResponse: CredentialResponse) => {
    if (!credentialResponse.credential) return;
    setLoading(true);
    try {
      const response = await apiRequest<{ token: string; profile: Profile }>("/auth/google/callback", null, "POST", {
        idToken: credentialResponse.credential
      });
      saveAuth(response.token, response.profile);
    } finally {
      setLoading(false);
    }
  };

  const handleMsnvSubmit = async (msnv: string) => {
    if (!token) return;
    const response = await apiRequest<{ token: string; profile: Profile }>("/auth/link-msnv", token, "POST", { msnv });
    saveAuth(response.token, response.profile);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["feed"] }),
      queryClient.invalidateQueries({ queryKey: ["search-suggestions"] })
    ]);
  };

  const refreshFeedQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["feed"] }),
      queryClient.invalidateQueries({ queryKey: ["search"] }),
      queryClient.invalidateQueries({ queryKey: ["search-suggestions"] })
    ]);
  };

  if (!initialized || (token && !profile)) {
    return <FeedSkeleton />;
  }

  if (!token || !profile) {
    return (
      <main className="grid min-h-screen place-items-center px-4">
        <section className="card w-full max-w-md p-7 text-center sm:p-8">
          <div className="flex justify-center">
            <CompanyLogo imageClassName="h-20 w-auto" />
          </div>
          <h1 className="mt-5 text-3xl font-extrabold tracking-tight text-slate-900">Báº£n tin ná»™i bá»™</h1>
          <p className="mt-3 text-sm leading-6 text-slate-500">ChÃ o má»«ng báº¡n quay láº¡i. ÄÄƒng nháº­p báº±ng Google Ä‘á»ƒ truy cáº­p há»‡ thá»‘ng truyá»n thÃ´ng ná»™i bá»™ cá»§a cÃ´ng ty.</p>
          <div className="mt-6 flex justify-center">
            <GoogleLogin onSuccess={handleGoogleLogin} onError={() => undefined} />
          </div>
          {loading && <p className="mt-4 text-sm text-slate-500">Äang xÃ¡c thá»±c...</p>}
        </section>
      </main>
    );
  }

  const showInitialSkeleton =
    profile.linked &&
    ((debouncedSearch.trim() === "" && feedQuery.isLoading && feedPosts.length === 0) ||
      (debouncedSearch.trim() !== "" && searchQuery.isLoading && searchResults.length === 0));

  return (
    <>
      <section className="mx-auto w-full max-w-[780px]">
        <div className="mb-5 hidden items-center justify-center gap-2 text-4xl font-extrabold tracking-tight text-slate-900 lg:flex">
          DÃ nh cho báº¡n
          <ChevronDown size={26} className="text-slate-400" />
        </div>

        <Composer
          token={token}
          canPost={canPost}
          openSignal={composerOpenSignal}
          authorLabel={profile.fullName}
          authorAvatarUrl={profile.avatarUrl}
          impersonateTarget={impersonateTarget}
          onCloseCompose={() => {
            handledPanelRef.current = null;
            if (searchParams.get("panel")) {
              clearPanelParam();
            }
            if (impersonateTarget) {
              setImpersonateTarget(null);
              window.sessionStorage.removeItem("admin_compose_target");
              router.replace("/");
            }
          }}
          onCreated={() => {
            handledPanelRef.current = null;
            if (searchParams.get("panel")) {
              clearPanelParam();
            }
            if (impersonateTarget) {
              setImpersonateTarget(null);
              window.sessionStorage.removeItem("admin_compose_target");
              router.replace("/");
            }
            void refreshFeedQueries();
          }}
        />

        {showInitialSkeleton ? (
          <FeedSkeleton />
        ) : visiblePosts.length === 0 ? (
          <div className="card px-6 py-10 text-center">
            <h3 className="text-lg font-bold text-slate-900">ChÆ°a cÃ³ bÃ i viáº¿t phÃ¹ há»£p</h3>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              {debouncedSearch.trim() ? "KhÃ´ng tÃ¬m tháº¥y bÃ i viáº¿t khá»›p vá»›i tá»« khÃ³a hiá»‡n táº¡i." : "Feed sáº½ hiá»ƒn thá»‹ khi cÃ³ bÃ i viáº¿t ná»™i bá»™ má»›i."}
            </p>
          </div>
        ) : (
          <>
            {visiblePosts.map((post, index) => {
              const shouldPrefetch = debouncedSearch.trim() === "" && index === Math.max(0, visiblePosts.length - 2);
              return (
                <div key={post.id} ref={shouldPrefetch ? setPrefetchNode : undefined}>
                  <PostCard post={post} token={token} profile={profile} onRefresh={() => void refreshFeedQueries()} />
                </div>
              );
            })}

            {feedQuery.isFetchingNextPage && <FeedSkeleton count={2} />}
          </>
        )}
      </section>

      {canPost && (
        <button
          className="fixed bottom-8 right-8 z-20 hidden h-20 w-20 items-center justify-center rounded-[28px] bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-[0_22px_38px_-18px_rgba(37,99,235,0.52)] transition hover:from-blue-600 hover:to-blue-700 lg:inline-flex"
          onClick={() => setComposerOpenSignal((value) => value + 1)}
          aria-label="Mở tạo bài viết"
        >
          <Plus size={36} />
        </button>
      )}

      <SearchPanel
        open={searchOpen}
        query={search}
        onChangeQuery={(value) => {
          setSearch(value);
        }}
        onClose={() => {
          setSearchOpen(false);
          handledPanelRef.current = null;
          if (searchParams.get("panel")) {
            clearPanelParam();
          }
        }}
        suggestions={visibleSuggestions}
        onPick={(item) => {
          router.push(`/posts/${item.id}`);
        }}
      />

      <NotificationPanel
        open={notificationOpen}
        notifications={notifications}
        onClose={() => setNotificationOpen(false)}
        onRead={(id) => {
          void apiRequest(`/notifications/${id}/read`, token, "POST").then(() => fetchNotifications(token));
        }}
      />

      {!profile.linked && <MsnvModal onSubmit={handleMsnvSubmit} loading={loading} />}
    </>
  );
}

export default function HomePage() {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <Suspense fallback={<main className="min-h-screen" />}>
        <HomePageContent />
      </Suspense>
    </GoogleOAuthProvider>
  );
}

