import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Role } from "@prisma/client";
import { CacheKeys } from "../cache/cache-keys";
import { RedisService } from "../cache/redis.service";
import { NotificationTypeEnum, RoleEnum } from "../common/enums";
import { NotificationsGateway } from "../notifications/notifications.gateway";
import { PrismaService } from "../prisma/prisma.service";
import { CreatePostDto } from "../posts/dto/create-post.dto";
import { PostsService } from "../posts/posts.service";
import { generateTemporaryPassword, hashPassword } from "../auth/password.util";

type UserFilter = "ALL" | "PENDING" | "LINKED" | "ACTIVE" | "DISABLED";

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsGateway: NotificationsGateway,
    private readonly postsService: PostsService,
    private readonly redis: RedisService
  ) {}

  async broadcast(message: string) {
    const users = await this.prisma.user.findMany({ select: { id: true } });
    const notifications = await this.prisma.$transaction(
      users.map((user: { id: string }) =>
        this.prisma.notification.create({
          data: {
            recipientId: user.id,
            type: NotificationTypeEnum.ADMIN_BROADCAST,
            message
          }
        })
      )
    );
    notifications.forEach((notification: { recipientId: string; id: string; message: string; createdAt: Date }) => {
      this.notificationsGateway.pushToUser(notification.recipientId, notification);
    });
    return { sent: notifications.length };
  }

  async getCommentIdentity(commentId: string) {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      include: {
        author: { include: { employee: true } },
        post: true
      }
    });
    if (!comment) {
      throw new NotFoundException("Comment not found");
    }
    const identity = await this.prisma.anonymousIdentity.findUnique({
      where: { postId_userId: { postId: comment.postId, userId: comment.authorId } },
      include: { nickname: true }
    });
    return {
      commentId: comment.id,
      nickname: identity?.nickname.label ?? "Nguoi Bi Mat",
      fullName: comment.author.fullName,
      employeeId: comment.author.employee?.msnv ?? null,
      email: comment.author.email,
      avatarUrl: comment.author.avatarUrl,
      role: comment.author.role
    };
  }

  async listUsers(params: { page?: number; pageSize?: number; q?: string; filter?: UserFilter }) {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(Math.max(1, params.pageSize ?? 10), 20);
    const query = params.q?.trim() ?? "";
    const filter = params.filter ?? "ALL";

    const where = {
      ...(query
        ? {
            OR: [
              { fullName: { contains: query, mode: "insensitive" as const } },
              { msnv: { contains: query, mode: "insensitive" as const } },
              { linkedUser: { is: { email: { contains: query, mode: "insensitive" as const } } } }
            ]
          }
        : {}),
      ...(filter === "PENDING"
        ? { linkedUser: { is: null } }
        : filter === "LINKED"
          ? { linkedUser: { isNot: null } }
          : filter === "ACTIVE"
            ? { isActive: true }
            : filter === "DISABLED"
              ? { isActive: false }
              : {})
    };

    const [total, employees, stats] = await Promise.all([
      this.prisma.employeeMaster.count({ where }),
      this.prisma.employeeMaster.findMany({
        where,
        orderBy: { msnv: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          linkedUser: {
            select: {
              id: true,
              email: true,
              avatarUrl: true,
              role: true
            }
          }
        }
      }),
      this.getUserStats()
    ]);

    return {
      items: employees.map((employee) => this.serializeEmployee(employee)),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      stats
    };
  }

  async createUser(msnv: string, fullName: string, initialPassword?: string) {
    const existing = await this.prisma.employeeMaster.findUnique({ where: { msnv } });
    if (existing) {
      throw new BadRequestException("MSNV da ton tai");
    }

    const temporaryPassword = initialPassword || generateTemporaryPassword();
    const created = await this.prisma.employeeMaster.create({
      data: {
        msnv,
        fullName,
        preferredRole: RoleEnum.VIEWER,
        isActive: true,
        passwordHash: hashPassword(temporaryPassword),
        temporaryPasswordPreview: temporaryPassword,
        mustChangePassword: true
      },
      include: { linkedUser: true }
    });
    await this.redis.del(CacheKeys.adminUserStats());
    return this.serializeEmployee(created);
  }

  async updateUser(
    employeeId: string,
    payload: {
      fullName?: string;
      isActive?: boolean;
      preferredRole?: RoleEnum;
    }
  ) {
    const employee = await this.prisma.employeeMaster.findUnique({
      where: { id: employeeId },
      include: { linkedUser: true }
    });
    if (!employee) {
      throw new NotFoundException("Employee not found");
    }

    const updated = await this.prisma.employeeMaster.update({
      where: { id: employeeId },
      data: {
        fullName: payload.fullName ?? employee.fullName,
        isActive: payload.isActive ?? employee.isActive,
        preferredRole: payload.preferredRole ?? employee.preferredRole
      },
      include: { linkedUser: true }
    });

    if (updated.linkedUser) {
      await this.prisma.user.update({
        where: { id: updated.linkedUser.id },
        data: {
          fullName: updated.fullName,
          role: updated.linkedUser.role === RoleEnum.ADMIN ? RoleEnum.ADMIN : updated.preferredRole
        }
      });
    }

    await this.redis.del(CacheKeys.adminUserStats());
    return updated;
  }

  async unlinkGmail(employeeId: string) {
    const employee = await this.prisma.employeeMaster.findUnique({
      where: { id: employeeId },
      include: { linkedUser: true }
    });
    if (!employee) {
      throw new NotFoundException("Employee not found");
    }
    if (!employee.linkedUser) {
      return { ok: true };
    }

    await this.prisma.user.update({
      where: { id: employee.linkedUser.id },
      data: {
        email: null,
        googleSub: null,
        avatarUrl: null,
        employeeId: null,
        role: employee.linkedUser.role === RoleEnum.ADMIN ? RoleEnum.ADMIN : RoleEnum.VIEWER
      }
    });

    await this.redis.del(CacheKeys.adminUserStats());
    return { ok: true };
  }

  async resetPassword(employeeId: string, nextPassword?: string) {
    const employee = await this.prisma.employeeMaster.findUnique({
      where: { id: employeeId }
    });
    if (!employee) {
      throw new NotFoundException("Employee not found");
    }

    const temporaryPassword = nextPassword || generateTemporaryPassword();
    const updated = await this.prisma.employeeMaster.update({
      where: { id: employeeId },
      data: {
        passwordHash: hashPassword(temporaryPassword),
        temporaryPasswordPreview: temporaryPassword,
        mustChangePassword: true,
        passwordChangedAt: null
      },
      include: { linkedUser: true }
    });

    return this.serializeEmployee(updated);
  }

  async composeAsUser(employeeId: string, dto: CreatePostDto) {
    const employee = await this.prisma.employeeMaster.findUnique({
      where: { id: employeeId },
      include: { linkedUser: true }
    });
    if (!employee) {
      throw new NotFoundException("Employee not found");
    }
    if (!employee.isActive) {
      throw new BadRequestException("Tai khoan nay dang bi vo hieu hoa");
    }
    if (!employee.linkedUser) {
      throw new BadRequestException("Nhan vien nay chua lien ket Gmail");
    }

    const author = await this.prisma.user.findUnique({
      where: { id: employee.linkedUser.id },
      include: { employee: true }
    });
    if (!author) {
      throw new NotFoundException("Linked user not found");
    }

    return this.postsService.createPost(
      {
        sub: author.id,
        role: author.role,
        email: author.email ?? "",
        fullName: author.fullName,
        linkedMsnv: author.employee?.msnv ?? null
      },
      dto
    );
  }

  private async getUserStats() {
    const cached = await this.redis.getJson<{
      total: number;
      linked: number;
      pending: number;
      disabled: number;
    }>(CacheKeys.adminUserStats());

    if (cached) {
      return cached;
    }

    const [total, linked, pending, disabled] = await Promise.all([
      this.prisma.employeeMaster.count(),
      this.prisma.employeeMaster.count({ where: { linkedUser: { isNot: null } } }),
      this.prisma.employeeMaster.count({ where: { linkedUser: { is: null } } }),
      this.prisma.employeeMaster.count({ where: { isActive: false } })
    ]);

    const stats = { total, linked, pending, disabled };
    await this.redis.setJson(CacheKeys.adminUserStats(), stats, 60);
    return stats;
  }

  private serializeEmployee(employee: {
    id: string;
    msnv: string;
    fullName: string;
    isActive: boolean;
    preferredRole: Role;
    linkedUser: {
      id: string;
      email: string | null;
      avatarUrl: string | null;
      role: Role;
    } | null;
    temporaryPasswordPreview?: string | null;
    mustChangePassword?: boolean;
    passwordChangedAt?: Date | null;
  }) {
    return {
      id: employee.id,
      msnv: employee.msnv,
      fullName: employee.fullName,
      isActive: employee.isActive,
      preferredRole: employee.preferredRole,
      status: !employee.isActive ? "DISABLED" : employee.linkedUser?.email ? "LINKED" : "PENDING",
      temporaryPassword: employee.temporaryPasswordPreview ?? null,
      mustChangePassword: employee.mustChangePassword ?? false,
      passwordChangedAt: employee.passwordChangedAt?.toISOString() ?? null,
      linkedUser: employee.linkedUser
        ? {
            id: employee.linkedUser.id,
            email: employee.linkedUser.email,
            avatarUrl: employee.linkedUser.avatarUrl,
            role: employee.linkedUser.role
          }
        : null
    };
  }
}
