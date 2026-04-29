"use client";

import Image from "next/image";
import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { FeedPost, RelativeTime } from "./post-shared";

type RelatedPostsSectionProps = {
  posts: FeedPost[];
};

function getPreviewText(content: string) {
  const normalized = content.trim().replace(/\s+/g, " ");
  return normalized.length > 140 ? `${normalized.slice(0, 140)}...` : normalized;
}

export function RelatedPostsSection({ posts }: RelatedPostsSectionProps) {
  if (posts.length === 0) return null;

  return (
    <section className="mt-4 rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.22)] sm:p-6">
      <div className="mb-4">
        <h2 className="text-xl font-bold tracking-tight text-slate-900">Bài viết khác</h2>
        <p className="mt-1 text-sm text-slate-500">Tiếp tục khám phá những nội dung nội bộ liên quan.</p>
      </div>

      <div className="space-y-3">
        {posts.map((post) => {
          const thumbnail = post.media.find((item) => item.type === "IMAGE") ?? post.media[0] ?? null;

          return (
            <Link
              key={post.id}
              href={`/posts/${post.id}`}
              className="theme-primary-border-hover flex items-start gap-4 rounded-[24px] border border-slate-200 bg-white px-4 py-4 transition hover:bg-[color:var(--app-accent-faint)]"
            >
              <div className="min-w-0 flex-1">
                <div className="text-[17px] font-semibold leading-7 text-slate-900">{post.title}</div>
                <div className="mt-1 line-clamp-3 text-sm leading-6 text-slate-500">{getPreviewText(post.content)}</div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                  <span className="font-medium text-slate-500">{post.authorName}</span>
                  <span>·</span>
                  <RelativeTime createdAt={post.createdAt} />
                  <span>·</span>
                  <span className="inline-flex items-center gap-1">
                    <MessageCircle size={12} />
                    {post.commentCount}
                  </span>
                </div>
              </div>

              {thumbnail && (
                <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 sm:h-24 sm:w-24">
                  {thumbnail.type === "VIDEO" ? (
                    <video src={thumbnail.url} className="h-full w-full object-cover" muted />
                  ) : (
                    <Image src={thumbnail.url} alt={post.title} fill className="object-cover" sizes="96px" />
                  )}
                </div>
              )}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
