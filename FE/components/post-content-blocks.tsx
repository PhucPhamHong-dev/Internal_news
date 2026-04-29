"use client";

import { FeedPost, PostContentBlock } from "./post-shared";

type PostContentBlocksProps = {
  blocks?: PostContentBlock[];
  fallbackContent: string;
  fallbackMedia: FeedPost["media"];
};

function getRenderableBlocks(blocks: PostContentBlocksProps["blocks"], fallbackContent: string, fallbackMedia: FeedPost["media"]) {
  if (blocks && blocks.length > 0) return blocks;

  const fallbackBlocks: PostContentBlock[] = [];
  if (fallbackContent.trim()) {
    fallbackBlocks.push({ id: "fallback-content", type: "paragraph", text: fallbackContent });
  }

  fallbackMedia.forEach((item) => {
    if (item.type === "VIDEO") {
      fallbackBlocks.push({
        id: item.id,
        type: "video",
        url: item.url,
        caption: item.caption ?? null
      });
      return;
    }

    fallbackBlocks.push({
      id: item.id,
      type: "image",
      url: item.url,
      thumbnailUrl: item.thumbnailUrl ?? null,
      caption: item.caption ?? null
    });
  });

  return fallbackBlocks;
}

export function PostContentBlocks({ blocks, fallbackContent, fallbackMedia }: PostContentBlocksProps) {
  const renderableBlocks = getRenderableBlocks(blocks, fallbackContent, fallbackMedia);

  return (
    <div className="mt-4 space-y-4">
      {renderableBlocks.map((block) => {
        if (block.type === "paragraph") {
          return (
            <p key={block.id} className="whitespace-pre-wrap text-[15px] leading-7 text-slate-700 sm:text-base sm:leading-8">
              {block.text}
            </p>
          );
        }

        if (block.type === "heading") {
          return (
            <h3 key={block.id} className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
              {block.text}
            </h3>
          );
        }

        if (block.type === "quote") {
          return (
            <blockquote key={block.id} className="rounded-r-[22px] border-l-4 border-[color:var(--primary)] bg-[color:var(--primary-faint)] px-5 py-4 text-[15px] italic leading-7 text-slate-700 sm:text-base">
              {block.text}
            </blockquote>
          );
        }

        if (block.type === "divider") {
          return <hr key={block.id} className="border-slate-200" />;
        }

        if (block.type === "video") {
          return (
            <figure key={block.id} className="space-y-2">
              <video controls className="max-h-[620px] w-full rounded-[24px] border border-slate-200 bg-slate-100 object-contain">
                <source src={block.url} />
              </video>
              {block.caption ? <figcaption className="px-1 text-sm text-slate-500">{block.caption}</figcaption> : null}
            </figure>
          );
        }

        return (
          <figure key={block.id} className="space-y-2">
            <img
              src={block.url}
              alt={block.caption || "Ảnh trong bài viết"}
              loading="lazy"
              className="max-h-[680px] w-full rounded-[24px] border border-slate-200 bg-slate-100 object-contain shadow-sm"
            />
            {block.caption ? <figcaption className="px-1 text-sm text-slate-500">{block.caption}</figcaption> : null}
          </figure>
        );
      })}
    </div>
  );
}
