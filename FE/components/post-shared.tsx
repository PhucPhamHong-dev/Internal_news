"use client";

import { useEffect, useState } from "react";

export type ReactionType = "LIKE" | "LOVE" | "CARE" | "HAHA" | "WOW" | "SAD" | "ANGRY";

export const REACTION_OPTIONS: Array<{ type: ReactionType; icon: string; label: string }> = [
  { type: "LIKE", icon: "👍", label: "Thích" },
  { type: "LOVE", icon: "❤️", label: "Yêu thích" },
  { type: "CARE", icon: "🥰", label: "Quan tâm" },
  { type: "HAHA", icon: "😄", label: "Haha" },
  { type: "WOW", icon: "😮", label: "Wow" },
  { type: "SAD", icon: "😢", label: "Buồn" },
  { type: "ANGRY", icon: "😡", label: "Giận" }
];

export type FeedPost = {
  id: string;
  authorId: string;
  title: string;
  content: string;
  authorName: string;
  authorAvatar: string | null;
  authorRole: "ADMIN" | "HR_MANAGER" | "WRITER" | "VIEWER";
  isPinned: boolean;
  pinPriority: number | null;
  createdAt: string;
  likeCount: number;
  commentCount: number;
  viewCount: number;
  likedByMe: boolean;
  myReaction?: ReactionType | null;
  blocks?: PostContentBlock[];
  media: Array<{
    id: string;
    type: "IMAGE" | "VIDEO";
    url: string;
    thumbnailUrl?: string | null;
    caption?: string | null;
    publicId?: string;
    thumbnailPublicId?: string | null;
    clientBlockId?: string | null;
    sortOrder?: number | null;
  }>;
};

export type PostContentBlock =
  | { id: string; type: "paragraph"; text: string }
  | { id: string; type: "heading"; text: string }
  | { id: string; type: "quote"; text: string }
  | { id: string; type: "divider" }
  | {
      id: string;
      type: "image";
      url: string;
      thumbnailUrl?: string | null;
      publicId?: string;
      thumbnailPublicId?: string | null;
      caption?: string | null;
    }
  | {
      id: string;
      type: "video";
      url: string;
      publicId?: string;
      caption?: string | null;
    };

export type FeedConnection = {
  items: FeedPost[];
  nextCursor: string | null;
};

export type ReplyItem = {
  id: string;
  content: string;
  createdAt: string;
  nickname: string;
  likeCount: number;
  likedByMe: boolean;
  optimistic?: boolean;
  sendFailed?: boolean;
};

export type CommentItem = {
  id: string;
  content: string;
  createdAt: string;
  nickname: string;
  likeCount: number;
  likedByMe: boolean;
  replyCount: number;
  replies: ReplyItem[];
  hasMoreReplies: boolean;
  nextReplyCursor: string | null;
  optimistic?: boolean;
  sendFailed?: boolean;
};

export type CommentConnection = {
  items: CommentItem[];
  nextCursor: string | null;
};

export type ReplyConnection = {
  items: ReplyItem[];
  nextCursor: string | null;
};

const ANON_AVATAR_COLORS = [
  ["#DBEAFE", "#93C5FD"],
  ["#FCE7F3", "#F9A8D4"],
  ["#FEF3C7", "#FCD34D"],
  ["#DCFCE7", "#86EFAC"],
  ["#EDE9FE", "#C4B5FD"],
  ["#E0F2FE", "#7DD3FC"]
];

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function formatPostTime(createdAt: string) {
  const postDate = new Date(createdAt);
  const now = new Date();
  const diffMs = now.getTime() - postDate.getTime();
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diffMs < hour) {
    const minutes = Math.max(1, Math.floor(diffMs / minute));
    return `${minutes} phút`;
  }

  if (diffMs < day) {
    const hours = Math.max(1, Math.floor(diffMs / hour));
    return `${hours} giờ`;
  }

  if (now.getFullYear() === postDate.getFullYear()) {
    const monthsDiff = now.getMonth() - postDate.getMonth();
    if (monthsDiff < 1) {
      const days = Math.max(1, Math.floor(diffMs / day));
      return `${days} ngày`;
    }
    return `${postDate.getDate()}/${postDate.getMonth() + 1}`;
  }

  return `${pad(postDate.getDate())}/${pad(postDate.getMonth() + 1)}/${postDate.getFullYear()}`;
}

function formatAbsoluteDate(createdAt: string) {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return "";
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

function getInitials(name: string) {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) return "NV";
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? "N";
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

function getHash(value: string) {
  return Array.from(value).reduce((hash, char) => hash + char.charCodeAt(0), 0);
}

function getAvatarPalette(value: string) {
  const palettes = [
    ["#e0f2fe", "#38bdf8"],
    ["#dcfce7", "#34d399"],
    ["#fef3c7", "#f59e0b"],
    ["#fce7f3", "#f472b6"],
    ["#ede9fe", "#8b5cf6"],
    ["#ffedd5", "#fb923c"]
  ];
  return palettes[getHash(value) % palettes.length];
}

export function Avatar({ name, avatarUrl, size = "h-12 w-12" }: { name: string; avatarUrl: string | null; size?: string }) {
  if (avatarUrl) {
    return <img src={avatarUrl} alt={name} className={`${size} rounded-full object-cover shadow-sm`} />;
  }

  const initials = getInitials(name);
  const [from, to] = getAvatarPalette(name);

  return (
    <div
      className={`${size} flex items-center justify-center rounded-full text-sm font-bold text-slate-800 shadow-sm ring-1 ring-white/70`}
      style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}
    >
      {initials}
    </div>
  );
}

export function AnonymousAvatar({ nickname, size = "h-10 w-10" }: { nickname: string; size?: string }) {
  const colors = ANON_AVATAR_COLORS[getHash(nickname) % ANON_AVATAR_COLORS.length];

  return (
    <div
      className={`${size} relative shrink-0 overflow-hidden rounded-full border border-white/70 shadow-sm`}
      style={{ background: `linear-gradient(135deg, ${colors[0]}, ${colors[1]})` }}
      aria-hidden="true"
    >
      <div className="absolute left-1/2 top-[22%] h-[34%] w-[34%] -translate-x-1/2 rounded-full bg-white/90" />
      <div className="absolute bottom-[12%] left-1/2 h-[34%] w-[62%] -translate-x-1/2 rounded-t-full bg-white/90" />
    </div>
  );
}

export function RelativeTime({ createdAt, className }: { createdAt: string; className?: string }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
  }, []);

  return (
    <time className={className} dateTime={createdAt} suppressHydrationWarning>
      {ready ? formatPostTime(createdAt) : formatAbsoluteDate(createdAt)}
    </time>
  );
}

export function resizeTextarea(element: HTMLTextAreaElement, maxHeight = 160) {
  element.style.height = "0px";
  element.style.height = `${Math.min(element.scrollHeight, maxHeight)}px`;
}
