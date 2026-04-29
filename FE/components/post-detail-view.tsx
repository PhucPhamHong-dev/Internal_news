"use client";

import { InfiniteData, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Eye, Heart, MoreHorizontal, PenSquare, Pin, SendHorizontal, Trash2, X } from "lucide-react";
import { apiRequest } from "./api";
import { Profile } from "./auth-store";
import { EditablePost, PostEditorModal } from "./post-editor-modal";
import { PostContentBlocks } from "./post-content-blocks";
import { capturePostQueryState, restorePostQueryState, updatePostCounters } from "./post-query-cache";
import { ReactionSummaryModal } from "./reaction-summary-modal";
import {
  AnonymousAvatar,
  Avatar,
  CommentConnection,
  CommentItem,
  FeedPost,
  REACTION_OPTIONS,
  RelativeTime,
  ReplyConnection,
  ReplyItem,
  resizeTextarea
} from "./post-shared";

type PostDetailViewProps = {
  post: FeedPost;
  token: string;
  profile: Profile;
  onRefreshPost: () => Promise<void> | void;
  onDeleted?: () => void;
};

type ReplyTarget = {
  id: string;
  nickname: string;
};

type CommentIdentity = {
  fullName: string;
  employeeId: string | null;
  email: string | null;
  avatarUrl?: string | null;
  role?: "ADMIN" | "WRITER" | "VIEWER";
};

type ReplyState = {
  items: ReplyItem[];
  nextCursor: string | null;
  loading: boolean;
  error: string | null;
};

type HydratedComment = CommentItem & {
  replyLoading: boolean;
  replyError: string | null;
};

const COMMENT_PAGE_SIZE = 5;
const REPLY_PAGE_SIZE = 3;

function CommentsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-4 animate-pulse">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="flex gap-3">
          <div className="h-10 w-10 rounded-full bg-slate-200" />
          <div className="flex-1 space-y-2">
            <div className="h-20 rounded-[24px] bg-slate-100" />
            <div className="h-4 w-28 rounded-full bg-slate-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

function dedupeReplies(replies: ReplyItem[]) {
  const seen = new Set<string>();
  return replies.filter((reply) => {
    if (seen.has(reply.id)) return false;
    seen.add(reply.id);
    return true;
  });
}

function updateInfiniteComments(
  data: InfiniteData<CommentConnection> | undefined,
  updater: (comment: CommentItem) => CommentItem
) {
  if (!data) return data;

  let changed = false;
  const pages = data.pages.map((page) => {
    const items = page.items.map((comment) => {
      const next = updater(comment);
      if (next !== comment) changed = true;
      return next;
    });

    return changed ? { ...page, items } : page;
  });

  return changed ? { ...data, pages } : data;
}

export function PostDetailView({ post, token, profile, onRefreshPost, onDeleted }: PostDetailViewProps) {
  const queryClient = useQueryClient();
  const commentsQueryKey = ["post-comments", post.id, profile.id] as const;
  const [identityModalOpen, setIdentityModalOpen] = useState(false);
  const [identityLoading, setIdentityLoading] = useState(false);
  const [identityError, setIdentityError] = useState<string | null>(null);
  const [identityData, setIdentityData] = useState<CommentIdentity | null>(null);
  const [commentInput, setCommentInput] = useState("");
  const [commentError, setCommentError] = useState<string | null>(null);
  const [commentBusy, setCommentBusy] = useState(false);
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null);
  const [replyState, setReplyState] = useState<Record<string, ReplyState>>({});
  const [menuOpen, setMenuOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editPost, setEditPost] = useState<EditablePost | null>(post as EditablePost);
  const [editLoading, setEditLoading] = useState(false);
  const [editLoadError, setEditLoadError] = useState<string | null>(null);
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
  const activePostReaction = REACTION_OPTIONS.find((item) => item.type === post.myReaction);

  const commentsQuery = useInfiniteQuery({
    queryKey: commentsQueryKey,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => {
      const query = new URLSearchParams({ mode: "all", limit: String(COMMENT_PAGE_SIZE) });
      if (pageParam) query.set("cursor", pageParam);
      return apiRequest<CommentConnection>(`/posts/${post.id}/comments?${query.toString()}`, token, "GET", undefined, { signal });
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined
  });

  useEffect(() => {
    setEditPost(post as EditablePost);
  }, [post]);

  useEffect(() => {
    const onClickOutside = (event: MouseEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };

    if (menuOpen) document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [menuOpen]);

  useEffect(() => {
    return () => {
      if (reactionsTimerRef.current) clearTimeout(reactionsTimerRef.current);
    };
  }, []);

  const comments = useMemo<HydratedComment[]>(() => {
    const baseItems = commentsQuery.data?.pages.flatMap((page) => page.items) ?? [];
    return baseItems.map((comment) => {
      const extra = replyState[comment.id];
      const mergedReplies = dedupeReplies([...comment.replies, ...(extra?.items ?? [])]);
      const nextReplyCursor = extra?.nextCursor ?? comment.nextReplyCursor;
      return {
        ...comment,
        replies: mergedReplies,
        nextReplyCursor,
        hasMoreReplies: nextReplyCursor !== null,
        replyLoading: extra?.loading ?? false,
        replyError: extra?.error ?? null
      };
    });
  }, [commentsQuery.data, replyState]);

  const inspectIdentity = async (commentId: string) => {
    if (profile.role !== "ADMIN") return;

    setIdentityModalOpen(true);
    setIdentityLoading(true);
    setIdentityError(null);
    setIdentityData(null);

    try {
      const identity = await apiRequest<CommentIdentity>(`/admin/comments/${commentId}/identity`, token);
      setIdentityData(identity);
    } catch (error) {
      setIdentityError(error instanceof Error ? error.message : "Không có quyền truy cập");
    } finally {
      setIdentityLoading(false);
    }
  };

  const closeIdentityModal = () => {
    setIdentityModalOpen(false);
    setIdentityLoading(false);
    setIdentityError(null);
    setIdentityData(null);
  };

  const openReactions = () => {
    if (reactionsTimerRef.current) clearTimeout(reactionsTimerRef.current);
    setReactionsOpen(true);
  };

  const closeReactions = () => {
    if (reactionsTimerRef.current) clearTimeout(reactionsTimerRef.current);
    reactionsTimerRef.current = setTimeout(() => setReactionsOpen(false), 220);
  };

  const setPostReaction = async (reactionType: (typeof REACTION_OPTIONS)[number]["type"] | null) => {
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

  const toggleCommentLike = async (commentId: string, likedByMe: boolean) => {
    if (commentId.startsWith("optimistic-")) return;

    const snapshot = queryClient.getQueryData<InfiniteData<CommentConnection>>(commentsQueryKey);

    queryClient.setQueryData<InfiniteData<CommentConnection>>(commentsQueryKey, (current) =>
      updateInfiniteComments(current, (comment) => {
        if (comment.id === commentId) {
          return {
            ...comment,
            likedByMe: !likedByMe,
            likeCount: Math.max(0, comment.likeCount + (likedByMe ? -1 : 1))
          };
        }

        const nextReplies = comment.replies.map((reply) =>
          reply.id === commentId
            ? { ...reply, likedByMe: !likedByMe, likeCount: Math.max(0, reply.likeCount + (likedByMe ? -1 : 1)) }
            : reply
        );

        if (nextReplies.every((reply, index) => reply === comment.replies[index])) {
          return comment;
        }

        return { ...comment, replies: nextReplies };
      })
    );

    try {
      await apiRequest(`/comments/${commentId}/${likedByMe ? "unlike" : "like"}`, token, "POST");
    } catch (error) {
      queryClient.setQueryData(commentsQueryKey, snapshot);
      window.alert(error instanceof Error ? error.message : "Không thể cập nhật lượt thích bình luận");
    }
  };

  const submitComment = async () => {
    const trimmed = commentInput.trim();
    if (!trimmed) return;

    const optimisticId = `optimistic-${Date.now()}`;
    const optimisticCreatedAt = new Date().toISOString();
    const previousComments = queryClient.getQueryData<InfiniteData<CommentConnection>>(commentsQueryKey);
    const previousCommentCount = post.commentCount;

    setCommentBusy(true);
    setCommentError(null);
    setCommentInput("");

    if (replyTarget) {
      queryClient.setQueryData<InfiniteData<CommentConnection>>(commentsQueryKey, (current) =>
        updateInfiniteComments(current, (comment) => {
          if (comment.id !== replyTarget.id) return comment;

          const optimisticReply: ReplyItem = {
            id: optimisticId,
            content: trimmed,
            createdAt: optimisticCreatedAt,
            nickname: "Đang gửi...",
            likeCount: 0,
            likedByMe: false,
            optimistic: true
          };

          return {
            ...comment,
            replies: comment.replies.length < 2 ? [...comment.replies, optimisticReply] : comment.replies,
            replyCount: comment.replyCount + 1,
            hasMoreReplies: comment.replies.length >= 2 ? true : comment.hasMoreReplies,
            nextReplyCursor: comment.replies.length >= 2 ? comment.nextReplyCursor ?? comment.replies[comment.replies.length - 1]?.id ?? null : comment.nextReplyCursor
          };
        })
      );
    } else {
      const optimisticComment: CommentItem = {
        id: optimisticId,
        content: trimmed,
        createdAt: optimisticCreatedAt,
        nickname: "Đang gửi...",
        likeCount: 0,
        likedByMe: false,
        replyCount: 0,
        replies: [],
        hasMoreReplies: false,
        nextReplyCursor: null,
        optimistic: true
      };

      queryClient.setQueryData<InfiniteData<CommentConnection>>(commentsQueryKey, (current) => {
        if (!current) {
          return {
            pageParams: [null],
            pages: [{ items: [optimisticComment], nextCursor: null }]
          };
        }

        const firstPage = current.pages[0] ?? { items: [], nextCursor: null };
        return {
          ...current,
          pages: [{ ...firstPage, items: [optimisticComment, ...firstPage.items] }, ...current.pages.slice(1)]
        };
      });
    }

    updatePostCounters(queryClient, post.id, { commentCount: previousCommentCount + 1 });

    try {
      const created = replyTarget
        ? await apiRequest<CommentItem>(`/comments/${replyTarget.id}/replies`, token, "POST", { content: trimmed })
        : await apiRequest<CommentItem>(`/posts/${post.id}/comments`, token, "POST", { content: trimmed });

      queryClient.setQueryData<InfiniteData<CommentConnection>>(commentsQueryKey, (current) => {
        if (!current) return current;

        if (replyTarget) {
          return updateInfiniteComments(current, (comment) => {
            if (comment.id !== replyTarget.id) return comment;

            const hasOptimistic = comment.replies.some((reply) => reply.id === optimisticId);
            const nextReplies = hasOptimistic
              ? comment.replies.map((reply) => (reply.id === optimisticId ? created : reply))
              : dedupeReplies([...comment.replies, created]);

            return {
              ...comment,
              replies: nextReplies
            };
          });
        }

        return updateInfiniteComments(current, (comment) => (comment.id === optimisticId ? created : comment));
      });

      setReplyTarget(null);
    } catch (error) {
      queryClient.setQueryData(commentsQueryKey, previousComments);
      updatePostCounters(queryClient, post.id, { commentCount: previousCommentCount });
      setCommentInput(trimmed);
      setCommentError(error instanceof Error ? error.message : "Không thể gửi bình luận");
    } finally {
      setCommentBusy(false);
    }
  };

  const loadMoreReplies = async (commentId: string, cursor: string | null) => {
    if (!cursor) return;

    setReplyState((current) => ({
      ...current,
      [commentId]: {
        items: current[commentId]?.items ?? [],
        nextCursor: current[commentId]?.nextCursor ?? cursor,
        loading: true,
        error: null
      }
    }));

    try {
      const query = new URLSearchParams({ limit: String(REPLY_PAGE_SIZE), cursor });
      const response = await apiRequest<ReplyConnection>(`/comments/${commentId}/replies?${query.toString()}`, token);
      setReplyState((current) => ({
        ...current,
        [commentId]: {
          items: dedupeReplies([...(current[commentId]?.items ?? []), ...response.items]),
          nextCursor: response.nextCursor,
          loading: false,
          error: null
        }
      }));
    } catch (error) {
      setReplyState((current) => ({
        ...current,
        [commentId]: {
          items: current[commentId]?.items ?? [],
          nextCursor: current[commentId]?.nextCursor ?? cursor,
          loading: false,
          error: error instanceof Error ? error.message : "Không thể tải thêm phản hồi"
        }
      }));
    }
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
      onDeleted?.();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Không thể xóa bài viết");
    }
  };

  const renderCommentBody = (item: CommentItem | ReplyItem, onInspect?: () => void) => {
    const content = (
      <>
        <div className="flex flex-wrap items-center gap-2 text-[14px] text-slate-500">
          <span className={`font-semibold text-slate-900 ${profile.role === "ADMIN" ? "hover:text-[color:var(--app-accent)] hover:underline" : ""}`}>{item.nickname}</span>
          <span>·</span>
          <RelativeTime createdAt={item.createdAt} />
          {item.optimistic && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-600">Đang gửi</span>}
        </div>
        <p className="mt-1 whitespace-pre-wrap text-[15px] leading-7 text-slate-700">{item.content}</p>
      </>
    );

    if (profile.role !== "ADMIN") {
      return <div className="w-full rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-3 text-left">{content}</div>;
    }

    return (
      <button
        type="button"
        className="theme-primary-border-hover w-full rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-3 text-left transition hover:bg-[color:var(--app-accent-faint)]"
        onClick={onInspect}
      >
        {content}
      </button>
    );
  };

  const renderCommentAction = (item: CommentItem | ReplyItem, nickname: string, isReply = false) => (
    <div className={`mt-2 flex items-center gap-4 text-sm text-slate-500 ${isReply ? "pl-12" : ""}`}>
      <button
        className={`inline-flex items-center gap-1.5 transition hover:text-slate-700 ${item.likedByMe ? "text-red-500" : ""}`}
        disabled={Boolean(item.optimistic || item.sendFailed || item.id.startsWith("optimistic-"))}
        onClick={() => void toggleCommentLike(item.id, item.likedByMe)}
      >
        <Heart size={15} fill={item.likedByMe ? "#EF4444" : "none"} />
        <span>{item.likeCount}</span>
      </button>
      {!isReply && (
        <button className="transition hover:text-slate-700" onClick={() => setReplyTarget({ id: item.id, nickname })}>
          Trả lời
        </button>
      )}
    </div>
  );
  return (
    <>
      <article className="card overflow-hidden">
        <div className="flex gap-4 px-5 py-5 sm:px-6">
          <div className="flex w-12 shrink-0 items-start justify-center pt-0.5">
            <Avatar name={post.authorName} avatarUrl={post.authorAvatar} />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-[14px] text-slate-500">
                  <span className="font-bold text-slate-900">{post.authorName}</span>
                  <span>·</span>
                  <RelativeTime createdAt={post.createdAt} />
                </div>
                {post.title.trim() && <h1 className="mt-1 text-[24px] font-bold leading-tight text-slate-900">{post.title}</h1>}
                {post.isPinned && (
                  <div className="theme-primary-soft mt-2 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold">
                    <Pin size={11} />
                    Ưu tiên {post.pinPriority}
                  </div>
                )}
              </div>

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
                      await onRefreshPost();
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

            <PostContentBlocks blocks={post.blocks} fallbackContent={post.content} fallbackMedia={post.media} />

            <div className="mt-5 flex items-center gap-6 text-[14px] text-slate-500">
              <div className="relative" onMouseEnter={openReactions} onMouseLeave={closeReactions}>
                <button
                  className={`inline-flex items-center gap-2 transition hover:text-slate-700 ${post.likedByMe ? "theme-primary-text" : ""}`}
                  onClick={() => setReactionSummaryOpen(true)}
                  aria-label="Xem thống kê cảm xúc"
                >
                  {activePostReaction ? <span className="text-lg leading-none">{activePostReaction.icon}</span> : <Heart size={20} />}
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
                        void setPostReaction(post.myReaction === reaction.type ? null : reaction.type);
                      }}
                    >
                      {reaction.icon}
                    </button>
                  ))}
                </div>
              </div>

              <a href="#comments" className="inline-flex items-center gap-2 transition hover:text-slate-700">
                <span>{post.commentCount} bình luận</span>
              </a>

              <span className="inline-flex items-center gap-2 text-slate-400">
                <Eye size={18} />
                <span>{post.viewCount}</span>
              </span>
            </div>
          </div>
        </div>
      </article>

      <section id="comments" className="card mt-4 overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-4 sm:px-6">
          <h2 className="text-lg font-bold text-slate-900">Bình luận</h2>
        </div>

        <div className="px-5 py-5 sm:px-6">
          {commentsQuery.isLoading && comments.length === 0 ? (
            <CommentsSkeleton />
          ) : comments.length === 0 ? (
            <div className="text-sm text-slate-500">Chưa có bình luận nào.</div>
          ) : (
            <div className="space-y-5">
              {comments.map((comment) => (
                <div key={comment.id} className="flex gap-3">
                  <AnonymousAvatar nickname={comment.nickname} />

                  <div className="min-w-0 flex-1">
                    {renderCommentBody(comment, () => void inspectIdentity(comment.id))}
                    {renderCommentAction(comment, comment.nickname)}

                    {comment.replies.length > 0 && (
                      <div className="mt-4 space-y-4 pl-8">
                        {comment.replies.map((reply) => (
                          <div key={reply.id}>
                            <div className="flex gap-3">
                              <AnonymousAvatar nickname={reply.nickname} size="h-9 w-9" />
                              <div className="min-w-0 flex-1">{renderCommentBody(reply, () => void inspectIdentity(reply.id))}</div>
                            </div>
                            {renderCommentAction(reply, reply.nickname, true)}
                          </div>
                        ))}

                        {comment.hasMoreReplies && (
                          <button
                            className="theme-primary-text pl-12 text-sm font-medium transition hover:text-[color:var(--app-accent-hover)]"
                            onClick={() => void loadMoreReplies(comment.id, comment.nextReplyCursor)}
                            disabled={comment.replyLoading}
                          >
                            {comment.replyLoading ? "Đang tải phản hồi..." : `Xem thêm phản hồi (${comment.replyCount})`}
                          </button>
                        )}

                        {comment.replyError && <div className="pl-12 text-sm text-red-600">{comment.replyError}</div>}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {commentsQuery.hasNextPage && (
                <button
                  className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
                  onClick={() => void commentsQuery.fetchNextPage()}
                  disabled={commentsQuery.isFetchingNextPage}
                >
                  {commentsQuery.isFetchingNextPage ? "Đang tải thêm..." : "Xem thêm bình luận"}
                </button>
              )}

              {commentsQuery.isFetchingNextPage && <CommentsSkeleton count={2} />}
            </div>
          )}
        </div>
        <div className="border-t border-slate-100 px-5 py-4 sm:px-6">
          {replyTarget && (
            <div className="theme-primary-soft mb-3 flex items-center justify-between rounded-2xl px-4 py-2 text-sm">
              <span>Đang trả lời {replyTarget.nickname}</span>
              <button className="theme-primary-text font-medium hover:text-[color:var(--app-accent-hover)]" onClick={() => setReplyTarget(null)}>
                Bỏ chọn
              </button>
            </div>
          )}

          {commentError && <div className="mb-3 text-sm text-red-600">{commentError}</div>}

          <div className="flex items-center gap-3">
            <AnonymousAvatar nickname={`${profile.id}-${post.id}`} size="h-11 w-11" />

            <div className="theme-primary-focus flex min-h-14 flex-1 items-center rounded-[28px] border border-slate-200 bg-slate-50 px-4 py-3 focus-within:bg-white">
              <textarea
                rows={1}
                className="w-full resize-none overflow-hidden bg-transparent text-[15px] leading-6 text-slate-700 outline-none placeholder:text-slate-400"
                placeholder={replyTarget ? `Trả lời ${replyTarget.nickname}...` : "Viết bình luận ẩn danh..."}
                value={commentInput}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    if (commentInput.trim()) {
                      void submitComment();
                    }
                  }
                }}
                onChange={(event) => {
                  setCommentInput(event.target.value);
                  resizeTextarea(event.target, 160);
                }}
              />
            </div>

            <button
              className="theme-primary-bg theme-primary-bg-hover inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-40"
              disabled={commentBusy || !commentInput.trim()}
              onClick={() => void submitComment()}
            >
              <SendHorizontal size={18} />
            </button>
          </div>
        </div>
      </section>

      {editOpen && (
        <PostEditorModal
          mode="edit"
          token={token}
          post={editPost}
          loading={editLoading}
          loadError={editLoadError}
          onClose={() => setEditOpen(false)}
          onSaved={() => void onRefreshPost()}
        />
      )}
      {identityModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/18 p-4 backdrop-blur-sm" onClick={closeIdentityModal}>
          <div
            className="mx-auto w-full max-w-md rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_30px_80px_-40px_rgba(15,23,42,0.28)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-bold tracking-tight text-slate-900">Người dùng</h3>
                <p className="mt-1 text-sm text-slate-500">Thông tin thật phía sau bình luận ẩn danh.</p>
              </div>
              <button className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700" onClick={closeIdentityModal}>
                <X size={18} />
              </button>
            </div>

            {identityLoading ? (
              <div className="animate-pulse space-y-3">
                <div className="h-16 rounded-[24px] bg-slate-100" />
                <div className="h-14 rounded-[24px] bg-slate-100" />
                <div className="h-14 rounded-[24px] bg-slate-100" />
              </div>
            ) : identityError ? (
              <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">{identityError}</div>
            ) : identityData ? (
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  {identityData.avatarUrl ? (
                    <img src={identityData.avatarUrl} alt={identityData.fullName} className="h-14 w-14 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-700">
                      {identityData.fullName
                        .split(/\s+/)
                        .slice(0, 2)
                        .map((part) => part[0]?.toUpperCase() ?? "")
                        .join("")}
                    </div>
                  )}
                  <div>
                    <div className="text-lg font-semibold text-slate-900">{identityData.fullName}</div>
                    {identityData.role && <div className="text-sm text-slate-500">{identityData.role}</div>}
                  </div>
                </div>

                <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 px-4 py-4 text-sm text-slate-700">
                  <div>
                    <span className="font-medium text-slate-500">Họ tên:</span> {identityData.fullName}
                  </div>
                  <div className="mt-2">
                    <span className="font-medium text-slate-500">MSNV:</span> {identityData.employeeId ?? "Chưa có"}
                  </div>
                  <div className="mt-2">
                    <span className="font-medium text-slate-500">Email:</span> {identityData.email ?? "Chưa liên kết"}
                  </div>
                </div>

                <div className="flex justify-end">
                  <button className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50" onClick={closeIdentityModal}>
                    Đóng
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
      <ReactionSummaryModal open={reactionSummaryOpen} postId={post.id} token={token} onClose={() => setReactionSummaryOpen(false)} />
    </>
  );
}
