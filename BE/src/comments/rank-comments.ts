type RankableComment = {
  createdAt: Date;
  likes: unknown[];
  replies: unknown[];
};

export function rankComments<T extends RankableComment>(comments: T[]): T[] {
  return [...comments].sort((a, b) => {
    if (b.likes.length !== a.likes.length) {
      return b.likes.length - a.likes.length;
    }
    if (b.replies.length !== a.replies.length) {
      return b.replies.length - a.replies.length;
    }
    return b.createdAt.getTime() - a.createdAt.getTime();
  });
}
