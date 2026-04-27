export const CacheKeys = {
  feedPrefix: "feed:summary",
  feedBatch(limit: number, cursor: string | null, excludeId?: string | null, archiveKey?: string | null) {
    const normalizedCursor = cursor ?? "first";
    const normalizedExclude = excludeId ?? "none";
    const normalizedArchive = archiveKey ?? "all";
    return `${this.feedPrefix}:limit:${limit}:cursor:${normalizedCursor}:exclude:${normalizedExclude}:archive:${normalizedArchive}`;
  },
  postDetail(postId: string) {
    return `post:detail:${postId}`;
  },
  postCounts(postId: string) {
    return `post:counts:${postId}`;
  },
  adminUserStats() {
    return "admin:users:stats";
  }
};
