"use client";

import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { KeyRound, Plus } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { io, Socket } from "socket.io-client";
import { ApiError, apiRequest } from "@/components/api";
import { Profile, useAuthStore } from "@/components/auth-store";
import { Composer } from "@/components/composer";
import { NewsletterArchiveYear, NewsletterPeriodPicker } from "@/components/newsletter-period-picker";
import { NotificationPanel } from "@/components/notification-panel";
import { PostCard } from "@/components/post-card";
import { FeedConnection, FeedPost } from "@/components/post-shared";
import { SearchPanel, SearchPreview } from "@/components/search-panel";
import { useAuthRedirect } from "@/components/use-auth-redirect";
import { useDebouncedValue } from "@/components/use-debounced-value";

type NotificationItem = {
  id: string;
  message: string;
  createdAt: string;
  isRead: boolean;
};

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:4000";
const FEED_SCROLL_KEY = "internal_threads_feed_scroll";

function parseYearParam(value: string | null) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseMonthParam(value: string | null) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 12 ? parsed : null;
}

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
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { token, profile, initialized, setProfile, clearAuth, saveAuth, isAuthenticated } = useAuthRedirect();
  const today = useMemo(() => new Date(), []);
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1;
  const [search, setSearch] = useState("");
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [composerOpenSignal, setComposerOpenSignal] = useState(0);
  const [newPassword, setNewPassword] = useState("");
  const [changePasswordError, setChangePasswordError] = useState<string | null>(null);
  const [impersonateTarget, setImpersonateTarget] = useState<{ employeeId: string; fullName: string; msnv: string } | null>(null);
  const [prefetchNode, setPrefetchNode] = useState<HTMLDivElement | null>(null);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [selectionReady, setSelectionReady] = useState(false);
  const handledPanelRef = useRef<string | null>(null);
  const scrollRestoredRef = useRef(false);
  const debouncedSearch = useDebouncedValue(search, 350);

  const canPost = useMemo(() => Boolean(profile && (profile.role === "ADMIN" || profile.canPost)), [profile]);

  const replaceCurrentParams = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      mutate(params);
      const next = params.toString();
      router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const clearPanelParam = useCallback(() => {
    replaceCurrentParams((params) => params.delete("panel"));
  }, [replaceCurrentParams]);

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
    void fetchMe(token).catch((error) => {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        clearAuth();
      } else {
        console.error("Khong the dong bo phien dang nhap tu /me", error);
      }
    });
  }, [initialized, token, clearAuth, setProfile]);

  const feedQuery = useInfiniteQuery({
    queryKey: ["feed", profile?.id, selectedYear, selectedMonth],
    enabled: Boolean(token && profile?.linked && debouncedSearch.trim() === "" && selectionReady),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => {
      const query = new URLSearchParams({ limit: "5" });
      if (pageParam) query.set("cursor", pageParam);
      query.set("year", String(selectedYear));
      query.set("month", String(selectedMonth));
      return apiRequest<FeedConnection>(`/posts?${query.toString()}`, token!, "GET", undefined, { signal });
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined
  });

  const archiveQuery = useQuery({
    queryKey: ["post-archive", profile?.id],
    enabled: Boolean(token && profile?.linked),
    queryFn: ({ signal }) => apiRequest<NewsletterArchiveYear[]>("/posts/archive", token!, "GET", undefined, { signal }),
    staleTime: 5 * 60 * 1000
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
  const archiveYears = archiveQuery.data ?? [];
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
    const nextYear = parseYearParam(searchParams.get("year")) ?? currentYear;
    const nextMonth = parseMonthParam(searchParams.get("month")) ?? currentMonth;
    setSelectedYear((value) => (value === nextYear ? value : nextYear));
    setSelectedMonth((value) => (value === nextMonth ? value : nextMonth));
    setSelectionReady(true);
  }, [currentMonth, currentYear, searchParams]);

  useEffect(() => {
    if (!selectionReady) return;

    const currentParamYear = parseYearParam(searchParams.get("year"));
    const currentParamMonth = parseMonthParam(searchParams.get("month"));

    if (currentParamYear === selectedYear && currentParamMonth === selectedMonth) {
      return;
    }

    replaceCurrentParams((params) => {
      params.set("year", String(selectedYear));
      params.set("month", String(selectedMonth));
    });
  }, [replaceCurrentParams, searchParams, selectedMonth, selectedYear, selectionReady]);

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

  const handleForceChangePassword = async () => {
    if (!token || !profile) return;
    setChangePasswordError(null);
    try {
      await apiRequest("/auth/change-password", token, "POST", { newPassword });
      saveAuth(token, { ...profile, mustChangePassword: false });
      setNewPassword("");
    } catch (error) {
      setChangePasswordError(error instanceof Error ? error.message : "Không thể đổi mật khẩu");
    }
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

  if (!isAuthenticated || !token || !profile) return <FeedSkeleton />;

  const showInitialSkeleton =
    profile.linked &&
    ((debouncedSearch.trim() === "" && (feedQuery.isLoading || !selectionReady) && feedPosts.length === 0) ||
      (debouncedSearch.trim() !== "" && searchQuery.isLoading && searchResults.length === 0));

  return (
    <>
      <section className="mx-auto w-full max-w-[820px]">
        <section className="mb-6 px-1 py-1 text-center sm:px-0">
          <NewsletterPeriodPicker
            archiveYears={archiveYears}
            selectedYear={selectedYear}
            selectedMonth={selectedMonth}
            onSelect={(year, month) => {
              setSelectedYear(year);
              setSelectedMonth(month);
            }}
          />
        </section>

        <Composer
          token={token}
          canPost={canPost}
          openSignal={composerOpenSignal}
          authorLabel={profile.fullName}
          authorAvatarUrl={profile.avatarUrl}
          impersonateTarget={impersonateTarget}
          onCloseCompose={() => {
            handledPanelRef.current = null;
            if (searchParams.get("panel") || searchParams.get("composeAs")) {
              replaceCurrentParams((params) => {
                params.delete("panel");
                params.delete("composeAs");
              });
            }
            if (impersonateTarget) {
              setImpersonateTarget(null);
              window.sessionStorage.removeItem("admin_compose_target");
            }
          }}
          onCreated={() => {
            handledPanelRef.current = null;
            if (searchParams.get("panel") || searchParams.get("composeAs")) {
              replaceCurrentParams((params) => {
                params.delete("panel");
                params.delete("composeAs");
              });
            }
            if (impersonateTarget) {
              setImpersonateTarget(null);
              window.sessionStorage.removeItem("admin_compose_target");
            }
            void refreshFeedQueries();
          }}
        />

        {showInitialSkeleton ? (
          <FeedSkeleton />
        ) : visiblePosts.length === 0 ? (
          <div className="card px-6 py-10 text-center">
            <h3 className="text-lg font-bold text-slate-900">
              {debouncedSearch.trim() ? "Chưa có bài viết phù hợp" : "Chưa có bản tin trong tháng này."}
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              {debouncedSearch.trim()
                ? "Không tìm thấy bài viết khớp với từ khóa hiện tại."
                : "Hãy chọn tháng khác trong bộ lọc nếu bạn muốn xem lại các số bản tin trước đó."}
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
          className="theme-primary-bg theme-primary-bg-hover fixed bottom-8 right-8 z-20 hidden h-20 w-20 items-center justify-center rounded-[28px] transition lg:inline-flex"
          onClick={() => setComposerOpenSignal((value) => value + 1)}
          aria-label="Mở tạo bài viết"
          style={{ boxShadow: "0 22px 38px -18px color-mix(in srgb, var(--app-accent) 44%, transparent)" }}
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

      {profile.mustChangePassword && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/18 px-4 backdrop-blur-sm">
          <section className="w-full max-w-md rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_30px_80px_-40px_rgba(15,23,42,0.28)]">
            <div className="theme-primary-soft flex h-12 w-12 items-center justify-center rounded-2xl">
              <KeyRound size={22} />
            </div>
            <h2 className="mt-4 text-2xl font-bold tracking-tight text-slate-900">Đổi mật khẩu lần đầu</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Vì bạn đăng nhập bằng mật khẩu được cấp, hãy đặt mật khẩu mới trước khi tiếp tục sử dụng hệ thống.
            </p>
            <input
              className="theme-primary-focus mt-5 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:bg-white"
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder="Mật khẩu mới, tối thiểu 6 ký tự"
            />
            {changePasswordError && <p className="mt-3 text-sm text-red-600">{changePasswordError}</p>}
            <button
              className="btn-primary mt-5 w-full px-4 py-3 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50"
              disabled={newPassword.length < 6}
              onClick={() => void handleForceChangePassword()}
            >
              Lưu mật khẩu mới
            </button>
          </section>
        </div>
      )}
    </>
  );
}

export function HomePageClient() {
  return (
    <Suspense fallback={<main className="min-h-screen" />}>
      <HomePageContent />
    </Suspense>
  );
}
