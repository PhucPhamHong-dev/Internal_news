import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { v2 as cloudinary } from "cloudinary";
import { CacheKeys } from "../cache/cache-keys";
import { RedisService } from "../cache/redis.service";
import { AuthUser } from "../common/current-user.decorator";
import { MediaTypeEnum, NotificationTypeEnum, RoleEnum } from "../common/enums";
import { NotificationsGateway } from "../notifications/notifications.gateway";
import { PrismaService } from "../prisma/prisma.service";
import { CreatePostDto } from "./dto/create-post.dto";
import { UpdatePostDto } from "./dto/update-post.dto";

const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const DEFAULT_FEED_LIMIT = 5;
const MAX_FEED_LIMIT = 10;
const FEED_CACHE_TTL_SECONDS = 120;
const POST_DETAIL_CACHE_TTL_SECONDS = 300;
const POST_COUNTER_CACHE_TTL_SECONDS = 300;

type FeedOptions = {
  limit?: number;
  cursor?: string;
  excludeId?: string;
};

type FeedSummaryRecord = {
  id: string;
  authorId: string;
  title: string;
  content: string;
  createdAt: Date;
  pinPriority: number | null;
  author: {
    fullName: string;
    avatarUrl: string | null;
    role: string;
  };
  media: Array<{
    id: string;
    type: string;
    url: string;
    thumbnailUrl?: string | null;
    publicId: string;
    thumbnailPublicId?: string | null;
  }>;
  _count: {
    likes: number;
    comments: number;
    views: number;
  };
};

type FeedSummaryItem = {
  id: string;
  authorId: string;
  title: string;
  content: string;
  authorName: string;
  authorAvatar: string | null;
  authorRole: string;
  pinPriority: number | null;
  isPinned: boolean;
  createdAt: string;
  likeCount: number;
  commentCount: number;
  viewCount: number;
  media: Array<{ id: string; type: string; url: string; publicId: string }>;
};

type FeedBatchCache = {
  items: FeedSummaryItem[];
  nextCursor: string | null;
};

type PostCounts = {
  likeCount: number;
  commentCount: number;
  viewCount: number;
};

type PostDetailCache = {
  id: string;
  authorId: string;
  title: string;
  content: string;
  authorName: string;
  authorAvatar: string | null;
  authorRole: string;
  pinPriority: number | null;
  isPinned: boolean;
  createdAt: string;
  media: Array<{ id: string; type: string; url: string; publicId: string }>;
};

@Injectable()
export class PostsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsGateway: NotificationsGateway,
    private readonly config: ConfigService,
    private readonly redis: RedisService
  ) {
    cloudinary.config({
      cloud_name: this.config.get<string>("CLOUDINARY_CLOUD_NAME"),
      api_key: this.config.get<string>("CLOUDINARY_API_KEY"),
      api_secret: this.config.get<string>("CLOUDINARY_API_SECRET")
    });
  }

  async createPost(user: AuthUser, dto: CreatePostDto) {
    if (user.role === RoleEnum.VIEWER) {
      throw new ForbiddenException("Viewer khong duoc tao bai viet");
    }

    const media = dto.media ?? [];
    for (const item of media) {
      if (item.type === MediaTypeEnum.VIDEO && item.sizeBytes && item.sizeBytes > MAX_VIDEO_BYTES) {
        throw new ForbiddenException("Video vuot qua gioi han 50MB");
      }
    }

    const post = await this.prisma.post.create({
      data: {
        authorId: user.sub,
        title: dto.title.trim(),
        content: dto.content.trim(),
        media: {
          create: media.map((item) => ({
            type: item.type,
            url: item.url,
            publicId: item.publicId,
            thumbnailUrl: item.thumbnailUrl,
            thumbnailPublicId: item.thumbnailPublicId
          }))
        }
      },
      include: {
        author: {
          select: {
            fullName: true,
            avatarUrl: true,
            role: true
          }
        },
        media: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            type: true,
            url: true,
            thumbnailUrl: true,
            publicId: true
          }
        }
      }
    });

    await this.invalidateFeedCaches();
    await this.redis.del(CacheKeys.postCounts(post.id));
    await this.redis.del(CacheKeys.postDetail(post.id));

    const counts: PostCounts = { likeCount: 0, commentCount: 0, viewCount: 0 };
    await this.redis.setJson(CacheKeys.postCounts(post.id), counts, POST_COUNTER_CACHE_TTL_SECONDS);

    return {
      ...this.toPostDetailCache(post),
      ...counts,
      likedByMe: false
    };
  }

  async getFeed(userId: string, options: FeedOptions = {}) {
    const limit = this.normalizeFeedLimit(options.limit);
    const cursor = options.cursor ?? null;
    const excludeId = options.excludeId ?? null;
    const cacheKey = CacheKeys.feedBatch(limit, cursor, excludeId);

    const cached = await this.redis.getJson<FeedBatchCache>(cacheKey);
    if (cached) {
      return {
        items: await this.attachLikedState(cached.items, userId),
        nextCursor: cached.nextCursor
      };
    }

    const batch = cursor
      ? await this.getNormalFeedBatch({ limit, cursor, excludeId })
      : await this.getFirstFeedBatch({ limit, excludeId });

    await this.redis.setJson(cacheKey, batch, FEED_CACHE_TTL_SECONDS);

    return {
      items: await this.attachLikedState(batch.items, userId),
      nextCursor: batch.nextCursor
    };
  }

  async getPostById(userId: string, postId: string) {
    const cacheKey = CacheKeys.postDetail(postId);
    let cached = await this.redis.getJson<PostDetailCache>(cacheKey);

    if (!cached) {
      const post = await this.prisma.post.findUnique({
        where: { id: postId },
        include: {
          author: {
            select: {
              fullName: true,
              avatarUrl: true,
              role: true
            }
          },
          media: {
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              type: true,
              url: true,
              thumbnailUrl: true,
              publicId: true
            }
          }
        }
      });

      if (!post) {
        throw new NotFoundException("Post not found");
      }

      cached = this.toPostDetailCache(post);
      await this.redis.setJson(cacheKey, cached, POST_DETAIL_CACHE_TTL_SECONDS);
    }

    const [counts, likedByMe] = await Promise.all([
      this.getPostCounts(postId),
      this.hasLikedPost(userId, postId)
    ]);

    return {
      ...cached,
      ...counts,
      likedByMe
    };
  }

  async getRelatedPosts(userId: string, postId: string, limit?: number) {
    const batch = await this.getFeed(userId, {
      limit: Math.min(limit ?? 4, 6),
      excludeId: postId
    });
    return batch.items;
  }

  async updatePost(user: AuthUser, postId: string, dto: UpdatePostDto) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId }
    });
    if (!post) {
      throw new NotFoundException("Post not found");
    }

    this.ensurePostManagePermission(user, post.authorId);

    const updated = await this.prisma.post.update({
      where: { id: postId },
      data: {
        title: dto.title.trim(),
        content: dto.content.trim()
      },
      include: {
        author: {
          select: {
            fullName: true,
            avatarUrl: true,
            role: true
          }
        },
        media: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            type: true,
            url: true,
            thumbnailUrl: true,
            publicId: true
          }
        }
      }
    });

    await this.invalidatePostCaches(postId);
    const counts = await this.getPostCounts(postId);

    return {
      ...this.toPostDetailCache(updated),
      ...counts,
      likedByMe: await this.hasLikedPost(user.sub, postId)
    };
  }

  async deletePost(user: AuthUser, postId: string) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      include: { media: true }
    });
    if (!post) {
      throw new NotFoundException("Post not found");
    }

    this.ensurePostManagePermission(user, post.authorId);

    await this.prisma.post.delete({ where: { id: postId } });
    await Promise.allSettled(
      post.media.flatMap((item) => [
        this.deleteCloudinaryAsset(item.publicId, item.type),
        item.thumbnailPublicId ? this.deleteCloudinaryAsset(item.thumbnailPublicId, item.type) : Promise.resolve()
      ])
    );
    await this.invalidatePostCaches(postId);

    return { ok: true };
  }

  async pinPost(user: AuthUser, postId: string) {
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post) {
      throw new NotFoundException("Post not found");
    }
    if (user.role === RoleEnum.VIEWER) {
      throw new ForbiddenException();
    }
    if (user.role === RoleEnum.WRITER && post.authorId !== user.sub) {
      throw new ForbiddenException("Writer chi duoc ghim bai cua minh");
    }
    const pinPriority = user.role === RoleEnum.ADMIN ? 1 : 2;
    const updated = await this.prisma.post.update({
      where: { id: postId },
      data: { pinPriority, pinnedAt: new Date() }
    });
    await this.invalidatePostCaches(postId);
    return updated;
  }

  async unpinPost(user: AuthUser, postId: string) {
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post) {
      throw new NotFoundException("Post not found");
    }
    if (user.role === RoleEnum.WRITER && post.authorId !== user.sub) {
      throw new ForbiddenException();
    }
    if (user.role === RoleEnum.VIEWER) {
      throw new ForbiddenException();
    }
    const updated = await this.prisma.post.update({
      where: { id: postId },
      data: { pinPriority: null, pinnedAt: null }
    });
    await this.invalidatePostCaches(postId);
    return updated;
  }

  async viewPost(userId: string, postId: string) {
    const existing = await this.prisma.postView.findUnique({
      where: { postId_userId: { postId, userId } },
      select: { id: true }
    });

    if (!existing) {
      await this.prisma.postView.create({
        data: { postId, userId }
      });
      await this.bumpPostCounts(postId, { viewCount: 1 });
      await this.invalidateFeedCaches();
    }

    return { ok: true };
  }

  async likePost(user: AuthUser, postId: string) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      include: { author: true }
    });
    if (!post) {
      throw new NotFoundException("Post not found");
    }

    const existing = await this.prisma.postLike.findUnique({
      where: { postId_userId: { postId, userId: user.sub } },
      select: { id: true }
    });

    if (!existing) {
      await this.prisma.postLike.create({
        data: { postId, userId: user.sub }
      });
      await this.bumpPostCounts(postId, { likeCount: 1 });
      await this.invalidateFeedCaches();
    }

    if (post.author.role === RoleEnum.WRITER && post.authorId !== user.sub) {
      const notification = await this.prisma.notification.create({
        data: {
          recipientId: post.authorId,
          type: NotificationTypeEnum.POST_LIKED,
          message: `${user.fullName} da tha tim bai viet cua ban`,
          metadata: { postId }
        }
      });
      this.notificationsGateway.pushToUser(post.authorId, notification);
    }

    return { ok: true };
  }

  async unlikePost(userId: string, postId: string) {
    const deleted = await this.prisma.postLike.deleteMany({ where: { postId, userId } });
    if (deleted.count > 0) {
      await this.bumpPostCounts(postId, { likeCount: -1 });
      await this.invalidateFeedCaches();
    }
    return { ok: true };
  }

  async search(userId: string, query: string) {
    const q = query.trim();
    if (!q) {
      return { results: [], suggestions: await this.latestSuggestions() };
    }

    const posts = await this.prisma.post.findMany({
      where: {
        OR: [{ title: { contains: q, mode: "insensitive" } }, { content: { contains: q, mode: "insensitive" } }]
      },
      take: 10,
      orderBy: [{ pinPriority: "asc" }, { pinnedAt: "desc" }, { createdAt: "desc" }],
      include: {
        author: {
          select: {
            fullName: true,
            avatarUrl: true,
            role: true
          }
        },
        media: {
          take: 1,
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            type: true,
            url: true,
            thumbnailUrl: true,
            publicId: true
          }
        },
        _count: { select: { likes: true, comments: true, views: true } }
      }
    });

    const summaries = await this.attachLikedState(posts.map((post) => this.toFeedSummary(post)), userId);

    return {
      results: summaries,
      suggestions: await this.latestSuggestions()
    };
  }

  createUploadSignature() {
    const timestamp = Math.floor(Date.now() / 1000);
    const folder = "internal-threads/posts";
    const signature = cloudinary.utils.api_sign_request(
      { folder, timestamp },
      this.config.get<string>("CLOUDINARY_API_SECRET", "")
    );
    return {
      cloudName: this.config.get<string>("CLOUDINARY_CLOUD_NAME"),
      apiKey: this.config.get<string>("CLOUDINARY_API_KEY"),
      folder,
      timestamp,
      signature
    };
  }

  private normalizeFeedLimit(limit?: number) {
    if (!limit || Number.isNaN(limit)) return DEFAULT_FEED_LIMIT;
    return Math.max(1, Math.min(limit, MAX_FEED_LIMIT));
  }

  private async getFirstFeedBatch(options: { limit: number; excludeId: string | null }): Promise<FeedBatchCache> {
    const pinnedRecords = await this.prisma.post.findMany({
      where: {
        pinPriority: { not: null },
        ...(options.excludeId ? { id: { not: options.excludeId } } : {})
      },
      orderBy: [{ pinPriority: "asc" }, { pinnedAt: "desc" }, { createdAt: "desc" }],
      include: {
        author: {
          select: {
            fullName: true,
            avatarUrl: true,
            role: true
          }
        },
        media: {
          take: 1,
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            type: true,
            url: true,
            thumbnailUrl: true,
            publicId: true
          }
        },
        _count: { select: { likes: true, comments: true, views: true } }
      }
    });

    const pinnedItems = pinnedRecords.map((post) => this.toFeedSummary(post));
    const normalLimit = Math.max(options.limit - pinnedItems.length, 0);

    if (normalLimit === 0) {
      return {
        items: pinnedItems.slice(0, options.limit),
        nextCursor: null
      };
    }

    const normalBatch = await this.getNormalFeedBatch({
      limit: normalLimit,
      cursor: null,
      excludeId: options.excludeId
    });

    return {
      items: [...pinnedItems, ...normalBatch.items],
      nextCursor: normalBatch.nextCursor
    };
  }

  private async getNormalFeedBatch(options: { limit: number; cursor: string | null; excludeId: string | null }): Promise<FeedBatchCache> {
    const posts = await this.prisma.post.findMany({
      where: {
        pinPriority: null,
        ...(options.excludeId ? { id: { not: options.excludeId } } : {})
      },
      take: options.limit + 1,
      ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: {
        author: {
          select: {
            fullName: true,
            avatarUrl: true,
            role: true
          }
        },
        media: {
          take: 1,
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            type: true,
            url: true,
            publicId: true
          }
        },
        _count: { select: { likes: true, comments: true, views: true } }
      }
    });

    const hasMore = posts.length > options.limit;
    const slice = hasMore ? posts.slice(0, options.limit) : posts;

    return {
      items: slice.map((post) => this.toFeedSummary(post)),
      nextCursor: hasMore ? slice[slice.length - 1]?.id ?? null : null
    };
  }

  private async attachLikedState(items: FeedSummaryItem[], userId: string) {
    if (items.length === 0) return items.map((item) => ({ ...item, likedByMe: false }));

    const likedPosts = await this.prisma.postLike.findMany({
      where: {
        userId,
        postId: { in: items.map((item) => item.id) }
      },
      select: { postId: true }
    });

    const likedIds = new Set(likedPosts.map((item) => item.postId));

    return items.map((item) => ({
      ...item,
      likedByMe: likedIds.has(item.id)
    }));
  }

  private async hasLikedPost(userId: string, postId: string) {
    const liked = await this.prisma.postLike.findUnique({
      where: { postId_userId: { postId, userId } },
      select: { id: true }
    });
    return Boolean(liked);
  }

  private async getPostCounts(postId: string): Promise<PostCounts> {
    const cacheKey = CacheKeys.postCounts(postId);
    const cached = await this.redis.getJson<PostCounts>(cacheKey);
    if (cached) return cached;

    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: {
        _count: {
          select: {
            likes: true,
            comments: true,
            views: true
          }
        }
      }
    });

    if (!post) {
      throw new NotFoundException("Post not found");
    }

    const counts: PostCounts = {
      likeCount: post._count.likes,
      commentCount: post._count.comments,
      viewCount: post._count.views
    };

    await this.redis.setJson(cacheKey, counts, POST_COUNTER_CACHE_TTL_SECONDS);
    return counts;
  }

  private async bumpPostCounts(postId: string, delta: Partial<PostCounts>) {
    const cacheKey = CacheKeys.postCounts(postId);
    const cached = await this.redis.getJson<PostCounts>(cacheKey);
    if (!cached) {
      return;
    }

    const next: PostCounts = {
      likeCount: Math.max(0, cached.likeCount + (delta.likeCount ?? 0)),
      commentCount: Math.max(0, cached.commentCount + (delta.commentCount ?? 0)),
      viewCount: Math.max(0, cached.viewCount + (delta.viewCount ?? 0))
    };

    await this.redis.setJson(cacheKey, next, POST_COUNTER_CACHE_TTL_SECONDS);
  }

  private async latestSuggestions() {
    const posts = await this.prisma.post.findMany({
      take: 5,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        content: true,
        createdAt: true,
        media: {
          take: 1,
          orderBy: { createdAt: "asc" },
          select: { url: true, thumbnailUrl: true, type: true }
        }
      }
    });

    return posts.map((post) => ({
      id: post.id,
      title: post.title,
      content: this.buildExcerpt(post.content, 120),
      createdAt: post.createdAt.toISOString(),
      thumbnailUrl: post.media[0]?.thumbnailUrl ?? post.media[0]?.url ?? null,
      thumbnailType: post.media[0]?.type ?? null
    }));
  }

  private toFeedSummary(post: FeedSummaryRecord): FeedSummaryItem {
    return {
      id: post.id,
      authorId: post.authorId,
      title: post.title,
      content: this.buildExcerpt(post.content, 240),
      authorName: post.author.fullName,
      authorAvatar: post.author.avatarUrl,
      authorRole: post.author.role,
      pinPriority: post.pinPriority,
      isPinned: post.pinPriority !== null,
      createdAt: post.createdAt.toISOString(),
      likeCount: post._count.likes,
      commentCount: post._count.comments,
      viewCount: post._count.views,
      media: post.media.map((item) => ({
        id: item.id,
        type: item.type,
        url: item.thumbnailUrl ?? item.url,
        publicId: item.publicId
      }))
    };
  }

  private toPostDetailCache(post: {
    id: string;
    authorId: string;
    title: string;
    content: string;
    createdAt: Date;
    pinPriority: number | null;
    author: { fullName: string; avatarUrl: string | null; role: string };
    media: Array<{ id: string; type: string; url: string; publicId: string; thumbnailUrl?: string | null }>;
  }): PostDetailCache {
    return {
      id: post.id,
      authorId: post.authorId,
      title: post.title,
      content: post.content,
      authorName: post.author.fullName,
      authorAvatar: post.author.avatarUrl,
      authorRole: post.author.role,
      pinPriority: post.pinPriority,
      isPinned: post.pinPriority !== null,
      createdAt: post.createdAt.toISOString(),
      media: post.media.map((item) => ({
        id: item.id,
        type: item.type,
        url: item.url,
        publicId: item.publicId
      }))
    };
  }

  private buildExcerpt(content: string, limit: number) {
    const normalized = content.trim().replace(/\s+/g, " ");
    if (normalized.length <= limit) return normalized;
    return `${normalized.slice(0, limit).trimEnd()}...`;
  }

  private async invalidateFeedCaches() {
    await this.redis.deleteByPrefix(CacheKeys.feedPrefix);
  }

  private async invalidatePostCaches(postId: string) {
    await Promise.all([
      this.invalidateFeedCaches(),
      this.redis.del(CacheKeys.postDetail(postId)),
      this.redis.del(CacheKeys.postCounts(postId))
    ]);
  }

  private ensurePostManagePermission(user: AuthUser, authorId: string) {
    if (user.role === RoleEnum.ADMIN) {
      return;
    }
    if (user.role === RoleEnum.WRITER && user.sub === authorId) {
      return;
    }
    throw new ForbiddenException("Ban khong co quyen sua hoac xoa bai viet nay");
  }

  private async deleteCloudinaryAsset(publicId: string, type: string) {
    if (!publicId) {
      return;
    }
    const resourceType = type === MediaTypeEnum.VIDEO ? "video" : "image";
    await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
  }
}
