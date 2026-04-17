import { InfiniteData, QueryClient } from "@tanstack/react-query";
import { FeedConnection, FeedPost } from "./post-shared";

type SearchPayload = {
  results: FeedPost[];
  suggestions: Array<{
    id: string;
    title: string;
    content: string;
    createdAt: string;
    thumbnailUrl: string | null;
    thumbnailType: "IMAGE" | "VIDEO" | null;
  }>;
};

type PostUpdater = (post: FeedPost) => FeedPost;

type QuerySnapshot = {
  queryKey: readonly unknown[];
  data: unknown;
};

function updatePostList(items: FeedPost[], postId: string, updater: PostUpdater) {
  let changed = false;
  const nextItems = items.map((item) => {
    if (item.id !== postId) return item;
    changed = true;
    return updater(item);
  });

  return changed ? nextItems : items;
}

function updateFeedConnection(data: InfiniteData<FeedConnection> | undefined, postId: string, updater: PostUpdater) {
  if (!data) return data;

  let changed = false;
  const pages = data.pages.map((page) => {
    const nextItems = updatePostList(page.items, postId, updater);
    if (nextItems !== page.items) {
      changed = true;
      return { ...page, items: nextItems };
    }
    return page;
  });

  return changed ? { ...data, pages } : data;
}

function updateSearchPayload(data: SearchPayload | undefined, postId: string, updater: PostUpdater) {
  if (!data) return data;
  const nextResults = updatePostList(data.results, postId, updater);
  return nextResults === data.results ? data : { ...data, results: nextResults };
}

function updateRelatedPosts(data: FeedPost[] | undefined, postId: string, updater: PostUpdater) {
  if (!data) return data;
  const nextItems = updatePostList(data, postId, updater);
  return nextItems === data ? data : nextItems;
}

function updatePostDetail(data: FeedPost | undefined, postId: string, updater: PostUpdater) {
  if (!data || data.id !== postId) return data;
  return updater(data);
}

export function capturePostQueryState(queryClient: QueryClient, postId: string) {
  const toSnapshots = (entries: [readonly unknown[], unknown][]): QuerySnapshot[] =>
    entries.map(([queryKey, data]) => ({ queryKey, data }));

  return {
    feed: toSnapshots(queryClient.getQueriesData({ queryKey: ["feed"] })),
    search: toSnapshots(queryClient.getQueriesData({ queryKey: ["search"] })),
    related: toSnapshots(queryClient.getQueriesData({ queryKey: ["post-related"] })),
    detail: toSnapshots(queryClient.getQueriesData({ queryKey: ["post-detail", postId] }))
  };
}

export function restorePostQueryState(
  queryClient: QueryClient,
  snapshot: ReturnType<typeof capturePostQueryState>
) {
  [...snapshot.feed, ...snapshot.search, ...snapshot.related, ...snapshot.detail].forEach(({ queryKey, data }) => {
    queryClient.setQueryData(queryKey, data);
  });
}

export function updatePostInQueryCache(queryClient: QueryClient, postId: string, updater: PostUpdater) {
  queryClient.setQueriesData({ queryKey: ["feed"] }, (current) => updateFeedConnection(current as InfiniteData<FeedConnection> | undefined, postId, updater));
  queryClient.setQueriesData({ queryKey: ["search"] }, (current) => updateSearchPayload(current as SearchPayload | undefined, postId, updater));
  queryClient.setQueriesData({ queryKey: ["post-related"] }, (current) => updateRelatedPosts(current as FeedPost[] | undefined, postId, updater));
  queryClient.setQueriesData({ queryKey: ["post-detail", postId] }, (current) => updatePostDetail(current as FeedPost | undefined, postId, updater));
}

export function updatePostCounters(queryClient: QueryClient, postId: string, delta: Partial<Pick<FeedPost, "likeCount" | "commentCount" | "viewCount" | "likedByMe">>) {
  updatePostInQueryCache(queryClient, postId, (post) => ({
    ...post,
    likedByMe: delta.likedByMe ?? post.likedByMe,
    likeCount: Math.max(0, delta.likeCount ?? post.likeCount),
    commentCount: Math.max(0, delta.commentCount ?? post.commentCount),
    viewCount: Math.max(0, delta.viewCount ?? post.viewCount)
  }));
}
