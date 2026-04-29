"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { ArrowLeft } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { ApiError, apiRequest } from "@/components/api";
import { Profile } from "@/components/auth-store";
import { PostDetailView } from "@/components/post-detail-view";
import { FeedPost } from "@/components/post-shared";
import { RelatedPostsSection } from "@/components/related-posts-section";
import { useAuthRedirect } from "@/components/use-auth-redirect";

function DetailSkeleton() {
  return (
    <div className="space-y-4">
      <div className="card animate-pulse px-6 py-6">
        <div className="flex gap-4">
          <div className="h-12 w-12 rounded-full bg-slate-200" />
          <div className="flex-1 space-y-3">
            <div className="h-4 w-40 rounded-full bg-slate-200" />
            <div className="h-7 w-3/4 rounded-full bg-slate-200" />
            <div className="space-y-2">
              <div className="h-4 w-full rounded-full bg-slate-100" />
              <div className="h-4 w-5/6 rounded-full bg-slate-100" />
            </div>
          </div>
        </div>
      </div>
      <div className="card animate-pulse px-6 py-6">
        <div className="mb-4 h-5 w-32 rounded-full bg-slate-200" />
        <div className="space-y-3">
          <div className="h-20 rounded-[24px] bg-slate-100" />
          <div className="h-20 rounded-[24px] bg-slate-100" />
        </div>
      </div>
    </div>
  );
}

export default function PostDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { token, profile, initialized, setProfile, clearAuth, isAuthenticated } = useAuthRedirect();
  const postId = useMemo(() => params.id, [params.id]);

  const fetchMe = async (authToken: string) => {
    const me = await apiRequest<Profile>("/me", authToken);
    setProfile(me);
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

  const postQuery = useQuery({
    queryKey: ["post-detail", postId, profile?.id],
    enabled: Boolean(token && profile?.linked && postId),
    queryFn: ({ signal }) => apiRequest<FeedPost>(`/posts/${postId}`, token!, "GET", undefined, { signal })
  });

  const relatedQuery = useQuery({
    queryKey: ["post-related", postId, profile?.id],
    enabled: Boolean(token && profile?.linked && postId),
    queryFn: ({ signal }) => apiRequest<FeedPost[]>(`/posts/${postId}/related?limit=4`, token!, "GET", undefined, { signal })
  });

  useEffect(() => {
    if (!token || !profile?.linked || !postId) return;
    void apiRequest(`/posts/${postId}/view`, token, "POST").catch(() => undefined);
  }, [postId, profile?.linked, token]);

  if (!initialized || !isAuthenticated || !token || !profile) {
    return <DetailSkeleton />;
  }

  return (
    <section className="mx-auto w-full max-w-[780px]">
      <button
        className="mb-4 inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
        onClick={() => router.push("/")}
      >
        <ArrowLeft size={16} />
        Quay lại feed
      </button>

      {postQuery.isLoading && !postQuery.data ? (
        <DetailSkeleton />
      ) : postQuery.data ? (
        <>
          <PostDetailView
            post={postQuery.data}
            token={token}
            profile={profile}
            onRefreshPost={async () => {
              await postQuery.refetch();
            }}
            onDeleted={() => router.push("/")}
          />
          <RelatedPostsSection posts={relatedQuery.data ?? []} />
        </>
      ) : (
        <DetailSkeleton />
      )}
    </section>
  );
}
