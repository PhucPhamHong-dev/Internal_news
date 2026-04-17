"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { CredentialResponse, GoogleLogin, GoogleOAuthProvider } from "@react-oauth/google";
import { useParams, useRouter } from "next/navigation";
import { apiRequest } from "@/components/api";
import { Profile, useAuthStore } from "@/components/auth-store";
import { CompanyLogo } from "@/components/company-logo";
import { MsnvModal } from "@/components/msnv-modal";
import { PostDetailView } from "@/components/post-detail-view";
import { FeedPost } from "@/components/post-shared";
import { RelatedPostsSection } from "@/components/related-posts-section";

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";

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

function PostDetailPageContent() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { token, profile, initialized, setProfile, saveAuth, clearAuth } = useAuthStore();
  const [loading, setLoading] = useState(false);

  const postId = useMemo(() => params.id, [params.id]);

  const fetchMe = async (authToken: string) => {
    const me = await apiRequest<Profile>("/me", authToken);
    setProfile(me);
  };

  useEffect(() => {
    if (!initialized || !token) return;
    void fetchMe(token).catch(() => clearAuth());
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
    await Promise.all([postQuery.refetch(), relatedQuery.refetch()]);
  };

  if (!initialized || (token && !profile)) {
    return <DetailSkeleton />;
  }

  if (!token || !profile) {
    return (
      <main className="grid min-h-screen place-items-center px-4">
        <section className="card w-full max-w-md p-7 text-center sm:p-8">
          <div className="flex justify-center">
            <CompanyLogo imageClassName="h-20 w-auto" />
          </div>
          <h1 className="mt-5 text-3xl font-extrabold tracking-tight text-slate-900">Bản tin nội bộ</h1>
          <p className="mt-3 text-sm leading-6 text-slate-500">Đăng nhập bằng Google để xem chi tiết bài viết.</p>
          <div className="mt-6 flex justify-center">
            <GoogleLogin onSuccess={handleGoogleLogin} onError={() => undefined} />
          </div>
          {loading && <p className="mt-4 text-sm text-slate-500">Đang xác thực...</p>}
        </section>
      </main>
    );
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

      {!profile.linked && <MsnvModal onSubmit={handleMsnvSubmit} loading={loading} />}
    </section>
  );
}

export default function PostDetailPage() {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <PostDetailPageContent />
    </GoogleOAuthProvider>
  );
}
