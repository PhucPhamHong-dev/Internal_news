import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import { v2 as cloudinary } from "cloudinary";
import { CacheKeys } from "../cache/cache-keys";
import { RedisService } from "../cache/redis.service";
import { AuthUser } from "../common/current-user.decorator";
import { MediaTypeEnum, NotificationTypeEnum, ReactionTypeEnum, RoleEnum } from "../common/enums";
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
  year?: number;
  month?: number;
};

type PostContentBlock =
  | { id: string; type: "paragraph"; text: string }
  | { id: string; type: "heading"; text: string }
  | { id: string; type: "quote"; text: string }
  | { id: string; type: "divider" }
  | {
      id: string;
      type: "image";
      url: string;
      thumbnailUrl?: string | null;
      publicId: string;
      thumbnailPublicId?: string | null;
      caption?: string | null;
    }
  | {
      id: string;
      type: "video";
      url: string;
      publicId: string;
      caption?: string | null;
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
    canPost: boolean;
  };
  media: Array<{
    id: string;
    type: string;
    url: string;
    thumbnailUrl?: string | null;
    publicId: string;
    thumbnailPublicId?: string | null;
    caption?: string | null;
    clientBlockId?: string | null;
    sortOrder?: number;
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
  media: Array<{ id: string; type: string; url: string; publicId: string; caption?: string | null }>;
  myReaction: ReactionTypeEnum | null;
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

type ReactionSummary = {
  postId: string;
  total: number;
  counts: Partial<Record<ReactionTypeEnum, number>>;
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
  blocks: PostContentBlock[];
  media: Array<{
    id: string;
    type: string;
    url: string;
    thumbnailUrl?: string | null;
    publicId: string;
    thumbnailPublicId?: string | null;
    caption?: string | null;
    clientBlockId?: string | null;
    sortOrder?: number;
  }>;
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
    if (!this.userCanPost(user)) {
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
        contentBlocks: this.normalizeBlocks(dto.blocks, dto.content, media),
        media: {
          create: media.map((item, index) => ({
            type: item.type,
            url: item.url,
            publicId: item.publicId,
            thumbnailUrl: item.thumbnailUrl,
            thumbnailPublicId: item.thumbnailPublicId,
            caption: item.caption,
            clientBlockId: item.clientBlockId,
            sortOrder: item.sortOrder ?? index
          }))
        }
      },
      include: {
        author: {
          select: {
            fullName: true,
            avatarUrl: true,
            role: true,
            canPost: true
          }
        },
        media: {
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          select: {
            id: true,
            type: true,
            url: true,
            thumbnailUrl: true,
            publicId: true,
            thumbnailPublicId: true,
            caption: true,
            clientBlockId: true,
            sortOrder: true
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
      likedByMe: false,
      myReaction: null
    };
  }

  async getFeed(userId: string, options: FeedOptions = {}) {
    const limit = this.normalizeFeedLimit(options.limit);
    const cursor = options.cursor ?? null;
    const excludeId = options.excludeId ?? null;
    const archiveRange = this.getArchiveDateRange(options.year, options.month);
    const archiveKey = archiveRange ? `${options.year}-${options.month ?? "all"}` : null;
    const cacheKey = CacheKeys.feedBatch(limit, cursor, excludeId, archiveKey);

    const cached = await this.redis.getJson<FeedBatchCache>(cacheKey);
    if (cached) {
      return {
        items: await this.attachLikedState(cached.items, userId),
        nextCursor: cached.nextCursor
      };
    }

    const batch = cursor
      ? await this.getNormalFeedBatch({ limit, cursor, excludeId, archiveRange })
      : await this.getFirstFeedBatch({ limit, excludeId, archiveRange });

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
              role: true,
              canPost: true
            }
          },
          media: {
            orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
            select: {
              id: true,
              type: true,
              url: true,
              thumbnailUrl: true,
              publicId: true,
              thumbnailPublicId: true,
              caption: true,
              clientBlockId: true,
              sortOrder: true
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

    const [counts, myReaction] = await Promise.all([
      this.getPostCounts(postId),
      this.getPostReaction(userId, postId)
    ]);

    return {
      ...cached,
      ...counts,
      likedByMe: Boolean(myReaction),
      myReaction
    };
  }

  async getRelatedPosts(userId: string, postId: string, limit?: number) {
    const batch = await this.getFeed(userId, {
      limit: Math.min(limit ?? 4, 6),
      excludeId: postId
    });
    return batch.items;
  }

  async getReactionSummary(postId: string): Promise<ReactionSummary> {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { id: true }
    });

    if (!post) {
      throw new NotFoundException("Post not found");
    }

    const grouped = await this.prisma.postLike.groupBy({
      by: ["reactionType"],
      where: { postId },
      _count: { _all: true }
    });

    const counts = grouped.reduce<Partial<Record<ReactionTypeEnum, number>>>((result, item) => {
      result[item.reactionType as ReactionTypeEnum] = item._count._all;
      return result;
    }, {});

    return {
      postId,
      total: grouped.reduce((sum, item) => sum + item._count._all, 0),
      counts
    };
  }

  async getArchive() {
    const groups = await this.prisma.post.groupBy({
      by: ["createdAt"],
      _count: { _all: true },
      orderBy: { createdAt: "desc" }
    });

    const years = new Map<number, Map<number, number>>();
    groups.forEach((group) => {
      const year = group.createdAt.getFullYear();
      const month = group.createdAt.getMonth() + 1;
      const months = years.get(year) ?? new Map<number, number>();
      months.set(month, (months.get(month) ?? 0) + group._count._all);
      years.set(year, months);
    });

    return Array.from(years.entries()).map(([year, months]) => ({
      year,
      total: Array.from(months.values()).reduce((sum, value) => sum + value, 0),
      months: Array.from(months.entries())
        .sort(([a], [b]) => b - a)
        .map(([month, count]) => ({ month, count }))
    }));
  }

  async updatePost(user: AuthUser, postId: string, dto: UpdatePostDto) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId }
    });
    if (!post) {
      throw new NotFoundException("Post not found");
    }

    this.ensurePostManagePermission(user, post.authorId);

    const media = dto.media ?? [];
    const updated = await this.prisma.post.update({
      where: { id: postId },
      data: {
        title: dto.title.trim(),
        content: dto.content.trim(),
        contentBlocks: dto.blocks ? this.normalizeBlocks(dto.blocks, dto.content, media) : Prisma.JsonNull,
        media: dto.media
          ? {
              deleteMany: {},
              create: media.map((item, index) => ({
                type: item.type,
                url: item.url,
                publicId: item.publicId,
                thumbnailUrl: item.thumbnailUrl,
                thumbnailPublicId: item.thumbnailPublicId,
                caption: item.caption,
                clientBlockId: item.clientBlockId,
                sortOrder: item.sortOrder ?? index
              }))
            }
          : undefined
      },
      include: {
        author: {
          select: {
            fullName: true,
            avatarUrl: true,
            role: true,
            canPost: true
          }
        },
        media: {
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          select: {
            id: true,
            type: true,
            url: true,
            thumbnailUrl: true,
            publicId: true,
            thumbnailPublicId: true,
            caption: true,
            clientBlockId: true,
            sortOrder: true
          }
        }
      }
    });

    await this.invalidatePostCaches(postId);
    const counts = await this.getPostCounts(postId);

    return {
      ...this.toPostDetailCache(updated),
      ...counts,
      likedByMe: await this.hasLikedPost(user.sub, postId),
      myReaction: await this.getPostReaction(user.sub, postId)
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
    if (!this.userCanPost(user)) {
      throw new ForbiddenException();
    }
    if (user.role !== RoleEnum.ADMIN && post.authorId !== user.sub) {
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
    if (user.role !== RoleEnum.ADMIN && post.authorId !== user.sub) {
      throw new ForbiddenException();
    }
    if (!this.userCanPost(user)) {
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
    return this.setReaction(user, postId, ReactionTypeEnum.LIKE);
  }

  async setReaction(user: AuthUser, postId: string, reactionType: ReactionTypeEnum) {
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
        data: { postId, userId: user.sub, reactionType }
      });
      await this.bumpPostCounts(postId, { likeCount: 1 });
      await this.invalidateFeedCaches();
    } else {
      await this.prisma.postLike.update({
        where: { postId_userId: { postId, userId: user.sub } },
        data: { reactionType }
      });
    }

    if ((post.author.canPost || post.author.role === RoleEnum.ADMIN) && post.authorId !== user.sub) {
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

    const counts = await this.getPostCounts(postId);
    return { ok: true, likedByMe: true, myReaction: reactionType, ...counts };
  }

  async unlikePost(userId: string, postId: string) {
    const deleted = await this.prisma.postLike.deleteMany({ where: { postId, userId } });
    if (deleted.count > 0) {
      await this.bumpPostCounts(postId, { likeCount: -1 });
      await this.invalidateFeedCaches();
    }
    const counts = await this.getPostCounts(postId);
    return { ok: true, likedByMe: false, myReaction: null, ...counts };
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
            role: true,
            canPost: true
          }
        },
        media: {
          take: 1,
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          select: {
            id: true,
            type: true,
            url: true,
            thumbnailUrl: true,
            publicId: true,
            caption: true
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

  private getArchiveDateRange(year?: number, month?: number) {
    if (!year || Number.isNaN(year)) return null;
    const safeMonth = month && !Number.isNaN(month) ? Math.min(12, Math.max(1, month)) : null;
    const start = safeMonth ? new Date(Date.UTC(year, safeMonth - 1, 1)) : new Date(Date.UTC(year, 0, 1));
    const end = safeMonth ? new Date(Date.UTC(year, safeMonth, 1)) : new Date(Date.UTC(year + 1, 0, 1));
    return { start, end };
  }

  private archiveWhere(range: { start: Date; end: Date } | null | undefined) {
    return range ? { createdAt: { gte: range.start, lt: range.end } } : {};
  }

  private async getFirstFeedBatch(options: {
    limit: number;
    excludeId: string | null;
    archiveRange: ReturnType<PostsService["getArchiveDateRange"]>;
  }): Promise<FeedBatchCache> {
    const pinnedRecords = await this.prisma.post.findMany({
      where: {
        pinPriority: { not: null },
        ...this.archiveWhere(options.archiveRange),
        ...(options.excludeId ? { id: { not: options.excludeId } } : {})
      },
      orderBy: [{ pinPriority: "asc" }, { pinnedAt: "desc" }, { createdAt: "desc" }],
      include: {
        author: {
          select: {
            fullName: true,
            avatarUrl: true,
            role: true,
            canPost: true
          }
        },
        media: {
          take: 1,
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          select: {
            id: true,
            type: true,
            url: true,
            thumbnailUrl: true,
            publicId: true,
            caption: true
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
      excludeId: options.excludeId,
      archiveRange: options.archiveRange
    });

    return {
      items: [...pinnedItems, ...normalBatch.items],
      nextCursor: normalBatch.nextCursor
    };
  }

  private async getNormalFeedBatch(options: {
    limit: number;
    cursor: string | null;
    excludeId: string | null;
    archiveRange?: ReturnType<PostsService["getArchiveDateRange"]>;
  }): Promise<FeedBatchCache> {
    const posts = await this.prisma.post.findMany({
      where: {
        pinPriority: null,
        ...this.archiveWhere(options.archiveRange),
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
            role: true,
            canPost: true
          }
        },
        media: {
          take: 1,
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          select: {
            id: true,
            type: true,
            url: true,
            thumbnailUrl: true,
            publicId: true,
            caption: true
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
    if (items.length === 0) return items.map((item) => ({ ...item, likedByMe: false, myReaction: null }));

    const reactions = await this.prisma.postLike.findMany({
      where: {
        userId,
        postId: { in: items.map((item) => item.id) }
      },
      select: { postId: true, reactionType: true }
    });

    const reactionByPost = new Map(reactions.map((item) => [item.postId, item.reactionType]));

    return items.map((item) => ({
      ...item,
      likedByMe: reactionByPost.has(item.id),
      myReaction: reactionByPost.get(item.id) ?? null
    }));
  }

  private async hasLikedPost(userId: string, postId: string) {
    const liked = await this.prisma.postLike.findUnique({
      where: { postId_userId: { postId, userId } },
      select: { id: true }
    });
    return Boolean(liked);
  }

  private async getPostReaction(userId: string, postId: string) {
    const reaction = await this.prisma.postLike.findUnique({
      where: { postId_userId: { postId, userId } },
      select: { reactionType: true }
    });
    return reaction?.reactionType ?? null;
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
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
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
      myReaction: null,
      media: post.media.map((item) => ({
        id: item.id,
        type: item.type,
        url: item.thumbnailUrl ?? item.url,
        publicId: item.publicId,
        caption: item.caption
      }))
    };
  }

  private toPostDetailCache(post: {
    id: string;
    authorId: string;
    title: string;
    content: string;
    contentBlocks?: unknown;
    createdAt: Date;
    pinPriority: number | null;
    author: { fullName: string; avatarUrl: string | null; role: string };
    media: Array<{
      id: string;
      type: string;
      url: string;
      thumbnailUrl?: string | null;
      publicId: string;
      thumbnailPublicId?: string | null;
      caption?: string | null;
      clientBlockId?: string | null;
      sortOrder?: number;
    }>;
  }): PostDetailCache {
    const media = post.media.map((item) => ({
      id: item.id,
      type: item.type,
      url: item.url,
      thumbnailUrl: item.thumbnailUrl,
      publicId: item.publicId,
      thumbnailPublicId: item.thumbnailPublicId,
      caption: item.caption,
      clientBlockId: item.clientBlockId,
      sortOrder: item.sortOrder
    }));

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
      blocks: this.resolvePostBlocks(post.contentBlocks, post.content, media),
      media
    };
  }

  private normalizeBlocks(
    blocks: unknown[] | undefined,
    content: string,
    media: Array<{
      type: MediaTypeEnum;
      url: string;
      publicId: string;
      thumbnailUrl?: string;
      thumbnailPublicId?: string;
      caption?: string;
      clientBlockId?: string;
    }>
  ): PostContentBlock[] {
    if (Array.isArray(blocks) && blocks.length > 0) {
      return blocks
        .map((block) => this.sanitizeBlock(block))
        .filter((block): block is PostContentBlock => block !== null);
    }

    return this.fallbackBlocks(
      content,
      media.map((item, index) => ({
        id: item.clientBlockId ?? `legacy-media-${index}`,
        type: item.type,
        url: item.url,
        thumbnailUrl: item.thumbnailUrl,
        publicId: item.publicId,
        thumbnailPublicId: item.thumbnailPublicId,
        caption: item.caption
      }))
    );
  }

  private resolvePostBlocks(
    rawBlocks: unknown,
    content: string,
    media: Array<{
      id: string;
      type: string;
      url: string;
      thumbnailUrl?: string | null;
      publicId: string;
      thumbnailPublicId?: string | null;
      caption?: string | null;
      clientBlockId?: string | null;
    }>
  ): PostContentBlock[] {
    if (Array.isArray(rawBlocks)) {
      const blocks = rawBlocks
        .map((block) => this.sanitizeBlock(block))
        .filter((block): block is PostContentBlock => block !== null);

      if (blocks.length > 0) {
        return blocks;
      }
    }

    return this.fallbackBlocks(
      content,
      media.map((item) => ({
        id: item.clientBlockId ?? item.id,
        type: item.type,
        url: item.url,
        thumbnailUrl: item.thumbnailUrl ?? undefined,
        publicId: item.publicId,
        thumbnailPublicId: item.thumbnailPublicId ?? undefined,
        caption: item.caption ?? undefined
      }))
    );
  }

  private sanitizeBlock(block: unknown): PostContentBlock | null {
    if (!block || typeof block !== "object") return null;
    const candidate = block as Partial<PostContentBlock> & Record<string, unknown>;
    const id = typeof candidate.id === "string" && candidate.id.trim() ? candidate.id.trim() : `block-${Date.now()}`;

    if (candidate.type === "paragraph") {
      const text = typeof candidate.text === "string" ? candidate.text.trim() : "";
      return text ? { id, type: "paragraph", text } : null;
    }

    if (candidate.type === "heading") {
      const text = typeof candidate.text === "string" ? candidate.text.trim() : "";
      return text ? { id, type: "heading", text } : null;
    }

    if (candidate.type === "quote") {
      const text = typeof candidate.text === "string" ? candidate.text.trim() : "";
      return text ? { id, type: "quote", text } : null;
    }

    if (candidate.type === "divider") {
      return { id, type: "divider" };
    }

    if (candidate.type === "image") {
      if (typeof candidate.url !== "string" || typeof candidate.publicId !== "string") return null;
      return {
        id,
        type: "image",
        url: candidate.url,
        thumbnailUrl: typeof candidate.thumbnailUrl === "string" ? candidate.thumbnailUrl : null,
        publicId: candidate.publicId,
        thumbnailPublicId: typeof candidate.thumbnailPublicId === "string" ? candidate.thumbnailPublicId : null,
        caption: typeof candidate.caption === "string" ? candidate.caption.trim() : null
      };
    }

    if (candidate.type === "video") {
      if (typeof candidate.url !== "string" || typeof candidate.publicId !== "string") return null;
      return {
        id,
        type: "video",
        url: candidate.url,
        publicId: candidate.publicId,
        caption: typeof candidate.caption === "string" ? candidate.caption.trim() : null
      };
    }

    return null;
  }

  private fallbackBlocks(
    content: string,
    media: Array<{
      id: string;
      type: string;
      url: string;
      thumbnailUrl?: string | null;
      publicId: string;
      thumbnailPublicId?: string | null;
      caption?: string | null;
    }>
  ): PostContentBlock[] {
    const blocks: PostContentBlock[] = [];
    const text = content.trim();
    if (text) {
      blocks.push({ id: "legacy-content", type: "paragraph", text });
    }

    media.forEach((item) => {
      if (item.type === MediaTypeEnum.VIDEO) {
        blocks.push({
          id: item.id,
          type: "video",
          url: item.url,
          publicId: item.publicId,
          caption: item.caption ?? null
        });
      } else {
        blocks.push({
          id: item.id,
          type: "image",
          url: item.url,
          thumbnailUrl: item.thumbnailUrl ?? null,
          publicId: item.publicId,
          thumbnailPublicId: item.thumbnailPublicId ?? null,
          caption: item.caption ?? null
        });
      }
    });

    return blocks;
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
    if (this.userCanPost(user) && user.sub === authorId) {
      return;
    }
    throw new ForbiddenException("Ban khong co quyen sua hoac xoa bai viet nay");
  }

  private userCanPost(user: Pick<AuthUser, "role" | "canPost">) {
    return user.role === RoleEnum.ADMIN || Boolean(user.canPost);
  }

  private async deleteCloudinaryAsset(publicId: string, type: string) {
    if (!publicId) {
      return;
    }
    const resourceType = type === MediaTypeEnum.VIDEO ? "video" : "image";
    await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
  }
}
