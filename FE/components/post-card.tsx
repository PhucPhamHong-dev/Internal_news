"use client";

import { useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Eye, Heart, MessageCircle, MoreHorizontal, PenSquare, Pin, Trash2 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { apiRequest } from "./api";
import { Profile } from "./auth-store";
import { EditablePost, PostEditorModal } from "./post-editor-modal";
import { capturePostQueryState, restorePostQueryState, updatePostCounters } from "./post-query-cache";
import { Avatar, FeedPost, REACTION_OPTIONS, RelativeTime } from "./post-shared";
import { ReactionSummaryModal } from "./reaction-summary-modal";

const LAST_FEED_ROUTE_KEY = "internal_threads_last_feed_route";

type PostCardProps = {
  post: FeedPost;
  token: string;
  profile: Profile;
  onRefresh: () => void;
};

export function PostCard({ post, token, profile, onRefresh }: PostCardProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [menuOpen, setMenuOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [editLoadError, setEditLoadError] = useState<string | null>(null);
  const [editPost, setEditPost] = useState<EditablePost | null>(null);
  const [reactionsOpen, setReactionsOpen] = useState(false);
  const [reactionSummaryOpen, setReactionSummaryOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const reactionsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const canPin = useMemo(() => {
    if (profile.role === "ADMIN") return true;
    return profile.canPost && post.authorId === profile.id;
  }, [post.authorId, profile.canPost, profile.id, profile.role]);

  const canManagePost = useMemo(() => {
    if (profile.role === "ADMIN") return true;
    return profile.canPost && post.authorId === profile.id;
  }, [post.authorId, profile.canPost, profile.id, profile.role]);

  const previewMedia = post.media[0] ?? null;
  const currentFeedUrl = useMemo(() => {
    const query = searchParams.toString();
    return query ? `${pathname}?${query}` : pathname;
  }, [pathname, searchParams]);

  useEffect(() => {
    const onClickOutside = (event: MouseEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };

    if (menuOpen) {
      document.addEventListener("mousedown", onClickOutside);
      return () => document.removeEventListener("mousedown", onClickOutside);
    }

    return undefined;
  }, [menuOpen]);

  useEffect(() => {
    return () => {
      if (reactionsTimerRef.current) {
        clearTimeout(reactionsTimerRef.current);
      }
    };
  }, []);

  const prefetchPostDetail = () => {
    void router.prefetch(`/posts/${post.id}`);
    void queryClient.prefetchQuery({
      queryKey: ["post-detail", post.id, profile.id],
      queryFn: ({ signal }) => apiRequest(`/posts/${post.id}`, token, "GET", undefined, { signal })
    });
  };

  const rememberFeedRoute = () => {
    if (typeof window === "undefined") return;
    window.sessionStorage.setItem(LAST_FEED_ROUTE_KEY, currentFeedUrl);
  };

  const setReaction = async (reactionType: (typeof REACTION_OPTIONS)[number]["type"] | null) => {
    const nextLiked = Boolean(reactionType);
    const snapshot = capturePostQueryState(queryClient, post.id);

    updatePostCounters(queryClient, post.id, {
      likedByMe: nextLiked,
      likeCount: post.likeCount + (post.likedByMe === nextLiked ? 0 : nextLiked ? 1 : -1),
      myReaction: reactionType
    });

    try {
      if (reactionType) {
        await apiRequest(`/posts/${post.id}/reaction`, token, "POST", { type: reactionType });
      } else {
        await apiRequest(`/posts/${post.id}/reaction`, token, "DELETE");
      }
    } catch (error) {
      restorePostQueryState(queryClient, snapshot);
      window.alert(error instanceof Error ? error.message : "Không thể cập nhật cảm xúc");
    }
  };

  const activeReaction = REACTION_OPTIONS.find((item) => item.type === post.myReaction);

  const openReactions = () => {
    if (reactionsTimerRef.current) clearTimeout(reactionsTimerRef.current);
    setReactionsOpen(true);
  };

  const closeReactions = () => {
    if (reactionsTimerRef.current) clearTimeout(reactionsTimerRef.current);
    reactionsTimerRef.current = setTimeout(() => setReactionsOpen(false), 220);
  };

  const openEditModal = async () => {
    try {
      setEditLoading(true);
      setEditLoadError(null);
      const detail = await apiRequest<EditablePost>(`/posts/${post.id}`, token, "GET");
      setEditPost(detail);
      setEditOpen(true);
      setMenuOpen(false);
    } catch (error) {
      setEditLoadError(error instanceof Error ? error.message : "Khong the tai bai viet");
      setEditOpen(true);
    } finally {
      setEditLoading(false);
    }
  };

  const deletePost = async () => {
    const confirmed = window.confirm("Bạn có chắc muốn xóa bài viết này không?");
    if (!confirmed) return;

    try {
      await apiRequest(`/posts/${post.id}`, token, "DELETE");
      setMenuOpen(false);
      onRefresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Không thể xóa bài viết");
    }
  };

  return (
    <>
      <article className="card mb-4 overflow-hidden transition hover:shadow-[0_22px_55px_-36px_rgba(15,23,42,0.2)]">
        <div className="flex gap-4 px-5 py-5 sm:px-6">
          <div className="flex w-12 shrink-0 items-start justify-center pt-0.5">
            <Avatar name={post.authorName} avatarUrl={post.authorAvatar} />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <Link href={`/posts/${post.id}`} className="min-w-0 flex-1" onMouseEnter={prefetchPostDetail} onClick={rememberFeedRoute}>
                <div className="flex flex-wrap items-center gap-2 text-[14px] text-slate-500">
                  <span className="font-bold text-slate-900">{post.authorName}</span>
                  <span>·</span>
                  <RelativeTime createdAt={post.createdAt} />
                </div>

                {post.title.trim() && <h3 className="mt-1 text-[22px] font-bold leading-tight text-slate-900">{post.title}</h3>}

                {post.isPinned && (
                  <div className="theme-primary-soft mt-2 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold">
                    <Pin size={11} />
                    Ưu tiên {post.pinPriority}
                  </div>
                )}
              </Link>

              <div className="flex items-center gap-2 text-slate-400">
                {canPin && (
                  <button
                    className="icon-btn h-9 w-9 rounded-full hover:bg-[color:var(--app-accent-faint)] hover:text-[color:var(--app-accent)]"
                    onClick={async () => {
                      if (post.isPinned) {
                        await apiRequest(`/posts/${post.id}/pin`, token, "DELETE");
                      } else {
                        await apiRequest(`/posts/${post.id}/pin`, token, "POST");
                      }
                      onRefresh();
                    }}
                    aria-label={post.isPinned ? "Bỏ ghim" : "Ghim"}
                  >
                    <Pin size={16} />
                  </button>
                )}

                {canManagePost && (
                  <div className="relative" ref={menuRef}>
                    <button
                      className="icon-btn h-9 w-9 rounded-full hover:bg-slate-100 hover:text-slate-700"
                      aria-label="Tùy chọn"
                      onClick={() => setMenuOpen((value) => !value)}
                    >
                      <MoreHorizontal size={17} />
                    </button>

                    {menuOpen && (
                      <div className="absolute right-0 top-10 z-10 w-52 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-[0_20px_45px_-28px_rgba(15,23,42,0.3)]">
                        <button
                          className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm text-slate-700 transition hover:bg-slate-50"
                          onClick={() => void openEditModal()}
                        >
                          <PenSquare size={16} />
                          <span>Sửa bài viết</span>
                        </button>
                        <button
                          className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm text-red-600 transition hover:bg-red-50"
                          onClick={() => void deletePost()}
                        >
                          <Trash2 size={16} />
                          <span>Xóa bài viết</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <Link href={`/posts/${post.id}`} className="mt-3 block" onMouseEnter={prefetchPostDetail} onClick={rememberFeedRoute}>
              <div className="whitespace-pre-wrap text-[15px] leading-7 text-slate-700">{post.content}</div>

              {previewMedia && (
                <div className="mt-3 overflow-hidden rounded-[24px] border border-slate-200 bg-slate-100 shadow-sm">
                  {previewMedia.type === "IMAGE" ? (
                    <div className="relative h-[280px] w-full">
                      <Image src={previewMedia.url} alt={post.title} fill className="object-cover" sizes="(max-width: 768px) 100vw, 720px" />
                    </div>
                  ) : (
                    <video src={previewMedia.url} className="h-[280px] w-full object-cover" muted playsInline preload="metadata" />
                  )}
                </div>
              )}
            </Link>

            <div className="mt-5 flex items-center gap-6 text-[14px] text-slate-500">
              <div className="relative" onMouseEnter={openReactions} onMouseLeave={closeReactions}>
                <button
                  className={`inline-flex items-center gap-2 transition hover:text-slate-700 ${post.likedByMe ? "theme-primary-text" : ""}`}
                  onClick={() => setReactionSummaryOpen(true)}
                  aria-label="Xem thống kê cảm xúc"
                >
                  {activeReaction ? <span className="text-lg leading-none">{activeReaction.icon}</span> : <Heart size={20} />}
                  <span>{post.likeCount}</span>
                </button>
                <div
                  className={`absolute bottom-7 left-0 z-20 flex gap-1 rounded-full border border-slate-200 bg-white px-2 py-1.5 shadow-[0_18px_45px_-28px_rgba(15,23,42,0.38)] transition ${
                    reactionsOpen ? "pointer-events-auto translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0"
                  }`}
                >
                  {REACTION_OPTIONS.map((reaction) => (
                    <button
                      key={reaction.type}
                      className="flex h-9 w-9 items-center justify-center rounded-full text-xl transition hover:-translate-y-1 hover:bg-slate-50"
                      title={reaction.label}
                      onClick={() => {
                        setReactionsOpen(false);
                        void setReaction(post.myReaction === reaction.type ? null : reaction.type);
                      }}
                    >
                      {reaction.icon}
                    </button>
                  ))}
                </div>
              </div>

              <button className="inline-flex items-center gap-2 transition hover:text-slate-700" onClick={() => router.push(`/posts/${post.id}`)}>
                <MessageCircle size={20} />
                <span>{post.commentCount}</span>
              </button>

              <span className="inline-flex items-center gap-2 text-slate-400">
                <Eye size={18} />
                <span>{post.viewCount}</span>
              </span>
            </div>
          </div>
        </div>
      </article>

      {editOpen && (
        <PostEditorModal
          mode="edit"
          token={token}
          post={editPost}
          loading={editLoading}
          loadError={editLoadError}
          onClose={() => setEditOpen(false)}
          onSaved={onRefresh}
        />
      )}

      <ReactionSummaryModal open={reactionSummaryOpen} postId={post.id} token={token} onClose={() => setReactionSummaryOpen(false)} />
    </>
  );
}
