"use client";

import { useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Eye, Heart, MessageCircle, MoreHorizontal, PenSquare, Pin, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { apiRequest } from "./api";
import { Profile } from "./auth-store";
import { capturePostQueryState, restorePostQueryState, updatePostCounters } from "./post-query-cache";
import { Avatar, FeedPost, RelativeTime } from "./post-shared";

const REACTIONS = [
  { type: "LIKE", icon: "👍", label: "Thích" },
  { type: "LOVE", icon: "❤️", label: "Yêu thích" },
  { type: "CARE", icon: "🥰", label: "Quan tâm" },
  { type: "HAHA", icon: "😄", label: "Haha" },
  { type: "WOW", icon: "😮", label: "Wow" },
  { type: "SAD", icon: "😢", label: "Buồn" },
  { type: "ANGRY", icon: "😡", label: "Giận" }
] as const;

type PostCardProps = {
  post: FeedPost;
  token: string;
  profile: Profile;
  onRefresh: () => void;
};

export function PostCard({ post, token, profile, onRefresh }: PostCardProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [menuOpen, setMenuOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editTitle, setEditTitle] = useState(post.title);
  const [editContent, setEditContent] = useState(post.content);
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [reactionsOpen, setReactionsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const reactionsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const canPin = useMemo(() => {
    if (profile.role === "ADMIN") return true;
    if (profile.role === "WRITER") return post.authorId === profile.id;
    return false;
  }, [post.authorId, profile.id, profile.role]);

  const canManagePost = useMemo(() => {
    if (profile.role === "ADMIN") return true;
    return profile.role === "WRITER" && post.authorId === profile.id;
  }, [post.authorId, profile.id, profile.role]);

  const previewMedia = post.media[0] ?? null;

  useEffect(() => {
    setEditTitle(post.title);
    setEditContent(post.content);
  }, [post.content, post.title]);

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

  const setReaction = async (reactionType: (typeof REACTIONS)[number]["type"] | null) => {
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

  const activeReaction = REACTIONS.find((item) => item.type === post.myReaction);

  const openReactions = () => {
    if (reactionsTimerRef.current) clearTimeout(reactionsTimerRef.current);
    setReactionsOpen(true);
  };

  const closeReactions = () => {
    if (reactionsTimerRef.current) clearTimeout(reactionsTimerRef.current);
    reactionsTimerRef.current = setTimeout(() => setReactionsOpen(false), 220);
  };

  const submitEditPost = async () => {
    if (!editTitle.trim() || !editContent.trim()) return;

    try {
      setEditBusy(true);
      setEditError(null);
      await apiRequest(`/posts/${post.id}`, token, "PATCH", {
        title: editTitle,
        content: editContent
      });
      setEditOpen(false);
      setMenuOpen(false);
      onRefresh();
    } catch (error) {
      setEditError(error instanceof Error ? error.message : "Không thể cập nhật bài viết");
    } finally {
      setEditBusy(false);
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
      <article className="card mb-4 overflow-hidden transition hover:shadow-[0_22px_55px_-36px_rgba(37,99,235,0.32)]">
        <div className="flex gap-4 px-5 py-5 sm:px-6">
          <div className="flex w-12 shrink-0 items-start justify-center pt-0.5">
            <Avatar name={post.authorName} avatarUrl={post.authorAvatar} />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <Link href={`/posts/${post.id}`} className="min-w-0 flex-1" onMouseEnter={prefetchPostDetail}>
                <div className="flex flex-wrap items-center gap-2 text-[14px] text-slate-500">
                  <span className="font-bold text-slate-900">{post.authorName}</span>
                  <span>·</span>
                  <RelativeTime createdAt={post.createdAt} />
                </div>

                {post.title.trim() && <h3 className="mt-1 text-[22px] font-bold leading-tight text-slate-900">{post.title}</h3>}

                {post.isPinned && (
                  <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-600">
                    <Pin size={11} />
                    Ưu tiên {post.pinPriority}
                  </div>
                )}
              </Link>

              <div className="flex items-center gap-2 text-slate-400">
                {canPin && (
                  <button
                    className="icon-btn h-9 w-9 rounded-full hover:bg-blue-50 hover:text-blue-600"
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
                          onClick={() => {
                            setEditOpen(true);
                            setMenuOpen(false);
                          }}
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

            <Link href={`/posts/${post.id}`} className="mt-3 block" onMouseEnter={prefetchPostDetail}>
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
                  className={`inline-flex items-center gap-2 transition hover:text-slate-700 ${post.likedByMe ? "text-blue-600" : ""}`}
                  onClick={() => void setReaction(post.likedByMe ? null : "LIKE")}
                >
                  {activeReaction ? <span className="text-lg leading-none">{activeReaction.icon}</span> : <Heart size={20} />}
                  <span>{post.likeCount}</span>
                </button>
                <div
                  className={`absolute bottom-7 left-0 z-20 flex gap-1 rounded-full border border-slate-200 bg-white px-2 py-1.5 shadow-[0_18px_45px_-28px_rgba(15,23,42,0.38)] transition ${
                    reactionsOpen ? "pointer-events-auto translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0"
                  }`}
                >
                  {REACTIONS.map((reaction) => (
                    <button
                      key={reaction.type}
                      className="flex h-9 w-9 items-center justify-center rounded-full text-xl transition hover:-translate-y-1 hover:bg-slate-50"
                      title={reaction.label}
                      onClick={() => {
                        setReactionsOpen(false);
                        void setReaction(reaction.type);
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
        <div className="fixed inset-0 z-50 bg-slate-900/20 p-4 backdrop-blur-sm" onClick={() => setEditOpen(false)}>
          <div
            className="mx-auto w-full max-w-2xl rounded-[32px] border border-slate-200 bg-white text-slate-900 shadow-[0_35px_90px_-45px_rgba(15,23,42,0.3)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div className="w-10" />
              <h2 className="text-2xl font-bold tracking-tight">Sửa bài viết</h2>
              <button
                className="icon-btn h-10 w-10 rounded-full border border-slate-200 bg-white hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600"
                onClick={() => setEditOpen(false)}
                aria-label="Đóng"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4 px-6 py-5">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-600">Tiêu đề</label>
                <input
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-blue-300 focus:bg-white"
                  value={editTitle}
                  onChange={(event) => setEditTitle(event.target.value)}
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-600">Nội dung</label>
                <textarea
                  className="min-h-48 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-blue-300 focus:bg-white"
                  value={editContent}
                  onChange={(event) => setEditContent(event.target.value)}
                />
              </div>

              {editError && <div className="text-sm text-red-600">{editError}</div>}

              <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
                <button className="rounded-2xl border border-slate-200 px-5 py-2.5 text-slate-600 transition hover:bg-slate-50" onClick={() => setEditOpen(false)}>
                  Đóng
                </button>
                <button
                  className="rounded-2xl bg-blue-600 px-5 py-2.5 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
                  onClick={() => void submitEditPost()}
                  disabled={editBusy || !editTitle.trim() || !editContent.trim()}
                >
                  {editBusy ? "Đang lưu..." : "Lưu thay đổi"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
