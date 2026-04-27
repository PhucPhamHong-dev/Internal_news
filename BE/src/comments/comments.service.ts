import { Injectable, NotFoundException } from "@nestjs/common";
import { CacheKeys } from "../cache/cache-keys";
import { RedisService } from "../cache/redis.service";
import { AuthUser } from "../common/current-user.decorator";
import { NotificationTypeEnum, RoleEnum } from "../common/enums";
import { NotificationsGateway } from "../notifications/notifications.gateway";
import { PrismaService } from "../prisma/prisma.service";

type CommentListOptions = {
  mode?: "top" | "all";
  limit?: number;
  cursor?: string;
};

type ReplyListOptions = {
  limit?: number;
  cursor?: string;
};

type RawReplyRecord = {
  id: string;
  content: string;
  createdAt: Date;
  authorId: string;
  likes: Array<{ id: string }>;
  _count: { likes: number };
};

type RawCommentRecord = {
  id: string;
  content: string;
  createdAt: Date;
  authorId: string;
  likes: Array<{ id: string }>;
  replies: RawReplyRecord[];
  _count: { likes: number; replies: number };
};

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsGateway: NotificationsGateway,
    private readonly redis: RedisService
  ) {}

  async createComment(postId: string, user: AuthUser, content: string) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      include: { author: true }
    });
    if (!post) {
      throw new NotFoundException("Post not found");
    }

    const comment = await this.prisma.comment.create({
      data: {
        postId,
        authorId: user.sub,
        content: content.trim()
      }
    });

    await this.ensureAnonymousIdentity(postId, user.sub);
    await this.bumpPostCommentCount(postId, 1);
    await this.invalidatePostCaches(postId);

    if (post.author.role === RoleEnum.WRITER && post.authorId !== user.sub) {
      const notification = await this.prisma.notification.create({
        data: {
          recipientId: post.authorId,
          type: NotificationTypeEnum.POST_COMMENTED,
          message: "Bai viet cua ban vua co binh luan moi",
          metadata: { postId, commentId: comment.id }
        }
      });
      this.notificationsGateway.pushToUser(post.authorId, notification);
    }

    return this.serializeCreatedComment(comment, postId, user.sub, null);
  }

  async createReply(parentCommentId: string, user: AuthUser, content: string) {
    const parent = await this.prisma.comment.findUnique({
      where: { id: parentCommentId }
    });
    if (!parent) {
      throw new NotFoundException("Comment not found");
    }

    const reply = await this.prisma.comment.create({
      data: {
        postId: parent.postId,
        parentId: parentCommentId,
        authorId: user.sub,
        content: content.trim()
      }
    });

    await this.ensureAnonymousIdentity(parent.postId, user.sub);
    await this.bumpPostCommentCount(parent.postId, 1);
    await this.invalidatePostCaches(parent.postId);

    if (parent.authorId !== user.sub) {
      const notification = await this.prisma.notification.create({
        data: {
          recipientId: parent.authorId,
          type: NotificationTypeEnum.COMMENT_REPLIED,
          message: "Binh luan cua ban vua co phan hoi moi",
          metadata: { postId: parent.postId, commentId: parent.id, replyId: reply.id }
        }
      });
      this.notificationsGateway.pushToUser(parent.authorId, notification);
    }

    return this.serializeCreatedComment(reply, parent.postId, user.sub, parentCommentId);
  }

  async getComments(postId: string, currentUserId: string, options: CommentListOptions = {}) {
    const post = await this.prisma.post.findUnique({ where: { id: postId }, select: { id: true } });
    if (!post) {
      throw new NotFoundException("Post not found");
    }

    const mode = options.mode === "top" ? "top" : "all";
    const limit = this.normalizeLimit(options.limit, mode === "top" ? 5 : 5, mode === "top" ? 5 : 10);

    if (mode === "top") {
      const topComments = (await this.prisma.comment.findMany({
        where: { postId, parentId: null },
        take: 40,
        orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }],
        select: this.commentSelect(currentUserId)
      })) as unknown as RawCommentRecord[];

      const ranked = [...topComments].sort((a, b) => {
        if (b._count.likes !== a._count.likes) return b._count.likes - a._count.likes;
        if (b._count.replies !== a._count.replies) return b._count.replies - a._count.replies;
        return b.createdAt.getTime() - a.createdAt.getTime();
      });

      return {
        items: await this.serializeCommentBatch(postId, currentUserId, ranked.slice(0, limit)),
        nextCursor: null
      };
    }

    const comments = (await this.prisma.comment.findMany({
      where: { postId, parentId: null },
      ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
      take: limit + 1,
      orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }],
      select: this.commentSelect(currentUserId)
    })) as unknown as RawCommentRecord[];

    const hasMore = comments.length > limit;
    const slice = hasMore ? comments.slice(0, limit) : comments;

    return {
      items: await this.serializeCommentBatch(postId, currentUserId, slice),
      nextCursor: hasMore ? slice[slice.length - 1]?.id ?? null : null
    };
  }

  async getReplies(commentId: string, currentUserId: string, options: ReplyListOptions = {}) {
    const parent = await this.prisma.comment.findUnique({
      where: { id: commentId },
      select: { id: true, postId: true }
    });
    if (!parent) {
      throw new NotFoundException("Comment not found");
    }

    const limit = this.normalizeLimit(options.limit, 3, 10);
    const replies = (await this.prisma.comment.findMany({
      where: { parentId: commentId },
      ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
      take: limit + 1,
      orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }],
      select: this.replySelect(currentUserId)
    })) as unknown as RawReplyRecord[];

    const hasMore = replies.length > limit;
    const slice = hasMore ? replies.slice(0, limit) : replies;

    return {
      items: await this.serializeReplies(parent.postId, slice),
      nextCursor: hasMore ? slice[slice.length - 1]?.id ?? null : null
    };
  }

  async likeComment(commentId: string, userId: string) {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      select: { id: true }
    });
    if (!comment) {
      throw new NotFoundException("Comment not found");
    }

    await this.prisma.commentLike.upsert({
      where: { commentId_userId: { commentId, userId } },
      update: {},
      create: { commentId, userId }
    });

    const likeCount = await this.prisma.commentLike.count({ where: { commentId } });
    return { likedByMe: true, likeCount };
  }

  async unlikeComment(commentId: string, userId: string) {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      select: { id: true }
    });
    if (!comment) {
      throw new NotFoundException("Comment not found");
    }

    await this.prisma.commentLike.deleteMany({ where: { commentId, userId } });
    const likeCount = await this.prisma.commentLike.count({ where: { commentId } });
    return { likedByMe: false, likeCount };
  }

  private commentSelect(currentUserId: string): any {
    return {
      id: true,
      content: true,
      createdAt: true,
      authorId: true,
      likes: {
        where: { userId: currentUserId },
        select: { id: true }
      },
      _count: {
        select: {
          likes: true,
          replies: true
        }
      },
      replies: {
        take: 2,
        orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }],
        select: this.replySelect(currentUserId)
      }
    };
  }

  private replySelect(currentUserId: string): any {
    return {
      id: true,
      content: true,
      createdAt: true,
      authorId: true,
      likes: {
        where: { userId: currentUserId },
        select: { id: true }
      },
      _count: {
        select: { likes: true }
      }
    };
  }

  private async serializeCommentBatch(postId: string, currentUserId: string, comments: RawCommentRecord[]) {
    const userIds = new Set<string>();
    comments.forEach((comment) => {
      userIds.add(comment.authorId);
      comment.replies.forEach((reply) => userIds.add(reply.authorId));
    });

    const nicknameMap = await this.loadNicknameMap(postId, Array.from(userIds));

    return comments.map((comment) => ({
      id: comment.id,
      content: comment.content,
      createdAt: comment.createdAt.toISOString(),
      nickname: nicknameMap.get(comment.authorId) ?? "Người bí mật",
      likeCount: comment._count.likes,
      likedByMe: comment.likes.length > 0,
      replyCount: comment._count.replies,
      replies: comment.replies.map((reply) => ({
        id: reply.id,
        content: reply.content,
        createdAt: reply.createdAt.toISOString(),
        nickname: nicknameMap.get(reply.authorId) ?? "Người bí mật",
        likeCount: reply._count.likes,
        likedByMe: reply.likes.length > 0
      })),
      hasMoreReplies: comment._count.replies > comment.replies.length,
      nextReplyCursor: comment._count.replies > comment.replies.length ? comment.replies[comment.replies.length - 1]?.id ?? null : null
    }));
  }

  private async serializeReplies(postId: string, replies: RawReplyRecord[]) {
    const nicknameMap = await this.loadNicknameMap(postId, replies.map((reply) => reply.authorId));

    return replies.map((reply) => ({
      id: reply.id,
      content: reply.content,
      createdAt: reply.createdAt.toISOString(),
      nickname: nicknameMap.get(reply.authorId) ?? "Người bí mật",
      likeCount: reply._count.likes,
      likedByMe: reply.likes.length > 0
    }));
  }

  private async serializeCreatedComment(
    comment: { id: string; postId: string; content: string; createdAt: Date },
    postId: string,
    userId: string,
    parentId: string | null
  ) {
    const nicknameMap = await this.loadNicknameMap(postId, [userId]);
    return {
      id: comment.id,
      postId,
      parentId,
      content: comment.content,
      createdAt: comment.createdAt.toISOString(),
      nickname: nicknameMap.get(userId) ?? "Người bí mật",
      likeCount: 0,
      likedByMe: false,
      replyCount: 0,
      replies: [],
      hasMoreReplies: false,
      nextReplyCursor: null
    };
  }

  private async loadNicknameMap(postId: string, userIds: string[]) {
    if (userIds.length === 0) {
      return new Map<string, string>();
    }

    const identities = await this.prisma.anonymousIdentity.findMany({
      where: {
        postId,
        userId: { in: userIds }
      },
      include: { nickname: true }
    });

    return new Map(identities.map((identity) => [identity.userId, identity.nickname.label]));
  }

  private normalizeLimit(rawLimit: number | undefined, fallback: number, max: number) {
    const limit = Number.isFinite(rawLimit) ? Number(rawLimit) : fallback;
    return Math.max(1, Math.min(limit || fallback, max));
  }

  private async ensureAnonymousIdentity(postId: string, userId: string) {
    const existing = await this.prisma.anonymousIdentity.findUnique({
      where: { postId_userId: { postId, userId } }
    });
    if (existing) {
      return existing;
    }

    const nicknames = await this.prisma.nicknamePool.findMany({ orderBy: { label: "asc" } });
    if (nicknames.length === 0) {
      throw new NotFoundException("Nickname pool is empty");
    }
    const randomNickname = nicknames[Math.floor(Math.random() * nicknames.length)];
    return this.prisma.anonymousIdentity.create({
      data: { postId, userId, nicknameId: randomNickname.id }
    });
  }

  private async bumpPostCommentCount(postId: string, amount: number) {
    const key = CacheKeys.postCounts(postId);
    const cached = await this.redis.getJson<{ likeCount: number; commentCount: number; viewCount: number }>(key);
    if (!cached) return;

    await this.redis.setJson(
      key,
      {
        ...cached,
        commentCount: Math.max(0, cached.commentCount + amount)
      },
      300
    );
  }

  private async invalidatePostCaches(postId: string) {
    await Promise.all([this.redis.deleteByPrefix(CacheKeys.feedPrefix), this.redis.del(CacheKeys.postDetail(postId))]);
  }
}
