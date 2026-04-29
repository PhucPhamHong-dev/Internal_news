import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Role } from "@prisma/client";
import { CacheKeys } from "../cache/cache-keys";
import { RedisService } from "../cache/redis.service";
import { AuthUser } from "../common/current-user.decorator";
import { NotificationTypeEnum, RoleEnum } from "../common/enums";
import { NotificationsGateway } from "../notifications/notifications.gateway";
import { PrismaService } from "../prisma/prisma.service";
import { CreatePostDto } from "../posts/dto/create-post.dto";
import { PostsService } from "../posts/posts.service";
import { generateTemporaryPassword, hashPassword } from "../auth/password.util";

type UserFilter = "ALL" | "ACTIVE" | "INACTIVE" | "DISABLED";

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
              { loginEmail: { contains: query, mode: "insensitive" as const } },
              { linkedUser: { is: { email: { contains: query, mode: "insensitive" as const } } } }
            ]
          }
        : {}),
      ...(filter === "ACTIVE"
        ? { isActive: true, activatedAt: { not: null } }
        : filter === "INACTIVE"
          ? { isActive: true, activatedAt: null }
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
              role: true,
              canPost: true,
              canManageEmployees: true
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

  async createUser(
    actor: AuthUser,
    payload: { msnv: string; fullName: string; initialPassword?: string; canPost?: boolean; canManageEmployees?: boolean }
  ) {
    const permissions = this.resolveManagedPermissions(actor, payload.canPost, payload.canManageEmployees);
    const existing = await this.prisma.employeeMaster.findUnique({ where: { msnv: payload.msnv } });
    if (existing) {
      throw new BadRequestException("MSNV da ton tai");
    }

    const temporaryPassword = payload.initialPassword || generateTemporaryPassword();
    const created = await this.prisma.employeeMaster.create({
      data: {
        msnv: payload.msnv,
        fullName: payload.fullName,
        preferredRole: this.resolveDisplayRole(permissions.canPost, permissions.canManageEmployees),
        canPost: permissions.canPost,
        canManageEmployees: permissions.canManageEmployees,
        isActive: true,
        passwordHash: hashPassword(temporaryPassword),
        temporaryPasswordPreview: temporaryPassword,
        mustChangePassword: true,
        activatedAt: null
      },
      include: { linkedUser: true }
    });
    await this.redis.del(CacheKeys.adminUserStats());
    return this.serializeEmployee(created);
  }

  async updateUser(
    actor: AuthUser,
    employeeId: string,
    payload: {
      fullName?: string;
      isActive?: boolean;
      canPost?: boolean;
      canManageEmployees?: boolean;
      loginEmail?: string | null;
    }
  ) {
    const employee = await this.prisma.employeeMaster.findUnique({
      where: { id: employeeId },
      include: { linkedUser: true }
    });
    if (!employee) {
      throw new NotFoundException("Employee not found");
    }

    const permissions = this.resolveManagedPermissions(
      actor,
      payload.canPost ?? employee.canPost,
      payload.canManageEmployees ?? employee.canManageEmployees
    );

    const normalizedLoginEmail = payload.loginEmail === undefined ? employee.loginEmail : this.normalizeLoginEmail(payload.loginEmail);
    if (normalizedLoginEmail) {
      const [emailOwner, userOwner] = await Promise.all([
        this.prisma.employeeMaster.findFirst({
          where: {
            loginEmail: normalizedLoginEmail,
            id: { not: employee.id }
          },
          select: { id: true }
        }),
        this.prisma.user.findFirst({
          where: {
            email: normalizedLoginEmail,
            id: employee.linkedUser?.id ? { not: employee.linkedUser.id } : undefined
          },
          select: { id: true }
        })
      ]);

      if (emailOwner || userOwner) {
        throw new BadRequestException("Gmail dang nhap da duoc su dung boi tai khoan khac");
      }
    }

    const updated = await this.prisma.employeeMaster.update({
      where: { id: employeeId },
      data: {
        fullName: payload.fullName ?? employee.fullName,
        isActive: payload.isActive ?? employee.isActive,
        loginEmail: normalizedLoginEmail,
        preferredRole: this.resolveDisplayRole(permissions.canPost, permissions.canManageEmployees),
        canPost: permissions.canPost,
        canManageEmployees: permissions.canManageEmployees
      },
      include: { linkedUser: true }
    });

    if (updated.linkedUser) {
      await this.prisma.user.update({
        where: { id: updated.linkedUser.id },
        data: {
          fullName: updated.fullName,
          email: updated.loginEmail,
          googleSub: updated.loginEmail === employee.loginEmail ? updated.linkedUser.googleSub : null,
          avatarUrl: updated.loginEmail === employee.loginEmail ? updated.linkedUser.avatarUrl : null,
          role: updated.linkedUser.role === RoleEnum.ADMIN ? RoleEnum.ADMIN : this.resolveDisplayRole(updated.canPost, updated.canManageEmployees),
          canPost: updated.linkedUser.role === RoleEnum.ADMIN ? updated.linkedUser.canPost : updated.canPost,
          canManageEmployees: updated.linkedUser.role === RoleEnum.ADMIN ? updated.linkedUser.canManageEmployees : updated.canManageEmployees
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

    await this.prisma.employeeMaster.update({
      where: { id: employee.id },
      data: {
        loginEmail: null
      }
    });

    await this.prisma.user.update({
      where: { id: employee.linkedUser.id },
      data: {
        email: null,
        googleSub: null,
        avatarUrl: null,
        role: employee.linkedUser.role === RoleEnum.ADMIN ? RoleEnum.ADMIN : this.resolveDisplayRole(employee.canPost, employee.canManageEmployees),
        canPost: employee.linkedUser.role === RoleEnum.ADMIN ? employee.linkedUser.canPost : employee.canPost,
        canManageEmployees: employee.linkedUser.role === RoleEnum.ADMIN ? employee.linkedUser.canManageEmployees : employee.canManageEmployees
      }
    });

    await this.redis.del(CacheKeys.adminUserStats());
    return { ok: true };
  }

  async resetPassword(employeeId: string, nextPassword: string) {
    const employee = await this.prisma.employeeMaster.findUnique({
      where: { id: employeeId }
    });
    if (!employee) {
      throw new NotFoundException("Employee not found");
    }

    const updated = await this.prisma.employeeMaster.update({
      where: { id: employeeId },
      data: {
        passwordHash: hashPassword(nextPassword),
        temporaryPasswordPreview: nextPassword,
        mustChangePassword: true
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
        canPost: author.canPost,
        canManageEmployees: author.canManageEmployees,
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
      active: number;
      inactive: number;
      disabled: number;
    }>(CacheKeys.adminUserStats());

    if (cached) {
      return cached;
    }

    const [total, active, inactive, disabled] = await Promise.all([
      this.prisma.employeeMaster.count(),
      this.prisma.employeeMaster.count({ where: { isActive: true, activatedAt: { not: null } } }),
      this.prisma.employeeMaster.count({ where: { isActive: true, activatedAt: null } }),
      this.prisma.employeeMaster.count({ where: { isActive: false } })
    ]);

    const stats = { total, active, inactive, disabled };
    await this.redis.setJson(CacheKeys.adminUserStats(), stats, 60);
    return stats;
  }

  private serializeEmployee(employee: {
    id: string;
    msnv: string;
    fullName: string;
    loginEmail?: string | null;
    isActive: boolean;
    preferredRole: Role;
    canPost: boolean;
    canManageEmployees: boolean;
    activatedAt?: Date | null;
    linkedUser: {
      id: string;
      email: string | null;
      avatarUrl: string | null;
      role: Role;
      canPost: boolean;
      canManageEmployees: boolean;
      googleSub?: string | null;
    } | null;
    temporaryPasswordPreview?: string | null;
    mustChangePassword?: boolean;
    passwordChangedAt?: Date | null;
  }) {
    return {
      id: employee.id,
      msnv: employee.msnv,
      fullName: employee.fullName,
      loginEmail: employee.loginEmail ?? null,
      isActive: employee.isActive,
      preferredRole: employee.preferredRole,
      canPost: employee.canPost,
      canManageEmployees: employee.canManageEmployees,
      roleSummary: this.getRoleSummary(employee.canPost, employee.canManageEmployees),
      status: !employee.isActive ? "DISABLED" : employee.activatedAt ? "ACTIVE" : "INACTIVE",
      activatedAt: employee.activatedAt?.toISOString() ?? null,
      temporaryPassword: employee.temporaryPasswordPreview ?? null,
      mustChangePassword: employee.mustChangePassword ?? false,
      passwordChangedAt: employee.passwordChangedAt?.toISOString() ?? null,
      linkedUser: employee.linkedUser
        ? {
            id: employee.linkedUser.id,
            email: employee.linkedUser.email,
            avatarUrl: employee.linkedUser.avatarUrl,
            role: employee.linkedUser.role,
            canPost: employee.linkedUser.canPost,
            canManageEmployees: employee.linkedUser.canManageEmployees
          }
        : null
    };
  }

  private resolveManagedPermissions(actor: AuthUser, canPost?: boolean, canManageEmployees?: boolean) {
    if (actor.role !== RoleEnum.ADMIN && !actor.canManageEmployees) {
      throw new BadRequestException("Ban khong co quyen quan ly nhan su");
    }

    if (actor.role !== RoleEnum.ADMIN) {
      return {
        canPost: false,
        canManageEmployees: false
      };
    }

    return {
      canPost: Boolean(canPost),
      canManageEmployees: Boolean(canManageEmployees)
    };
  }

  private normalizeLoginEmail(value?: string | null) {
    if (value == null) return null;
    const normalized = value.trim().toLowerCase();
    return normalized || null;
  }

  private resolveDisplayRole(canPost: boolean, canManageEmployees: boolean): RoleEnum {
    if (canPost) return RoleEnum.WRITER;
    if (canManageEmployees) return RoleEnum.HR_MANAGER;
    return RoleEnum.VIEWER;
  }

  private getRoleSummary(canPost: boolean, canManageEmployees: boolean) {
    if (canPost && canManageEmployees) return "Biên tập viên, Quản lý nhân sự";
    if (canPost) return "Biên tập viên";
    if (canManageEmployees) return "Quản lý nhân sự";
    return "Nhân viên";
  }
}
